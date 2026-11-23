import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useCollection, useDocument } from '../../lib/hooks';
import { useMe } from '../../context/AuthContext';
import { can } from '../../lib/roles';
import {
  addFollowUp, completeFollowUp, markLost, markRegistered, markVisaPaid, raiseFlag, reopenLead,
  reviewDocument, setConfidence, submitDocument,
} from '../../lib/actions';
import { DOC_STATUS_LABEL, isOpen, MAX_MANUAL, REQUIRED_DOCS } from '../../lib/pipeline';
import { fmtDate, fmtMoney, isOverdue } from '../../lib/format';
import { ConfidenceBar, Empty, ErrorNote, Field, Modal, StageBadge } from '../../components/ui';
import StudentForm from './StudentForm';
import type { AuditEntry, FollowUp, FollowUpType, LogiTask, QcFlag, Student, TrackerApp } from '../../lib/types';
import { logiTasksForStudent } from '../../lib/queries';
import { canSeeLogiView } from '../../logistics/bridge';

export default function StudentDetail() {
  const { id = '' } = useParams();
  const me = useMe();
  const { data: s, loading, error } = useDocument<Student>(doc(db, 'students', id), [id]);
  const { data: tracker } = useDocument<TrackerApp>(s && s.stage !== 'lead' && s.stage !== 'predicted' && s.stage !== 'lost' ? doc(db, 'trackerApps', id) : null, [id, s?.stage]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  if (loading) return <Empty>Loading…</Empty>;
  if (!s) return <Empty>{error || 'Student not found or you do not have access.'}</Empty>;

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); } catch (e) { setErr((e as Error).message); }
  };
  const editable = can.editPipeline(me.role) && (me.role === 'admin' || s.counselorId === me.uid);

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/students" className="muted small">← Students</Link>
          <h1>{s.name} <StageBadge stage={s.stage} /></h1>
          <p className="muted">{s.university} · {s.program || '—'} · Intake {s.intake || '—'} · Counselor {s.counselorName}</p>
        </div>
        {editable && <button className="btn btn-ghost" onClick={() => setEditing(true)}>Edit details</button>}
      </div>
      <ErrorNote error={err} />

      <div className="grid-2">
        <section className="card">
          <h2>Pipeline</h2>
          <ConfidenceBar value={s.confidence} stage={s.stage} />
          <dl className="dl">
            <dt>Expected value</dt><dd>{fmtMoney(s.expectedValue)}</dd>
            <dt>Phone</dt><dd>{s.phone}</dd>
            <dt>Email</dt><dd>{s.email || '—'}</dd>
            <dt>Nationality</dt><dd>{s.nationality}</dd>
            <dt>Passport</dt><dd>{s.passportNo || '—'}</dd>
            <dt>Arrival</dt><dd>{s.arrivalDate ? `${s.arrivalDate} ${s.arrivalTime ?? ''}` : '—'}{s.flightNumber && ` · ${s.airline ?? ''} ${s.flightNumber}`}</dd>
            <dt>Accommodation</dt><dd>{s.hotel || '—'}</dd>
            {s.visaReceiptRef && <><dt>Visa receipt</dt><dd>{s.visaReceiptRef} · {fmtDate(s.visaPaidAt)}</dd></>}
            {s.registeredAt && <><dt>Registered</dt><dd>{fmtDate(s.registeredAt)}</dd></>}
            {s.stage === 'lost' && <><dt>Lost reason</dt><dd>{s.lostReason}</dd></>}
          </dl>
          {editable && isOpen(s.stage) && <PipelineControls s={s} run={run} />}
          {editable && s.stage === 'lost' && (
            <button className="btn btn-ghost" onClick={() => run(() => reopenLead(me, s))}>Reopen as Lead</button>
          )}
          {can.reviewAdmission(me.role) && s.stage === 'visa_paid' && (
            <button className="btn btn-ok" onClick={() => confirm(`Confirm ${s.name} is registered at ${s.university}?`) && run(() => markRegistered(me, s))}>
              Confirm Registered ✓
            </button>
          )}
          {tracker && (
            <div className="tracker-mini">
              <strong>Visa Tracker:</strong> {tracker.emgsStatus} ({tracker.emgsPercent}%) · checked {fmtDate(tracker.lastChecked, true)}
              <div className="muted small">Admission review: {tracker.admissionReview}{tracker.admissionNote ? ` — ${tracker.admissionNote}` : ''}</div>
              {(tracker.emgsIssues ?? []).length > 0 && (
                <ul className="issues">{tracker.emgsIssues!.map((i, k) => <li key={k}><strong>{i.issue}</strong> — {i.status}{i.comment && `: ${i.comment}`}</li>)}</ul>
              )}
            </div>
          )}
        </section>

        <DocumentsCard s={s} run={run} />
      </div>

      <div className="grid-2">
        {(me.role === 'counselor' || me.role === 'admin') && <FollowUpsCard s={s} run={run} />}
        <LogisticsCard s={s} />
      </div>
      <div className="grid-2">
        <FlagsCard s={s} run={run} />
        {can.seeAudit(me.role) && <AuditCard id={s.id} />}
      </div>
      {editing && <StudentForm student={s} onClose={() => setEditing(false)} />}
    </>
  );
}

type Run = (fn: () => Promise<unknown>) => Promise<void>;

function PipelineControls({ s, run }: { s: Student; run: Run }) {
  const me = useMe();
  const [pct, setPct] = useState(s.confidence);
  const [visa, setVisa] = useState(false);
  const [lost, setLost] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [appNo, setAppNo] = useState('');
  const [reason, setReason] = useState('');

  return (
    <div className="controls">
      <Field label={`Confidence of confirmation: ${pct}%${pct >= MAX_MANUAL ? ' (Predicted)' : ' (Lead)'}`}>
        <input type="range" min={0} max={MAX_MANUAL} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} />
      </Field>
      <div className="row gap wrap">
        <button className="btn btn-primary" disabled={pct === s.confidence} onClick={() => run(() => setConfidence(me, s, pct))}>Save confidence</button>
        <button className="btn btn-info" disabled={s.stage !== 'predicted'} title={s.stage !== 'predicted' ? 'Reach 80% (Predicted) first' : ''} onClick={() => setVisa(true)}>
          Record Visa Payment → 100%
        </button>
        <button className="btn btn-danger-ghost" onClick={() => setLost(true)}>Mark Lost</button>
      </div>

      {visa && (
        <Modal title="Record visa payment" onClose={() => setVisa(false)}>
          <p className="muted">Sets {s.name} to <strong>Visa Paid (100%)</strong>, adds the application to the Visa Tracker (first EMGS check runs immediately) and adds the student to the Logistics Arrivals Directory.</p>
          {(!s.passportNo || !s.nationalityCode) && <div className="alert alert-warn">Passport number and nationality are missing — edit the student details first.</div>}
          <Field label="Payment receipt / reference *"><input value={receipt} onChange={(e) => setReceipt(e.target.value)} autoFocus /></Field>
          <Field label="EMGS application no. (if known)"><input value={appNo} onChange={(e) => setAppNo(e.target.value)} /></Field>
          <div className="row gap end">
            <button className="btn btn-ghost" onClick={() => setVisa(false)}>Cancel</button>
            <button className="btn btn-info" disabled={!receipt.trim()} onClick={() => run(async () => { await markVisaPaid(me, s, receipt, appNo); setVisa(false); })}>Confirm Visa Paid</button>
          </div>
        </Modal>
      )}
      {lost && (
        <Modal title="Mark as lost" onClose={() => setLost(false)}>
          <Field label="Reason *">
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">— choose —</option>
              <option>Chose another agent</option>
              <option>Chose another country</option>
              <option>Financial reasons</option>
              <option>Not qualified / rejected by university</option>
              <option>No response</option>
              <option>Other</option>
            </select>
          </Field>
          <div className="row gap end">
            <button className="btn btn-ghost" onClick={() => setLost(false)}>Cancel</button>
            <button className="btn btn-danger" disabled={!reason} onClick={() => run(async () => { await markLost(me, s, reason); setLost(false); })}>Mark Lost</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DocumentsCard({ s, run }: { s: Student; run: Run }) {
  const me = useMe();
  const isOwner = (me.role === 'counselor' && s.counselorId === me.uid) || me.role === 'admin';
  const reviewer = can.reviewAdmission(me.role);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  return (
    <section className="card">
      <h2>Documents</h2>
      <table className="compact">
        <tbody>
          {REQUIRED_DOCS.map(({ key, label }) => {
            const d = s.documents?.[key] ?? { status: 'missing' as const };
            return (
              <tr key={key}>
                <td><strong>{label}</strong>
                  {d.link && <div><a href={d.link} target="_blank" rel="noreferrer" className="small">Open file ↗</a></div>}
                  {d.note && <div className="muted small">Note: {d.note}</div>}
                </td>
                <td><span className={`badge doc-${d.status}`}>{DOC_STATUS_LABEL[d.status]}</span></td>
                <td className="row gap wrap">
                  {isOwner && (d.status === 'missing' || d.status === 'rejected') && (
                    <>
                      <input placeholder="Drive link" value={links[key] ?? ''} onChange={(e) => setLinks({ ...links, [key]: e.target.value })} />
                      <button className="btn btn-sm" disabled={!links[key]} onClick={() => run(() => submitDocument(me, s, key, links[key]))}>Submit</button>
                    </>
                  )}
                  {reviewer && d.status === 'submitted' && (
                    <>
                      <input placeholder="Note (required to reject)" value={notes[key] ?? ''} onChange={(e) => setNotes({ ...notes, [key]: e.target.value })} />
                      <button className="btn btn-sm btn-ok" onClick={() => run(() => reviewDocument(me, s, key, 'approved', notes[key] ?? ''))}>Approve</button>
                      <button className="btn btn-sm btn-danger" disabled={!notes[key]} onClick={() => run(() => reviewDocument(me, s, key, 'rejected', notes[key] ?? ''))}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function FollowUpsCard({ s, run }: { s: Student; run: Run }) {
  const me = useMe();
  const q = me.role === 'admin'
    ? query(collection(db, 'followups'), where('studentId', '==', s.id))
    : query(collection(db, 'followups'), where('studentId', '==', s.id), where('ownerId', '==', me.uid));
  const { data } = useCollection<FollowUp>(q, [s.id, me.uid]);
  const [due, setDue] = useState('');
  const [type, setType] = useState<FollowUpType>('call');
  const [note, setNote] = useState('');
  const list = [...data].sort((a, b) => a.dueAt.toMillis() - b.dueAt.toMillis());

  return (
    <section className="card">
      <h2>Follow-ups</h2>
      {list.length === 0 ? <p className="muted">No follow-ups yet.</p> : (
        <ul className="list">
          {list.map((f) => (
            <li key={f.id} className={f.status === 'done' ? 'done' : isOverdue(f.dueAt) ? 'overdue' : ''}>
              <span><strong>{f.type}</strong> · {fmtDate(f.dueAt, true)} — {f.note}</span>
              {f.status === 'open' && f.ownerId === me.uid && <button className="btn btn-sm" onClick={() => run(() => completeFollowUp(f.id))}>Done</button>}
            </li>
          ))}
        </ul>
      )}
      {me.uid === s.counselorId && (
        <div className="row gap wrap">
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          <select value={type} onChange={(e) => setType(e.target.value as FollowUpType)}>
            <option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option>
            <option value="meeting">Meeting</option><option value="documents">Documents</option>
          </select>
          <input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={!due} onClick={() => run(async () => { await addFollowUp(me, s, new Date(due), type, note); setDue(''); setNote(''); })}>Add</button>
        </div>
      )}
    </section>
  );
}

function LogisticsCard({ s }: { s: Student }) {
  const me = useMe();
  const { data } = useCollection<LogiTask>(s.stage === 'visa_paid' || s.stage === 'registered' ? logiTasksForStudent(s.id) : null, [s.id, s.stage]);
  const label = { pending: 'pending', in_progress: 'in progress', completed: 'done', cancelled: 'cancelled' } as const;
  const canOpen = canSeeLogiView(me.role, 'student_profile');
  return (
    <section className="card">
      <h2>Logistics</h2>
      {s.stage !== 'visa_paid' && s.stage !== 'registered' ? <p className="muted">The student is added to Logistics automatically when the visa payment is recorded.</p>
        : data.length === 0 ? <p className="muted">In the Arrivals Directory — no tasks dispatched yet.</p> : (
        <ul className="list">
          {data.map((t) => {
            const done = (t.subTasks ?? []).filter((x) => x.isCompleted || x.isSkipped).length;
            return (
              <li key={t.id}><span><strong>{t.customTitle || t.presetId || 'Task'}</strong> · {t.taskDate || '—'} {t.taskTime || ''} · {done}/{(t.subTasks ?? []).length} steps</span>
                <span className={`badge task-${t.status === 'completed' ? 'done' : t.status}`}>{label[t.status] ?? t.status}</span></li>
            );
          })}
        </ul>
      )}
      {canOpen && (s.stage === 'visa_paid' || s.stage === 'registered') && <Link to={`/logistics/student/${s.id}`} className="small">Open logistics profile →</Link>}
    </section>
  );
}

function FlagsCard({ s, run }: { s: Student; run: Run }) {
  const me = useMe();
  const { data } = useCollection<QcFlag>(query(collection(db, 'qcFlags'), where('studentId', '==', s.id)), [s.id]);
  const [issue, setIssue] = useState('');
  const [area, setArea] = useState<QcFlag['area']>('counselor');
  const [sev, setSev] = useState<QcFlag['severity']>('medium');
  return (
    <section className="card">
      <h2>Quality flags</h2>
      {data.length === 0 ? <p className="muted">No flags.</p> : (
        <ul className="list">
          {data.map((f) => (
            <li key={f.id} className={f.status === 'resolved' ? 'done' : ''}>
              <span><span className={`badge sev-${f.severity}`}>{f.severity}</span> {f.area}: {f.issue}
                {f.resolution && <span className="muted"> — resolved: {f.resolution}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      {can.raiseQc(me.role) && (
        <div className="row gap wrap">
          <select value={area} onChange={(e) => setArea(e.target.value as QcFlag['area'])}>
            <option value="counselor">Counselor</option><option value="admission">Admission</option>
            <option value="logistics">Logistics</option><option value="data">Data</option>
          </select>
          <select value={sev} onChange={(e) => setSev(e.target.value as QcFlag['severity'])}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
          <input placeholder="Issue" value={issue} onChange={(e) => setIssue(e.target.value)} />
          <button className="btn btn-sm btn-primary" disabled={!issue} onClick={() => run(async () => { await raiseFlag(me, s, area, sev, issue); setIssue(''); })}>Raise flag</button>
        </div>
      )}
    </section>
  );
}

function AuditCard({ id }: { id: string }) {
  const { data } = useCollection<AuditEntry>(query(collection(db, 'auditLog'), where('entityId', '==', id)), [id]);
  const list = [...data].sort((a, b) => (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0));
  return (
    <section className="card">
      <h2>History</h2>
      <ul className="list timeline">
        {list.map((a) => <li key={a.id}><span className="muted small">{fmtDate(a.at, true)} · {a.byName}</span><span>{a.detail}</span></li>)}
      </ul>
    </section>
  );
}
