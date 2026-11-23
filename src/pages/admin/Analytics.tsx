import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { Kpi, PageHead } from '../../components/ui';
import { useMe } from '../../context/AuthContext';
import { useCollection } from '../../lib/hooks';
import { studentsQuery, trackerQuery, logiTasksQuery, flagsQuery } from '../../lib/queries';
import { STAGE_LABEL, weightedForecast } from '../../lib/pipeline';
import { fmtMoney, toDate } from '../../lib/format';
import type { LogiTask, QcFlag, Stage, Student, TrackerApp } from '../../lib/types';

const FUNNEL: Stage[] = ['lead', 'predicted', 'visa_paid', 'registered'];
const COLORS: Record<Stage, string> = {
  lead: 'var(--stage-lead)', predicted: 'var(--stage-predicted)', visa_paid: 'var(--stage-visa)',
  registered: 'var(--stage-registered)', lost: 'var(--stage-lost)',
};

export default function Analytics() {
  const me = useMe();
  const { data: all } = useCollection<Student>(studentsQuery(me), [me.uid]);
  const { data: apps } = useCollection<TrackerApp>(trackerQuery(me), [me.uid]);
  const { data: tasks } = useCollection<LogiTask>(logiTasksQuery(), []);
  const { data: flags } = useCollection<QcFlag>(flagsQuery(), []);
  const [intake, setIntake] = useState('all');

  const intakes = useMemo(() => Array.from(new Set(all.map((s) => s.intake).filter(Boolean))).sort(), [all]);
  const students = all.filter((s) => intake === 'all' || s.intake === intake);

  // Funnel counts are cumulative: a Registered student also passed Lead, Predicted and Visa Paid.
  const rank: Record<Stage, number> = { lead: 0, predicted: 1, visa_paid: 2, registered: 3, lost: -1 };
  const funnel = FUNNEL.map((st) => ({
    stage: STAGE_LABEL[st], key: st,
    count: students.filter((s) => rank[s.stage] >= rank[st]).length,
  }));
  const lost = students.filter((s) => s.stage === 'lost').length;
  const registered = students.filter((s) => s.stage === 'registered');
  const conversion = students.length ? Math.round((registered.length / students.length) * 100) : 0;

  const byCounselor = Object.values(students.reduce<Record<string, { name: string; total: number; predicted: number; visa: number; reg: number; lost: number; forecast: number; won: number }>>((acc, s) => {
    const r = (acc[s.counselorId] ??= { name: s.counselorName, total: 0, predicted: 0, visa: 0, reg: 0, lost: 0, forecast: 0, won: 0 });
    r.total++;
    if (s.stage === 'predicted') r.predicted++;
    if (s.stage === 'visa_paid') r.visa++;
    if (s.stage === 'registered') { r.reg++; r.won += s.expectedValue || 0; }
    if (s.stage === 'lost') r.lost++;
    if (s.stage !== 'lost') r.forecast += (s.confidence / 100) * (s.expectedValue || 0);
    return acc;
  }, {})).sort((a, b) => b.forecast - a.forecast);

  const byUni = Object.entries(students.reduce<Record<string, number>>((acc, s) => {
    if (s.stage === 'visa_paid' || s.stage === 'registered') acc[s.university] = (acc[s.university] ?? 0) + 1;
    return acc;
  }, {})).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  const lostReasons = Object.entries(students.filter((s) => s.stage === 'lost').reduce<Record<string, number>>((acc, s) => {
    const k = s.lostReason || 'Unspecified'; acc[k] = (acc[k] ?? 0) + 1; return acc;
  }, {})).sort((a, b) => b[1] - a[1]);

  // Visa payments per month (last 6 months)
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
  const monthly = months.map((m) => ({
    month: m,
    visaPaid: students.filter((s) => toDate(s.visaPaidAt)?.toISOString().slice(0, 7) === m).length,
  }));

  return (
    <>
      <PageHead title="Analytics" sub="Pipeline, forecast and team performance"
        actions={<select value={intake} onChange={(e) => setIntake(e.target.value)}>
          <option value="all">All intakes</option>{intakes.map((i) => <option key={i}>{i}</option>)}
        </select>} />
      <div className="kpis">
        <Kpi label="Students" value={students.length} />
        <Kpi label="Weighted forecast" value={fmtMoney(weightedForecast(students))} />
        <Kpi label="Won (registered)" value={fmtMoney(registered.reduce((n, s) => n + (s.expectedValue || 0), 0))} tone="ok" />
        <Kpi label="Lead → Registered" value={`${conversion}%`} />
        <Kpi label="Lost" value={lost} tone="bad" />
        <Kpi label="Visa apps w/ issues" value={apps.filter((a) => a.admissionReview === 'issue').length} tone="bad" />
        <Kpi label="Open logistics tasks" value={tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length} />
        <Kpi label="Open QC flags" value={flags.filter((f) => f.status === 'open').length} tone="warn" />
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Funnel</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnel}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="stage" /><YAxis allowDecimals={false} /><Tooltip />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {funnel.map((f) => <Cell key={f.key} fill={COLORS[f.key]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
        <section className="card">
          <h2>Visa payments per month</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip />
              <Bar dataKey="visaPaid" name="Visa paid" fill="var(--brand-primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="card">
        <h2>Counselor leaderboard</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Counselor</th><th>Students</th><th>Predicted</th><th>Visa Paid</th><th>Registered</th><th>Lost</th><th>Conversion</th><th>Weighted forecast</th><th>Won</th></tr></thead>
            <tbody>
              {byCounselor.map((c) => (
                <tr key={c.name}>
                  <td><strong>{c.name}</strong></td><td>{c.total}</td><td>{c.predicted}</td><td>{c.visa}</td><td>{c.reg}</td><td>{c.lost}</td>
                  <td>{c.total ? Math.round((c.reg / c.total) * 100) : 0}%</td><td>{fmtMoney(c.forecast)}</td><td>{fmtMoney(c.won)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Top universities (Visa Paid + Registered)</h2>
          <ul className="list">{byUni.map((u) => <li key={u.name}><span>{u.name}</span><strong>{u.count}</strong></li>)}</ul>
        </section>
        <section className="card">
          <h2>Lost reasons</h2>
          <ul className="list">{lostReasons.map(([r, n]) => <li key={r}><span>{r}</span><strong>{n}</strong></li>)}</ul>
        </section>
      </div>
    </>
  );
}
