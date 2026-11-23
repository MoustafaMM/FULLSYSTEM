import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorNote, Field, Kpi, Modal, PageHead } from '../components/ui';
import { useMe } from '../context/AuthContext';
import { useCollection } from '../lib/hooks';
import { trackerQuery } from '../lib/queries';
import { checkTrackerNow, reviewTrackerApp } from '../lib/actions';
import { api } from '../lib/api';
import { fmtDate } from '../lib/format';
import { can } from '../lib/roles';
import type { TrackerApp } from '../lib/types';

export default function Tracker() {
  const me = useMe();
  const { data, loading, error } = useCollection<TrackerApp>(trackerQuery(me), [me.uid]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'ok' | 'issue'>('all');
  const [reviewing, setReviewing] = useState<TrackerApp | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);

  async function checkNow(a: TrackerApp) {
    setChecking(a.id); setErr(null); setMsg(null);
    try {
      const r = await checkTrackerNow(a.id);
      setMsg(r.ok ? `${a.studentName}: ${r.changed ? 'status updated' : 'no change'}.` : `${a.studentName}: EMGS could not be reached — will retry automatically.`);
    } catch (e) { setErr((e as Error).message); }
    finally { setChecking(null); }
  }

  const rows = data
    .filter((a) => filter === 'all' || a.admissionReview === filter)
    .filter((a) => {
      const t = q.trim().toLowerCase();
      return !t || [a.studentName, a.passportNo, a.applicationNo, a.university, a.emgsStatus].some((v) => v?.toLowerCase().includes(t));
    })
    .sort((a, b) => (a.emgsPercent ?? 0) - (b.emgsPercent ?? 0));

  async function refresh() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api<{ checked: number; changed: number; failed?: number }>('/api/tracker/refresh', 'POST');
      setMsg(`Checked ${r.checked} applications, ${r.changed} changed${r.failed ? `, ${r.failed} could not reach EMGS` : ''}.`);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title="Visa Tracker" sub="Students are added automatically when their visa payment is recorded."
        actions={(me.role === 'admin' || me.role === 'admission') && (
          <button className="btn btn-primary" onClick={refresh} disabled={busy}>{busy ? 'Checking EMGS…' : 'Refresh EMGS status'}</button>
        )} />
      <ErrorNote error={error || err} />
      {msg && <div className="alert alert-ok">{msg}</div>}
      <div className="kpis">
        <Kpi label="Applications" value={data.length} />
        <Kpi label="Awaiting admission review" value={data.filter((a) => a.admissionReview === 'pending').length} tone="warn" />
        <Kpi label="Issues" value={data.filter((a) => a.admissionReview === 'issue').length} tone="bad" />
        <Kpi label="EMGS issues raised" value={data.filter((a) => (a.emgsIssues ?? []).some((i) => !/resolved|closed/i.test(i.status))).length} tone="bad" />
        <Kpi label="Approved (100%)" value={data.filter((a) => a.emgsPercent >= 100).length} tone="ok" />
      </div>
      <div className="toolbar">
        <input placeholder="Search student, passport, application no…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          {(['all', 'pending', 'ok', 'issue'] as const).map((f) => (
            <button key={f} className={filter === f ? 'chip on' : 'chip'} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : `Review: ${f}`}</button>
          ))}
        </div>
      </div>
      {loading ? <Empty>Loading…</Empty> : rows.length === 0 ? <Empty>No applications.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Student</th><th>University</th><th>Application no.</th><th>EMGS status</th><th>Progress</th><th>Last checked</th><th>Admission</th>{me.role !== 'counselor' && <th>Counselor</th>}<th /></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/students/${a.studentId}`}>{a.studentName}</Link><div className="muted small">{a.passportNo} · {a.nationality}</div></td>
                  <td>{a.university}</td>
                  <td>{a.applicationNo || '—'}</td>
                  <td>{a.emgsStatus}
                    {(a.emgsIssues ?? []).length > 0 && (
                      <ul className="issues">{a.emgsIssues!.map((i, k) => <li key={k} title={i.comment}><strong>{i.issue}</strong> — {i.status}</li>)}</ul>
                    )}
                  </td>
                  <td><div className="conf"><div className="conf-track"><div className="conf-fill" style={{ width: `${a.emgsPercent}%`, background: a.progressColor || 'var(--stage-visa)' }} /></div><span className="conf-num">{a.emgsPercent}%</span></div></td>
                  <td>{fmtDate(a.lastChecked, true)}{a.lastError && <div className="danger small">{a.lastError}</div>}</td>
                  <td><span className={`badge review-${a.admissionReview}`}>{a.admissionReview}</span>{a.admissionNote && <div className="muted small">{a.admissionNote}</div>}</td>
                  {me.role !== 'counselor' && <td>{a.counselorName}</td>}
                  <td className="row gap">
                    <button className="btn btn-sm" disabled={checking === a.id || !a.passportNo} title={a.passportNo ? '' : 'No passport number'} onClick={() => checkNow(a)}>{checking === a.id ? '…' : 'Check now'}</button>
                    {can.reviewAdmission(me.role) && <button className="btn btn-sm btn-primary" onClick={() => setReviewing(a)}>Review</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {reviewing && <ReviewModal app={reviewing} onClose={() => setReviewing(null)} />}
    </>
  );
}

function ReviewModal({ app, onClose }: { app: TrackerApp; onClose: () => void }) {
  const me = useMe();
  const [note, setNote] = useState(app.admissionNote ?? '');
  const [appNo, setAppNo] = useState(app.applicationNo ?? '');
  const [err, setErr] = useState<string | null>(null);
  const save = async (r: 'ok' | 'issue') => {
    try { await reviewTrackerApp(me, app.id, app.studentName, r, note, appNo); onClose(); }
    catch (e) { setErr((e as Error).message); }
  };
  return (
    <Modal title={`Review visa application — ${app.studentName}`} onClose={onClose}>
      <ErrorNote error={err} />
      <p className="muted">EMGS: {app.emgsStatus} ({app.emgsPercent}%)</p>
      {app.history?.length > 0 && (
        <ul className="list timeline">{[...app.history].reverse().slice(0, 6).map((h, i) => <li key={i}><span className="muted small">{fmtDate(h.at, true)}</span><span>{h.status} ({h.percent}%)</span></li>)}</ul>
      )}
      <Field label="EMGS application no."><input value={appNo} onChange={(e) => setAppNo(e.target.value)} /></Field>
      <Field label="Note"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="row gap end">
        <button className="btn btn-danger" disabled={!note.trim()} onClick={() => save('issue')}>Flag issue</button>
        <button className="btn btn-ok" onClick={() => save('ok')}>Mark OK</button>
      </div>
    </Modal>
  );
}
