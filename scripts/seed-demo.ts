/**
 * TEST MODE ONLY — fills the local emulators with test accounts (one per role) and sample students
 * in every pipeline stage, so every tab can be checked before going live.
 *
 *   1. npm run emulators      (terminal 1)
 *   2. npm run seed:demo      (terminal 2, once)
 *   3. npm run server         (terminal 2)
 *   4. npm run dev            (terminal 3) → http://localhost:5173
 *
 * Refuses to run against the real Firebase project.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb, syncAccess, USE_EMULATORS, type Role } from '../server/firebaseAdmin';
import { entries as kbEntries } from './kbEntries';

if (!USE_EMULATORS) {
  console.error('✖ seed:demo only runs in TEST MODE (USE_EMULATORS=true in .env). Nothing was written.');
  process.exit(1);
}

const PASSWORD = 'Test1234!';
const accounts: { email: string; name: string; role: Role }[] = [
  { email: 'admin@test.local', name: 'Admin Test', role: 'admin' },
  { email: 'counselor1@test.local', name: 'Counselor Aisha', role: 'counselor' },
  { email: 'counselor2@test.local', name: 'Counselor Omar', role: 'counselor' },
  { email: 'admission@test.local', name: 'Admission Sara', role: 'admission' },
  { email: 'coordinator@test.local', name: 'Coordinator Ali', role: 'logistics_coordinator' },
  { email: 'field1@test.local', name: 'Field Officer Hassan', role: 'logistics_team' },
  { email: 'field2@test.local', name: 'Field Officer Yusuf', role: 'logistics_team' },
  { email: 'qc@test.local', name: 'QC Mariam', role: 'qc' },
];

const uids: Record<string, string> = {};
for (const a of accounts) {
  let uid: string;
  try { uid = (await adminAuth.getUserByEmail(a.email)).uid; }
  catch { uid = (await adminAuth.createUser({ email: a.email, password: PASSWORD, displayName: a.name })).uid; }
  await adminDb.doc(`users/${uid}`).set({ uid, email: a.email, name: a.name, role: a.role, active: true, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await syncAccess(uid, { name: a.name, email: a.email, role: a.role, active: true });
  uids[a.email] = uid;
}
console.log(`✔ ${accounts.length} test accounts (password ${PASSWORD})`);

const DOC_KEYS = ['passport', 'photo', 'offer_letter', 'certificates', 'transcripts', 'english_test'];
const docs = (status: 'missing' | 'submitted' | 'approved', n = 6) =>
  Object.fromEntries(DOC_KEYS.map((k, i) => [k, i < n ? { status, link: status === 'missing' ? '' : 'https://drive.google.com/demo', note: '' } : { status: 'missing' }]));
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d; };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

type Seed = { name: string; nat: [string, string]; uni: string; program: string; stage: string; conf: number; docs: Record<string, unknown>; value: number; arrival?: number; lost?: string };
const perCounselor: Seed[][] = [
  [
    { name: 'Ahmed Hassan', nat: ['Egypt', 'EG'], uni: 'UTM', program: 'Master', stage: 'lead', conf: 30, docs: docs('missing'), value: 2500 },
    { name: 'Fatima Al-Zahra', nat: ['Yemen', 'YE'], uni: 'UPM', program: 'Bachelor', stage: 'predicted', conf: 80, docs: docs('submitted', 4), value: 3000 },
    { name: 'Mohammed Saleh', nat: ['Sudan', 'SD'], uni: 'APU', program: 'Foundation', stage: 'visa_paid', conf: 100, docs: docs('approved'), value: 2800, arrival: 5 },
    { name: 'Layla Ibrahim', nat: ['Jordan', 'JO'], uni: 'UKM', program: 'PhD', stage: 'registered', conf: 100, docs: docs('approved'), value: 4000, arrival: -10 },
    { name: 'Khaled Mansour', nat: ['Syria', 'SY'], uni: 'MMU', program: 'Diploma', stage: 'lost', conf: 0, docs: docs('missing'), value: 2000, lost: 'Chose another agent' },
  ],
  [
    { name: 'Nour Abdullah', nat: ['Iraq', 'IQ'], uni: 'UM', program: 'Master', stage: 'lead', conf: 50, docs: docs('submitted', 2), value: 3500 },
    { name: 'Youssef Karim', nat: ['Libya', 'LY'], uni: 'TAYLOR\'S', program: 'Bachelor', stage: 'predicted', conf: 80, docs: docs('approved'), value: 3200 },
    { name: 'Mariam Osman', nat: ['Somalia', 'SO'], uni: 'SEGi', program: 'Language', stage: 'visa_paid', conf: 100, docs: docs('approved', 5), value: 1800, arrival: 2 },
  ],
];
const counselorEmails = ['counselor1@test.local', 'counselor2@test.local'];
const names: Record<string, string> = Object.fromEntries(accounts.map((a) => [a.email, a.name]));

let n = 0;
for (const [ci, list] of perCounselor.entries()) {
  const cEmail = counselorEmails[ci];
  const counselorId = uids[cEmail];
  const counselorName = names[cEmail];
  for (const s of list) {
    n++;
    const id = `demo-student-${n}`;
    const passportNo = `P${String(1000000 + n * 7919).slice(0, 7)}`;
    const arrival = s.arrival !== undefined ? day(s.arrival) : null;
    await adminDb.doc(`students/${id}`).set({
      name: s.name, email: `${s.name.split(' ')[0].toLowerCase()}@example.com`, phone: `+60 12-${300 + n}${1000 + n}`,
      nationality: s.nat[0], nationalityCode: s.nat[1], passportNo, university: s.uni, program: s.program, intake: '2027-02',
      servicePackage: n % 2 ? '300$' : 'Free',
      arrivalDate: arrival ? ymd(arrival) : '', arrivalTime: arrival ? '14:30' : '', airline: arrival ? 'Malaysia Airlines' : '',
      flightNumber: arrival ? `MH${150 + n}` : '', hotel: arrival ? 'Hotel Bangi' : '',
      stage: s.stage, confidence: s.conf, expectedValue: s.value, counselorId, counselorName, documents: s.docs,
      nextFollowUp: s.stage === 'lead' || s.stage === 'predicted' ? Timestamp.fromDate(day(n % 3 === 0 ? -3 : 1)) : null,
      ...(s.lost ? { lostReason: s.lost } : {}),
      ...(s.stage === 'visa_paid' || s.stage === 'registered' ? { visaReceiptRef: `RCPT-${1000 + n}`, visaPaidAt: Timestamp.fromDate(day(-20 + n)) } : {}),
      ...(s.stage === 'registered' ? { registeredAt: Timestamp.fromDate(day(-5)) } : {}),
      createdAt: Timestamp.fromDate(day(-40 + n)), updatedAt: Timestamp.fromDate(day(s.stage === 'predicted' ? -35 : -2)),
    });
    if (s.stage === 'lead' || s.stage === 'predicted') {
      await adminDb.collection('followups').add({
        studentId: id, studentName: s.name, ownerId: counselorId, dueAt: Timestamp.fromDate(day(n % 3 === 0 ? -3 : 1)),
        type: 'whatsapp', note: 'Check documents and intake', status: 'open', createdAt: FieldValue.serverTimestamp(),
      });
    }
    if (s.stage === 'visa_paid' || s.stage === 'registered') {
      const done = s.stage === 'registered';
      await adminDb.doc(`trackerApps/${id}`).set({
        studentId: id, studentName: s.name, passportNo, nationality: s.nat[0], nationalityCode: s.nat[1],
        applicationNo: `EMGS-${200000 + n}`, university: s.uni, counselorId, counselorName,
        emgsStatus: done ? 'Visa Approval Letter Issued' : 'Application Under Review', emgsPercent: done ? 100 : 45,
        progressColor: done ? '#098136' : '#f0ad4e', lastChecked: null,
        emgsIssues: done ? [] : [{ no: '1', issue: 'Medical report unclear', status: 'Pending', comment: 'Re-upload page 2', updatedAt: ymd(day(-1)) }],
        history: [{ status: 'Application Submitted', percent: 10, at: day(-15).toISOString() }],
        admissionReview: done ? 'ok' : 'pending', admissionNote: '', createdAt: Timestamp.fromDate(day(-15)),
      });
    }
  }
}
console.log(`✔ ${n} demo students in every stage (+ follow-ups, tracker entries)`);

const kb = await adminDb.collection('kb').limit(1).get();
if (kb.empty) { for (const e of kbEntries) await adminDb.collection('kb').add(e); console.log(`✔ ${kbEntries.length} chatbot answers`); }

console.log('\nSign in at http://localhost:5173 with any of:');
for (const a of accounts) console.log(`  ${a.role.padEnd(22)} ${a.email}`);
console.log(`  password: ${PASSWORD}`);
console.log('\nStart the server (npm run server) so Visa Paid students are copied into Logistics.');
process.exit(0);
