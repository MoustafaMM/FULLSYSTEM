import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorNote, Kpi, PageHead, StageBadge } from '../../components/ui';
import { useMe } from '../../context/AuthContext';
import { useCollection } from '../../lib/hooks';
import { studentsQuery } from '../../lib/queries';
import { reviewDocument } from '../../lib/actions';
import { REQUIRED_DOCS, docsProgress } from '../../lib/pipeline';
import type { Student } from '../../lib/types';

export default function DocumentReview() {
  const me = useMe();
  const { data: students, error } = useCollection<Student>(studentsQuery(me), [me.uid]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const queue = students.flatMap((s) =>
    REQUIRED_DOCS.filter((d) => s.documents?.[d.key]?.status === 'submitted').map((d) => ({ s, key: d.key, label: d.label })));
  const readyForVisa = students.filter((s) => s.stage === 'predicted' && docsProgress(s).approved === REQUIRED_DOCS.length);
  const rejected = students.reduce((n, s) => n + REQUIRED_DOCS.filter((d) => s.documents?.[d.key]?.status === 'rejected').length, 0);

  const act = async (s: Student, key: string, status: 'approved' | 'rejected') => {
    setErr(null);
    try { await reviewDocument(me, s, key, status, notes[s.id + key] ?? ''); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <>
      <PageHead title="Admission — Document Review" sub="Approve or reject submitted papers. Visa applications are reviewed in the Visa Tracker." />
      <ErrorNote error={error || err} />
      <div className="kpis">
        <Kpi label="Waiting for review" value={queue.length} tone="warn" />
        <Kpi label="Rejected, awaiting resubmission" value={rejected} tone="bad" />
        <Kpi label="Predicted with all docs approved" value={readyForVisa.length} tone="ok" hint="ready for visa payment" />
        <Kpi label="Visa Paid — to confirm registration" value={students.filter((s) => s.stage === 'visa_paid').length} tone="info" />
      </div>
      {queue.length === 0 ? <Empty>No documents waiting. 🎉</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Student</th><th>Stage</th><th>Document</th><th>File</th><th>Note</th><th /></tr></thead>
            <tbody>
              {queue.map(({ s, key, label }) => (
                <tr key={s.id + key}>
                  <td><Link to={`/students/${s.id}`}>{s.name}</Link><div className="muted small">{s.university} · {s.counselorName}</div></td>
                  <td><StageBadge stage={s.stage} /></td>
                  <td>{label}</td>
                  <td>{s.documents[key].link ? <a href={s.documents[key].link} target="_blank" rel="noreferrer">Open ↗</a> : '—'}</td>
                  <td><input placeholder="Required to reject" value={notes[s.id + key] ?? ''} onChange={(e) => setNotes({ ...notes, [s.id + key]: e.target.value })} /></td>
                  <td className="row gap">
                    <button className="btn btn-sm btn-ok" onClick={() => act(s, key, 'approved')}>Approve</button>
                    <button className="btn btn-sm btn-danger" disabled={!notes[s.id + key]} onClick={() => act(s, key, 'rejected')}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {students.some((s) => s.stage === 'visa_paid') && (
        <section className="card">
          <h2>Visa Paid — confirm registration</h2>
          <ul className="list">
            {students.filter((s) => s.stage === 'visa_paid').map((s) => (
              <li key={s.id}><Link to={`/students/${s.id}`}>{s.name}</Link><span className="muted">{s.university}</span></li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
