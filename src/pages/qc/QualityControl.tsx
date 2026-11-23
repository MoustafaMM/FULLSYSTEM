import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorNote, Kpi, Modal, PageHead, Field } from '../../components/ui';
import { useMe } from '../../context/AuthContext';
import { useCollection } from '../../lib/hooks';
import { flagsQuery, studentsQuery, trackerQuery, logiTasksQuery } from '../../lib/queries';
import { resolveFlag } from '../../lib/actions';
import { fmtDate, toDate } from '../../lib/format';
import { REQUIRED_DOCS, isOpen } from '../../lib/pipeline';
import type { LogiTask, QcFlag, Student, TrackerApp } from '../../lib/types';

const DAY = 86_400_000;

export default function QualityControl() {
  const me = useMe();
  const { data: flags, error } = useCollection<QcFlag>(flagsQuery(), []);
  const { data: students } = useCollection<Student>(studentsQuery(me), [me.uid]);
  const { data: apps } = useCollection<TrackerApp>(trackerQuery(me), [me.uid]);
  const { data: tasks } = useCollection<LogiTask>(logiTasksQuery(), []);
  const [resolving, setResolving] = useState<QcFlag | null>(null);
  const [tab, setTab] = useState<'open' | 'resolved'>('open');

  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  // Automatic checks — each returns the students / items that break a rule
  const checks: { title: string; rule: string; items: { id: string; name: string; detail: string; link: string }[] }[] = [
    {
      title: 'Open students without a follow-up',
      rule: 'Every Lead / Predicted student needs a next follow-up date.',
      items: students.filter((s) => isOpen(s.stage) && !s.nextFollowUp)
        .map((s) => ({ id: s.id, name: s.name, detail: s.counselorName, link: `/students/${s.id}` })),
    },
    {
      title: 'Overdue follow-ups (> 2 days)',
      rule: 'Next follow-up date passed more than 2 days ago.',
      items: students.filter((s) => isOpen(s.stage) && (toDate(s.nextFollowUp)?.getTime() ?? now) < now - 2 * DAY)
        .map((s) => ({ id: s.id, name: s.name, detail: `${s.counselorName} · due ${fmtDate(s.nextFollowUp)}`, link: `/students/${s.id}` })),
    },
    {
      title: 'Predicted for 30+ days without visa payment',
      rule: '80% confidence should convert or be re-scored.',
      items: students.filter((s) => s.stage === 'predicted' && (toDate(s.updatedAt)?.getTime() ?? now) < now - 30 * DAY)
        .map((s) => ({ id: s.id, name: s.name, detail: `${s.counselorName} · since ${fmtDate(s.updatedAt)}`, link: `/students/${s.id}` })),
    },
    {
      title: 'Visa Paid with documents not fully approved',
      rule: 'All required papers should be approved by Admission.',
      items: students.filter((s) => s.stage === 'visa_paid' && REQUIRED_DOCS.some((d) => s.documents?.[d.key]?.status !== 'approved'))
        .map((s) => ({ id: s.id, name: s.name, detail: s.counselorName, link: `/students/${s.id}` })),
    },
    {
      title: 'Visa applications pending admission review > 3 days',
      rule: 'Admission should review each new tracker entry within 3 days.',
      items: apps.filter((a) => a.admissionReview === 'pending' && (toDate(a.createdAt)?.getTime() ?? now) < now - 3 * DAY)
        .map((a) => ({ id: a.id, name: a.studentName, detail: `added ${fmtDate(a.createdAt)}`, link: `/students/${a.studentId}` })),
    },
    {
      title: 'Overdue or unassigned logistics tasks',
      rule: 'Every task needs an owner and must be done by its due date.',
      items: tasks.filter((t) => (t.status === 'pending' || t.status === 'in_progress') && (!t.assigneeId || (!!t.taskDate && t.taskDate < today)))
        .map((t) => {
          const s = students.find((x) => x.id === t.studentId);
          return { id: t.id, name: s?.name ?? t.customTitle ?? 'Logistics task', detail: `${t.customTitle || t.presetId || 'task'} · ${t.assigneeId ? 'assigned' : 'unassigned'} · ${t.taskDate || 'no date'}`, link: '/logistics/quality_control' };
        }),
    },
  ];

  const list = flags.filter((f) => f.status === tab).sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  const open = flags.filter((f) => f.status === 'open');

  return (
    <>
      <PageHead title="Quality Control" sub="Automatic checks across counselors, admission and logistics, plus manual flags. Raise a flag from any student page." />
      <ErrorNote error={error} />
      <div className="kpis">
        <Kpi label="Open flags" value={open.length} tone={open.length ? 'warn' : 'ok'} />
        <Kpi label="High severity" value={open.filter((f) => f.severity === 'high').length} tone="bad" />
        <Kpi label="Check failures" value={checks.reduce((n, c) => n + c.items.length, 0)} tone="warn" />
        <Kpi label="Resolved" value={flags.length - open.length} tone="ok" />
      </div>

      <h2>Automatic checks</h2>
      <div className="checks">
        {checks.map((c) => (
          <details key={c.title} className={`check ${c.items.length ? 'check-fail' : 'check-pass'}`}>
            <summary><span>{c.items.length ? '⚠' : '✓'} {c.title}</span><strong>{c.items.length}</strong></summary>
            <p className="muted small">{c.rule}</p>
            <ul className="list">{c.items.slice(0, 50).map((i) => <li key={i.id}><Link to={i.link}>{i.name}</Link><span className="muted small">{i.detail}</span></li>)}</ul>
          </details>
        ))}
      </div>

      <h2>Flags</h2>
      <div className="chips">
        <button className={tab === 'open' ? 'chip on' : 'chip'} onClick={() => setTab('open')}>Open</button>
        <button className={tab === 'resolved' ? 'chip on' : 'chip'} onClick={() => setTab('resolved')}>Resolved</button>
      </div>
      {list.length === 0 ? <Empty>No {tab} flags.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Raised</th><th>Student</th><th>Area</th><th>Severity</th><th>Issue</th><th>By</th><th /></tr></thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.id}>
                  <td>{fmtDate(f.createdAt)}</td>
                  <td><Link to={`/students/${f.studentId}`}>{f.studentName}</Link></td>
                  <td>{f.area}</td>
                  <td><span className={`badge sev-${f.severity}`}>{f.severity}</span></td>
                  <td>{f.issue}{f.resolution && <div className="muted small">Resolved: {f.resolution}</div>}</td>
                  <td>{f.raisedByName}</td>
                  <td>{f.status === 'open' && <button className="btn btn-sm" onClick={() => setResolving(f)}>Resolve</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {resolving && <ResolveModal flag={resolving} onClose={() => setResolving(null)} />}
    </>
  );
}

function ResolveModal({ flag, onClose }: { flag: QcFlag; onClose: () => void }) {
  const me = useMe();
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={`Resolve flag — ${flag.studentName}`} onClose={onClose}>
      <ErrorNote error={err} />
      <p>{flag.issue}</p>
      <Field label="Resolution *"><textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <div className="row gap end">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-ok" disabled={!text.trim()} onClick={() => resolveFlag(me, flag, text).then(onClose).catch((e) => setErr(e.message))}>Resolve</button>
      </div>
    </Modal>
  );
}
