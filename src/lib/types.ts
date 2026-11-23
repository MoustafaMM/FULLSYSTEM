import type { Timestamp } from 'firebase/firestore';

export type Role =
  | 'admin'
  | 'counselor'
  | 'admission'
  | 'logistics_coordinator'
  | 'logistics_team'
  | 'qc';

export interface AppUser {
  uid: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

export type Stage = 'lead' | 'predicted' | 'visa_paid' | 'registered' | 'lost';

export type DocStatus = 'missing' | 'submitted' | 'approved' | 'rejected';

export interface StudentDocument {
  status: DocStatus;
  link?: string; // Google Drive / OneDrive link to the file
  note?: string; // admission review note
  reviewedBy?: string;
  reviewedAt?: Timestamp | null;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  phone: string;
  nationality: string;
  nationalityCode: string; // ISO-2, used for the EMGS lookup
  passportNo: string;
  university: string;
  program: string;
  intake: string; // e.g. "2027-02"
  // arrival (used by Logistics)
  arrivalDate?: string; // yyyy-mm-dd
  arrivalTime?: string; // hh:mm
  airline?: string;
  flightNumber?: string;
  hotel?: string;
  servicePackage?: string; // Free | 300$ | 500$ | 300$(Free)
  counselorId: string;
  counselorName: string;
  stage: Stage;
  confidence: number; // 0..100
  expectedValue: number; // expected commission / fee (RM)
  lostReason?: string;
  visaReceiptRef?: string;
  visaPaidAt?: Timestamp | null;
  registeredAt?: Timestamp | null;
  documents: Record<string, StudentDocument>;
  nextFollowUp?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TrackerApp {
  id: string; // = studentId
  studentId: string;
  studentName: string;
  passportNo: string;
  nationality: string;
  nationalityCode: string;
  applicationNo: string;
  applicationType?: string;
  courseName?: string;
  university: string;
  counselorId: string;
  counselorName: string;
  emgsStatus: string;
  emgsPercent: number;
  progressColor?: string;
  emgsIssues?: { no: string; issue: string; status: string; comment: string; updatedAt: string }[];
  lastError?: string;
  lastChecked?: Timestamp | null;
  history: { status: string; percent: number; at: string }[];
  admissionReview: 'pending' | 'ok' | 'issue';
  admissionNote?: string;
  createdAt: Timestamp;
}

export type FollowUpType = 'call' | 'whatsapp' | 'email' | 'meeting' | 'documents';

export interface FollowUp {
  id: string;
  studentId: string;
  studentName: string;
  ownerId: string;
  dueAt: Timestamp;
  type: FollowUpType;
  note: string;
  status: 'open' | 'done';
  createdAt: Timestamp;
}

/** Logistics task (logistics database, managed by the Logistics module) — read-only view used by QC / analytics. */
export interface LogiTask {
  id: string;
  studentId?: string;
  presetId?: string;
  customTitle?: string;
  assigneeId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  taskDate?: string;
  taskTime?: string;
  createdAt: string;
  subTasks: { id: string; titleEn: string; isCompleted: boolean; isSkipped?: boolean }[];
}

export interface QcFlag {
  id: string;
  studentId: string;
  studentName: string;
  area: 'counselor' | 'admission' | 'logistics' | 'data';
  issue: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
  raisedBy: string;
  raisedByName: string;
  resolution?: string;
  createdAt: Timestamp;
  resolvedAt?: Timestamp | null;
}

export interface AuditEntry {
  id: string;
  entity: 'student' | 'tracker' | 'followup' | 'logistics' | 'qc' | 'user' | 'kb';
  entityId: string;
  action: string;
  detail: string;
  by: string;
  byName: string;
  at: Timestamp;
}

export interface KbEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
}
