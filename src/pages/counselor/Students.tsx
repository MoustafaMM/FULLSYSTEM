import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfidenceBar, Empty, ErrorNote, Kpi, PageHead, StageBadge } from '../../components/ui';
import { useMe } from '../../context/AuthContext';
import { useCollection } from '../../lib/hooks';
import { studentsQuery } from '../../lib/queries';
import { STAGES, STAGE_LABEL, weightedForecast, docsProgress } from '../../lib/pipeline';
import { fmtDate, fmtMoney, isOverdue } from '../../lib/format';
import { can } from '../../lib/roles';
import type { Stage, Student } from '../../lib/types';
import StudentForm from './StudentForm';

export default function Students() {
  const me = useMe();
  const nav = useNavigate();
  const { data: students, loading, error } = useCollection<Student>(studentsQuery(me), [me.uid, me.role]);
  const [stage, setStage] = useState<Stage | 'all'>('all');
  const [q, setQ] = useState('');
  const [counselor, setCounselor] = useState('all');
  const [adding, setAdding] = useState(false);

  const counselors = useMemo(
    () => Array.from(new Map(students.map((s) => [s.counselorId, s.counselorName])).entries()),
    [students],
  );

  const scoped = students.filter((s) => counselor === 'all' || s.counselorId === counselor);
  const rows = scoped
    .filter((s) => stage === 'all' || s.stage === stage)
    .filter((s) => {
      const t = q.trim().toLowerCase();
      return !t || [s.name, s.university, s.passportNo, s.phone, s.nationality].some((v) => v?.toLowerCase().includes(t));
    })
    .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));

  const count = (st: Stage) => scoped.filter((s) => s.stage === st).length;

  return (
    <>
      <PageHead
        title={me.role === 'counselor' ? 'My Students' : 'Students & Pipeline'}
        sub="Lead 0–79% → Predicted 80% → Visa Paid 100% (auto-added to Tracker) → Registered ✓"
        actions={can.editPipeline(me.role) && <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add student</button>}
      />
      <ErrorNote error={error} />
      <div className="kpis">
        <Kpi label="Total" value={scoped.length} />
        <Kpi label="Leads" value={count('lead')} hint="0–79%" />
        <Kpi label="Predicted" value={count('predicted')} hint="80%" tone="warn" />
        <Kpi label="Visa Paid" value={count('visa_paid')} hint="100% · in Tracker" tone="info" />
        <Kpi label="Registered" value={count('registered')} hint="Done" tone="ok" />
        <Kpi label="Weighted forecast" value={fmtMoney(weightedForecast(scoped))} hint="Σ confidence × value" />
      </div>

      <div className="toolbar">
        <input placeholder="Search name, university, passport, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          <button className={stage === 'all' ? 'chip on' : 'chip'} onClick={() => setStage('all')}>All</button>
          {STAGES.map((s) => (
            <button key={s} className={stage === s ? 'chip on' : 'chip'} onClick={() => setStage(s)}>{STAGE_LABEL[s]}</button>
          ))}
        </div>
        {me.role !== 'counselor' && (
          <select value={counselor} onChange={(e) => setCounselor(e.target.value)}>
            <option value="all">All counselors</option>
            {counselors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      {loading ? <Empty>Loading…</Empty> : rows.length === 0 ? <Empty>No students yet.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th><th>University</th><th>Intake</th><th>Stage</th><th style={{ width: 180 }}>Confidence</th>
                <th>Docs</th><th>Next follow-up</th>{me.role !== 'counselor' && <th>Counselor</th>}<th>Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const d = docsProgress(s);
                return (
                  <tr key={s.id} className="clickable" onClick={() => nav(`/students/${s.id}`)}>
                    <td><strong>{s.name}</strong><div className="muted small">{s.nationality} · {s.phone}</div></td>
                    <td>{s.university}<div className="muted small">{s.program}</div></td>
                    <td>{s.intake || '—'}</td>
                    <td><StageBadge stage={s.stage} /></td>
                    <td><ConfidenceBar value={s.confidence} stage={s.stage} /></td>
                    <td>{d.approved}/{d.total}</td>
                    <td className={isOverdue(s.nextFollowUp) ? 'danger' : ''}>{fmtDate(s.nextFollowUp)}</td>
                    {me.role !== 'counselor' && <td>{s.counselorName}</td>}
                    <td>{fmtMoney(s.expectedValue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {adding && <StudentForm onClose={() => setAdding(false)} />}
    </>
  );
}
