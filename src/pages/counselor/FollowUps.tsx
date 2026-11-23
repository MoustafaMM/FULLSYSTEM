import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorNote, Field, Kpi, Modal, PageHead } from '../../components/ui';
import { useMe } from '../../context/AuthContext';
import { useCollection } from '../../lib/hooks';
import { followupsQuery, studentsQuery } from '../../lib/queries';
import { addFollowUp, completeFollowUp } from '../../lib/actions';
import { fmtDate, toDate } from '../../lib/format';
import { isOpen } from '../../lib/pipeline';
import type { FollowUp, FollowUpType, Student } from '../../lib/types';

export default function FollowUps() {
  const me = useMe();
  const { data, error } = useCollection<FollowUp>(followupsQuery(me), [me.uid]);
  const { data: students } = useCollection<Student>(studentsQuery(me), [me.uid]);
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const now = Date.now();
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const open = data.filter((f) => f.status === 'open');
  const overdue = open.filter((f) => f.dueAt.toMillis() < now);
  const today = open.filter((f) => f.dueAt.toMillis() >= now && f.dueAt.toMillis() <= endToday.getTime());
  const noFollowUp = students.filter((s) => isOpen(s.stage) && !open.some((f) => f.studentId === s.id));

  const list = data.filter((f) => f.status === tab).sort((a, b) =>
    tab === 'open' ? a.dueAt.toMillis() - b.dueAt.toMillis() : b.dueAt.toMillis() - a.dueAt.toMillis());

  return (
    <>
      <PageHead title="Follow-ups" sub="Every open Lead / Predicted student should have a next follow-up."
        actions={me.role === 'counselor' && <button className="btn btn-primary" onClick={() => setAdding(true)}>+ New follow-up</button>} />
      <ErrorNote error={error || err} />
      <div className="kpis">
        <Kpi label="Overdue" value={overdue.length} tone={overdue.length ? 'bad' : 'ok'} />
        <Kpi label="Due today" value={today.length} tone="warn" />
        <Kpi label="Open" value={open.length} />
        <Kpi label="Open students with no follow-up" value={noFollowUp.length} tone={noFollowUp.length ? 'bad' : 'ok'} />
      </div>

      {noFollowUp.length > 0 && (
        <div className="alert alert-warn">
          No follow-up scheduled for: {noFollowUp.slice(0, 8).map((s, i) => (
            <span key={s.id}>{i > 0 && ', '}<Link to={`/students/${s.id}`}>{s.name}</Link></span>
          ))}{noFollowUp.length > 8 && ` +${noFollowUp.length - 8} more`}
        </div>
      )}

      <div className="chips">
        <button className={tab === 'open' ? 'chip on' : 'chip'} onClick={() => setTab('open')}>Open</button>
        <button className={tab === 'done' ? 'chip on' : 'chip'} onClick={() => setTab('done')}>Done</button>
      </div>
      {list.length === 0 ? <Empty>Nothing here.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Due</th><th>Student</th><th>Type</th><th>Note</th><th /></tr></thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.id} className={f.status === 'open' && f.dueAt.toMillis() < now ? 'row-overdue' : ''}>
                  <td>{fmtDate(f.dueAt, true)}</td>
                  <td><Link to={`/students/${f.studentId}`}>{f.studentName}</Link></td>
                  <td>{f.type}</td>
                  <td>{f.note}</td>
                  <td>{f.status === 'open' && f.ownerId === me.uid && (
                    <button className="btn btn-sm" onClick={() => completeFollowUp(f.id).catch((e) => setErr(e.message))}>Mark done</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <NewFollowUp students={students.filter((s) => isOpen(s.stage) || s.stage === 'visa_paid')} onClose={() => setAdding(false)} />}
    </>
  );
}

function NewFollowUp({ students, onClose }: { students: Student[]; onClose: () => void }) {
  const me = useMe();
  const [sid, setSid] = useState('');
  const [due, setDue] = useState('');
  const [type, setType] = useState<FollowUpType>('call');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    const s = students.find((x) => x.id === sid);
    const d = toDate(due);
    if (!s || !d) { setErr('Choose a student and a date.'); return; }
    try { await addFollowUp(me, s, d, type, note); onClose(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal title="New follow-up" onClose={onClose}>
      <ErrorNote error={err} />
      <Field label="Student"><select value={sid} onChange={(e) => setSid(e.target.value)}>
        <option value="">— choose —</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.university}</option>)}
      </select></Field>
      <Field label="Due"><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      <Field label="Type"><select value={type} onChange={(e) => setType(e.target.value as FollowUpType)}>
        <option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option>
        <option value="meeting">Meeting</option><option value="documents">Documents</option>
      </select></Field>
      <Field label="Note"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></Field>
      <div className="row gap end"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></div>
    </Modal>
  );
}
