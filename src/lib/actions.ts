import {
  addDoc, collection, doc, serverTimestamp, Timestamp, writeBatch, updateDoc, deleteDoc, setDoc,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { emptyDocuments, stageFromManual, STAGE_LABEL } from './pipeline';
import { api } from './api';
import type {
  AppUser, AuditEntry, DocStatus, FollowUpType, KbEntry, QcFlag, Student,
} from './types';

type Actor = Pick<AppUser, 'uid' | 'name'>;

function audit(b: WriteBatch, by: Actor, entity: AuditEntry['entity'], entityId: string, action: string, detail: string) {
  b.set(doc(collection(db, 'auditLog')), {
    entity, entityId, action, detail, by: by.uid, byName: by.name, at: serverTimestamp(),
  });
}

/* ------------------------------ Students ------------------------------ */

export interface NewStudentInput {
  name: string; email: string; phone: string; nationality: string; nationalityCode: string; passportNo: string;
  university: string; program: string; intake: string; expectedValue: number; confidence: number;
  arrivalDate: string; arrivalTime: string; airline: string; flightNumber: string; hotel: string;
  servicePackage: string; // Logistics service package: Free | 300$ | 500$ | 300$(Free)
}


export async function createStudent(by: AppUser, input: NewStudentInput, counselor?: AppUser) {
  const owner = counselor ?? by;
  const { stage, confidence } = stageFromManual(input.confidence);
  const b = writeBatch(db);
  const ref = doc(collection(db, 'students'));
  b.set(ref, {
    ...input,
    email: input.email.trim().toLowerCase(),
    stage, confidence,
    counselorId: owner.uid,
    counselorName: owner.name,
    documents: emptyDocuments(),
    nextFollowUp: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  audit(b, by, 'student', ref.id, 'created', `${input.name} added as ${STAGE_LABEL[stage]} (${confidence}%)`);
  await b.commit();
  return ref.id;
}

export async function updateStudentInfo(by: AppUser, s: Student, patch: Partial<NewStudentInput>) {
  const b = writeBatch(db);
  const { confidence: _c, ...rest } = patch;
  b.update(doc(db, 'students', s.id), { ...rest, updatedAt: serverTimestamp() });
  audit(b, by, 'student', s.id, 'edited', `Details updated for ${s.name}`);
  await b.commit();
}

export async function setConfidence(by: AppUser, s: Student, pct: number) {
  const { stage, confidence } = stageFromManual(pct);
  if (confidence === s.confidence && stage === s.stage) return;
  const b = writeBatch(db);
  b.update(doc(db, 'students', s.id), { stage, confidence, updatedAt: serverTimestamp() });
  audit(b, by, 'student', s.id, 'confidence',
    `${s.name}: ${s.confidence}% (${STAGE_LABEL[s.stage]}) → ${confidence}% (${STAGE_LABEL[stage]})`);
  await b.commit();
}

/** Predicted (80%) → Visa Paid (100%). Creates the Tracker entry; the server then adds the student to Logistics. */
export async function markVisaPaid(by: AppUser, s: Student, receiptRef: string, applicationNo: string) {
  if (s.stage !== 'predicted') throw new Error('Student must be Predicted (80%) before Visa Paid.');
  if (!receiptRef.trim()) throw new Error('Payment receipt reference is required.');
  if (!s.passportNo?.trim() || !s.nationalityCode) throw new Error('Add the passport number and nationality first — the Visa Tracker needs them for the EMGS check.');
  const b = writeBatch(db);
  b.update(doc(db, 'students', s.id), {
    stage: 'visa_paid', confidence: 100, visaReceiptRef: receiptRef.trim(),
    visaPaidAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  b.set(doc(db, 'trackerApps', s.id), {
    studentId: s.id, studentName: s.name, passportNo: s.passportNo, nationality: s.nationality,
    nationalityCode: s.nationalityCode ?? '', applicationNo: applicationNo.trim(), university: s.university,
    counselorId: s.counselorId, counselorName: s.counselorName,
    emgsStatus: 'Submitted — awaiting first check', emgsPercent: 0, lastChecked: null,
    history: [], admissionReview: 'pending', admissionNote: '', createdAt: serverTimestamp(),
  });
  // The server copies Visa Paid students into the Logistics module (Arrivals Directory) automatically.
  audit(b, by, 'student', s.id, 'visa_paid', `${s.name}: Visa Paid (receipt ${receiptRef}) → added to Tracker`);
  await b.commit();
  // First EMGS check straight away (non-blocking; the scheduled refresh retries if it fails)
  api(`/api/tracker/check/${s.id}`, 'POST').catch(() => undefined);
}

export const checkTrackerNow = (appId: string) =>
  api<{ ok: boolean; changed: boolean }>(`/api/tracker/check/${appId}`, 'POST');

export async function markRegistered(by: AppUser, s: Student) {
  if (s.stage !== 'visa_paid') throw new Error('Only Visa Paid students can be registered.');
  const b = writeBatch(db);
  b.update(doc(db, 'students', s.id), { stage: 'registered', registeredAt: serverTimestamp(), updatedAt: serverTimestamp() });
  audit(b, by, 'student', s.id, 'registered', `${s.name} confirmed registered`);
  await b.commit();
}

export async function markLost(by: AppUser, s: Student, reason: string) {
  if (!reason.trim()) throw new Error('A reason is required.');
  const b = writeBatch(db);
  b.update(doc(db, 'students', s.id), { stage: 'lost', confidence: 0, lostReason: reason.trim(), updatedAt: serverTimestamp() });
  audit(b, by, 'student', s.id, 'lost', `${s.name} marked Lost: ${reason}`);
  await b.commit();
}

export async function reopenLead(by: AppUser, s: Student) {
  const b = writeBatch(db);
  b.update(doc(db, 'students', s.id), { stage: 'lead', confidence: 10, lostReason: '', updatedAt: serverTimestamp() });
  audit(b, by, 'student', s.id, 'reopened', `${s.name} reopened as Lead`);
  await b.commit();
}

/* ------------------------------ Documents ------------------------------ */

export async function submitDocument(by: AppUser, s: Student, key: string, link: string) {
  const b = writeBatch(db);
  b.update(doc(db, 'students', s.id), {
    [`documents.${key}`]: { status: 'submitted', link: link.trim(), note: '' },
    updatedAt: serverTimestamp(),
  });
  audit(b, by, 'student', s.id, 'doc_submitted', `${s.name}: ${key} submitted`);
  await b.commit();
}

export async function reviewDocument(by: AppUser, s: Student, key: string, status: Extract<DocStatus, 'approved' | 'rejected'>, note: string) {
  const current = s.documents?.[key] ?? { status: 'missing' };
  const b = writeBatch(db);
  b.update(doc(db, 'students', s.id), {
    [`documents.${key}`]: { ...current, status, note: note.trim(), reviewedBy: by.name, reviewedAt: Timestamp.now() },
    updatedAt: serverTimestamp(),
  });
  audit(b, by, 'student', s.id, `doc_${status}`, `${s.name}: ${key} ${status}${note ? ' — ' + note : ''}`);
  await b.commit();
}

/* ------------------------------ Tracker ------------------------------ */

export async function reviewTrackerApp(by: AppUser, appId: string, studentName: string, review: 'ok' | 'issue', note: string, applicationNo?: string) {
  const b = writeBatch(db);
  b.update(doc(db, 'trackerApps', appId), {
    admissionReview: review, admissionNote: note.trim(),
    ...(applicationNo !== undefined ? { applicationNo: applicationNo.trim() } : {}),
  });
  audit(b, by, 'tracker', appId, `review_${review}`, `${studentName}: visa application ${review}${note ? ' — ' + note : ''}`);
  await b.commit();
}

/* ------------------------------ Follow-ups ------------------------------ */

export async function addFollowUp(by: AppUser, s: Pick<Student, 'id' | 'name'>, dueAt: Date, type: FollowUpType, note: string) {
  const b = writeBatch(db);
  b.set(doc(collection(db, 'followups')), {
    studentId: s.id, studentName: s.name, ownerId: by.uid, dueAt: Timestamp.fromDate(dueAt),
    type, note: note.trim(), status: 'open', createdAt: serverTimestamp(),
  });
  b.update(doc(db, 'students', s.id), { nextFollowUp: Timestamp.fromDate(dueAt), updatedAt: serverTimestamp() });
  await b.commit();
}

export async function completeFollowUp(id: string) {
  await updateDoc(doc(db, 'followups', id), { status: 'done' });
}

/* ------------------------------ Quality control ------------------------------ */

export async function raiseFlag(by: AppUser, s: Pick<Student, 'id' | 'name'>, area: QcFlag['area'], severity: QcFlag['severity'], issue: string) {
  const b = writeBatch(db);
  const ref = doc(collection(db, 'qcFlags'));
  b.set(ref, {
    studentId: s.id, studentName: s.name, area, severity, issue: issue.trim(), status: 'open',
    raisedBy: by.uid, raisedByName: by.name, createdAt: serverTimestamp(), resolvedAt: null,
  });
  audit(b, by, 'qc', ref.id, 'flag_raised', `${s.name}: [${severity}] ${issue}`);
  await b.commit();
}

export async function resolveFlag(by: AppUser, flag: QcFlag, resolution: string) {
  const b = writeBatch(db);
  b.update(doc(db, 'qcFlags', flag.id), { status: 'resolved', resolution: resolution.trim(), resolvedAt: serverTimestamp() });
  audit(b, by, 'qc', flag.id, 'flag_resolved', `${flag.studentName}: ${resolution}`);
  await b.commit();
}

/* ------------------------------ Chatbot knowledge base ------------------------------ */

export async function saveKb(entry: Omit<KbEntry, 'id'>, id?: string) {
  const data = { ...entry, keywords: entry.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean) };
  if (id) await setDoc(doc(db, 'kb', id), data);
  else await addDoc(collection(db, 'kb'), data);
}

export const deleteKb = (id: string) => deleteDoc(doc(db, 'kb', id));
