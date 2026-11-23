import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, logisticsDb } from './firebaseAdmin';

/**
 * Visa Paid → Logistics.
 * Every student who reaches Visa Paid (or Registered) is copied into the Logistics module's
 * Arrivals Directory (logistics database, students/{same id}). Field mapping follows the
 * Pioneer Logistics schema (same as its former syncStudentFromAiStudio Cloud Function).
 * Operational fields owned by Logistics (status, assignedOfficerId, completedStages, edited
 * flight / accommodation details) are never overwritten.
 */
const PROGRAMS = ['Language', 'Foundation', 'Diploma', 'Certificate', 'Bachelor', 'Master', 'PhD'];

const normalizeProgram = (p?: string) =>
  PROGRAMS.find((x) => x.toLowerCase() === (p || '').trim().toLowerCase()) || (p || '').trim() || 'Bachelor';

function normalizePackage(p?: string): 'Free' | '300$' | '500$' | '300$(Free)' {
  const s = (p || '').toLowerCase();
  if (s.includes('300') && s.includes('free')) return '300$(Free)';
  if (s.includes('500')) return '500$';
  if (s.includes('300')) return '300$';
  return 'Free';
}

async function upsert(id: string, s: FirebaseFirestore.DocumentData) {
  const ref = logisticsDb.doc(`students/${id}`);
  const existing = await ref.get();
  const pkg = normalizePackage(s.servicePackage);
  const identity = {
    id,
    fullName: s.name || '',
    passportNumber: (s.passportNo || '').replace(/\s+/g, '').toUpperCase(),
    nationality: s.nationality || '',
    studyIntake: s.intake || '',
    arrivalCategory: 'Student',
    studentType: 'Student',
    program: normalizeProgram(s.program),
    package: pkg,
    servicePackage: pkg,
    university: s.university || '',
    contactInfo: s.phone || '',
    email: s.email || '',
    counselor: s.counselorName || '',
    counselorId: s.counselorId || '',
    expressStage: s.stage,
    syncedFrom: 'express-tracker',
    syncedAt: FieldValue.serverTimestamp(),
  };
  if (!existing.exists) {
    await ref.set({
      ...identity,
      arrivalDate: s.arrivalDate || '',
      status: 'pending',
      completedStages: [],
      ...(s.flightNumber || s.airline ? {
        flightDetails: { airline: s.airline || '', flightNumber: s.flightNumber || '', date: s.arrivalDate || '', time: s.arrivalTime || '' },
      } : {}),
      ...(s.hotel ? { accommodationDetails: { hotelName: s.hotel } } : {}),
    });
    console.log(`[logistics-sync] added ${identity.fullName} (${id})`);
    return;
  }
  const cur = existing.data()!;
  await ref.set({
    ...identity,
    ...(!cur.arrivalDate && s.arrivalDate ? { arrivalDate: s.arrivalDate } : {}),
    ...(!cur.flightDetails && (s.flightNumber || s.airline) ? {
      flightDetails: { airline: s.airline || '', flightNumber: s.flightNumber || '', date: s.arrivalDate || '', time: s.arrivalTime || '' },
    } : {}),
    ...(!cur.accommodationDetails && s.hotel ? { accommodationDetails: { hotelName: s.hotel } } : {}),
  }, { merge: true });
}

export function startLogisticsSync() {
  const fingerprint = new Map<string, string>();
  adminDb.collection('students').where('stage', 'in', ['visa_paid', 'registered']).onSnapshot(
    (snap) => {
      for (const ch of snap.docChanges()) {
        if (ch.type === 'removed') continue;
        const d = ch.doc.data();
        const fp = JSON.stringify([d.name, d.passportNo, d.nationality, d.intake, d.program, d.servicePackage, d.university,
          d.phone, d.email, d.counselorId, d.counselorName, d.stage, d.arrivalDate, d.arrivalTime, d.airline, d.flightNumber, d.hotel]);
        if (fingerprint.get(ch.doc.id) === fp) continue;
        fingerprint.set(ch.doc.id, fp);
        upsert(ch.doc.id, d).catch((e) => console.error('[logistics-sync]', ch.doc.id, e.message));
      }
    },
    (err) => console.error('[logistics-sync] listener error', err.message),
  );
  console.log('[logistics-sync] watching Visa Paid / Registered students');
}
