import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, logisticsDb, ROLES, syncAccess, type Role } from './firebaseAdmin';
import { startLogisticsSync } from './logisticsSync';
import { checkEmgsStatus } from './emgs';


interface Caller { uid: string; name: string; role: Role }
type AuthedRequest = Request & { caller?: Caller };

const app = express();
app.use(express.json({ limit: '1mb' }));

/* ---------------- auth middleware ---------------- */
function requireRole(...roles: Role[]) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      if (!token) return res.status(401).json({ error: 'Not signed in' });
      const decoded = await adminAuth.verifyIdToken(token);
      const snap = await adminDb.doc(`users/${decoded.uid}`).get();
      const u = snap.data();
      if (!u || u.active === false || !roles.includes(u.role)) return res.status(403).json({ error: 'Not allowed' });
      req.caller = { uid: decoded.uid, name: u.name, role: u.role };
      next();
    } catch {
      res.status(401).json({ error: 'Invalid session' });
    }
  };
}

async function audit(by: Caller, entity: string, entityId: string, action: string, detail: string) {
  await adminDb.collection('auditLog').add({
    entity, entityId, action, detail, by: by.uid, byName: by.name, at: FieldValue.serverTimestamp(),
  });
}

/* ---------------- users (admin) ---------------- */
app.post('/api/users', requireRole('admin'), async (req: AuthedRequest, res) => {
  const { email, password, name, role } = req.body ?? {};
  if (!email || !password || !name || !ROLES.includes(role)) return res.status(400).json({ error: 'name, email, password and a valid role are required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const lower = String(email).trim().toLowerCase();
    const user = await adminAuth.createUser({ email: lower, password, displayName: name });
    await adminDb.doc(`users/${user.uid}`).set({ uid: user.uid, email: lower, name, role, active: true, createdAt: FieldValue.serverTimestamp() });
    await syncAccess(user.uid, { name, email: lower, role, active: true });
    await audit(req.caller!, 'user', user.uid, 'created', `${name} (${lower}) created as ${role}`);
    res.json({ uid: user.uid });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.patch('/api/users/:uid', requireRole('admin'), async (req: AuthedRequest, res) => {
  const { uid } = req.params;
  const { role, active, name } = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (role !== undefined) { if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' }); patch.role = role; }
  if (active !== undefined) patch.active = !!active;
  if (name !== undefined) patch.name = String(name);
  if (uid === req.caller!.uid && (patch.role && patch.role !== 'admin' || patch.active === false))
    return res.status(400).json({ error: 'You cannot remove your own admin access' });
  try {
    await adminDb.doc(`users/${uid}`).update(patch);
    const after = (await adminDb.doc(`users/${uid}`).get()).data()!;
    await syncAccess(uid, { name: after.name, email: after.email, role: after.role, active: after.active !== false });
    if (patch.active !== undefined) {
      await adminAuth.updateUser(uid, { disabled: !patch.active });
      if (!patch.active) await adminAuth.revokeRefreshTokens(uid);
    }
    await audit(req.caller!, 'user', uid, 'updated', JSON.stringify(patch));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/* ---------------- EMGS tracker refresh ---------------- */
/** Check one tracker application on EMGS and save the result. Returns true if status/progress changed. */
async function checkOne(ref: FirebaseFirestore.DocumentReference, a: FirebaseFirestore.DocumentData) {
  const result = await checkEmgsStatus({ passportNo: a.passportNo, nationality: a.nationality, nationalityCode: a.nationalityCode });
  if (!result) {
    await ref.update({ lastChecked: FieldValue.serverTimestamp(), lastError: 'EMGS unreachable or blocked — will retry' });
    return { ok: false, changed: false };
  }
  const percent = result.percent ?? (a.emgsPercent ?? 0);
  const status = result.notFound ? 'No Record Found' : result.status;
  const update: Record<string, unknown> = {
    lastChecked: FieldValue.serverTimestamp(),
    lastError: '',
    progressColor: result.progressColor,
    emgsIssues: result.issues,
    emgsDetails: result.details,
    ...(result.applicationNo && !a.applicationNo ? { applicationNo: result.applicationNo } : {}),
    ...(result.applicationType ? { applicationType: result.applicationType } : {}),
    ...(result.courseName ? { courseName: result.courseName } : {}),
  };
  const changed = status !== a.emgsStatus || percent !== a.emgsPercent;
  if (changed) {
    update.emgsStatus = status;
    update.emgsPercent = percent;
    update.history = FieldValue.arrayUnion({ status, percent, at: new Date().toISOString() });
  }
  await ref.update(update);
  return { ok: true, changed };
}

let running = false;
async function runTrackerCycle() {
  if (running) return { checked: 0, changed: 0, failed: 0, skipped: true };
  running = true;
  let checked = 0, changed = 0, failed = 0;
  try {
    // Approved (100%) applications are no longer checked
    const snap = await adminDb.collection('trackerApps').where('emgsPercent', '<', 100).get();
    for (const d of snap.docs) {
      const r = await checkOne(d.ref, d.data());
      checked++;
      if (r.changed) changed++;
      if (!r.ok) failed++;
      await new Promise((res) => setTimeout(res, 2500)); // be gentle with EMGS (WAF)
    }
  } finally {
    running = false;
  }
  return { checked, changed, failed };
}

app.post('/api/tracker/refresh', requireRole('admin', 'admission'), async (_req, res) => {
  try { res.json(await runTrackerCycle()); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** Check a single application now (counselors only their own). Called right after Visa Paid. */
app.post('/api/tracker/check/:id', requireRole('admin', 'admission', 'counselor'), async (req: AuthedRequest, res) => {
  try {
    const ref = adminDb.doc(`trackerApps/${req.params.id}`);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Application not found' });
    const a = snap.data()!;
    if (req.caller!.role === 'counselor' && a.counselorId !== req.caller!.uid) return res.status(403).json({ error: 'Not allowed' });
    res.json(await checkOne(ref, a));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

const minutes = Number(process.env.TRACKER_INTERVAL_MIN ?? 60);
if (minutes > 0) {
  setInterval(() => runTrackerCycle().catch((e) => console.error('[tracker]', e)), minutes * 60_000);
  console.log(`[tracker] auto-refresh every ${minutes} min`);
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* ---------------- push notifications service worker (config from env, never hard-coded) ---------------- */
app.get('/firebase-messaging-sw.js', (_req, res) => {
  const cfg = {
    apiKey: process.env.VITE_FIREBASE_API_KEY, authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID, storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: process.env.VITE_FIREBASE_APP_ID,
  };
  const tpl = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'firebase-messaging-sw.template.js'), 'utf8');
  res.type('application/javascript').set('Cache-Control', 'no-cache').send(tpl.replace('__FIREBASE_CONFIG__', JSON.stringify(cfg)));
});

/* ---------------- serve the built frontend ---------------- */
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

if (process.env.LOGISTICS_SYNC !== 'off') startLogisticsSync();
void logisticsDb;

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Express Tracker server on http://localhost:${port}`));
