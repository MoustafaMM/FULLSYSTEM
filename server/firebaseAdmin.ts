import 'dotenv/config';
import { cert, initializeApp, applicationDefault, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/** TEST MODE: point the Admin SDK at the local Firebase emulators (no service account needed). */
export const USE_EMULATORS = process.env.USE_EMULATORS === 'true';
if (USE_EMULATORS) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';
}

if (!getApps().length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  initializeApp(USE_EMULATORS
    ? { projectId }
    : { credential: raw ? cert(JSON.parse(raw)) : applicationDefault(), projectId }); // GOOGLE_APPLICATION_CREDENTIALS fallback
  if (USE_EMULATORS) console.log('[firebase] TEST MODE — Admin SDK using local emulators');
}

export const LOGISTICS_DB_ID = process.env.LOGISTICS_DB_ID || 'logistics';

export const adminAuth = getAuth();
/** (default) database — pipeline, tracker, admission, QC, chatbot */
export const adminDb = getFirestore();
/** named database — Logistics module (tasks, wallet, vehicles, feedback, …) */
export const logisticsDb = getFirestore(getApp(), LOGISTICS_DB_ID);

export const ROLES = ['admin', 'counselor', 'admission', 'logistics_coordinator', 'logistics_team', 'qc'] as const;
export type Role = (typeof ROLES)[number];

/** Express Tracker role → Logistics module role (keep in sync with src/logistics/bridge.ts) */
export const LOGI_ROLE: Record<Role, string> = {
  admin: 'admin',
  logistics_coordinator: 'coordinator',
  logistics_team: 'field_officer',
  counselor: 'counselor',
  admission: 'counselor_manager',
  qc: 'counselor_manager',
};

/** Role + active flag go into Firebase Auth custom claims, so BOTH databases' security rules can use them. */
export async function syncAccess(uid: string, u: { name: string; email: string; role: Role; active: boolean }) {
  await adminAuth.setCustomUserClaims(uid, { role: u.role, active: u.active });
  await logisticsDb.doc(`users/${uid}`).set(
    { name: u.name, username: u.email, role: LOGI_ROLE[u.role], etRole: u.role, active: u.active },
    { merge: true },
  );
}
