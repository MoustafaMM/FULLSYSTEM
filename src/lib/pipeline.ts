import type { Stage, Student, DocStatus } from './types';

/** Highest confidence a counselor can enter by hand. Reaching it = "Predicted". */
export const MAX_MANUAL = 80;

export const STAGES: Stage[] = ['lead', 'predicted', 'visa_paid', 'registered', 'lost'];

export const STAGE_LABEL: Record<Stage, string> = {
  lead: 'Lead',
  predicted: 'Predicted',
  visa_paid: 'Visa Paid',
  registered: 'Registered',
  lost: 'Lost',
};

/** Rules
 *  Lead       0–79 %  counselor enters by hand
 *  Predicted  80 %    counselor sets 80 (the cap)
 *  Visa Paid  100 %   recorded with receipt ref → added to Tracker automatically
 *  Registered Done    confirmed by Admission
 *  Lost       0 %     reason required
 */
export function stageFromManual(pct: number): { stage: Stage; confidence: number } {
  const confidence = Math.max(0, Math.min(MAX_MANUAL, Math.round(pct)));
  return { stage: confidence >= MAX_MANUAL ? 'predicted' : 'lead', confidence };
}

export const isOpen = (s: Stage) => s === 'lead' || s === 'predicted';

export function weightedForecast(students: Student[]): number {
  return students
    .filter((s) => s.stage !== 'lost')
    .reduce((sum, s) => sum + (s.confidence / 100) * (s.expectedValue || 0), 0);
}

export const REQUIRED_DOCS: { key: string; label: string }[] = [
  { key: 'passport', label: 'Passport (all pages)' },
  { key: 'photo', label: 'Passport photo' },
  { key: 'offer_letter', label: 'Offer letter' },
  { key: 'certificates', label: 'Academic certificates' },
  { key: 'transcripts', label: 'Transcripts' },
  { key: 'english_test', label: 'English test result' },
];

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  missing: 'Missing',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
};

export function emptyDocuments() {
  return Object.fromEntries(REQUIRED_DOCS.map((d) => [d.key, { status: 'missing' as DocStatus }]));
}

export function docsProgress(s: Student) {
  const total = REQUIRED_DOCS.length;
  const approved = REQUIRED_DOCS.filter((d) => s.documents?.[d.key]?.status === 'approved').length;
  return { approved, total };
}
