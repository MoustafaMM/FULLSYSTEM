import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorNote, PageHead } from '../../components/ui';
import { useCollection } from '../../lib/hooks';
import { auditQuery } from '../../lib/queries';
import { fmtDate } from '../../lib/format';
import type { AuditEntry } from '../../lib/types';

export default function AuditLog() {
  const { data, loading, error } = useCollection<AuditEntry>(auditQuery(500), []);
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('all');
  const rows = data.filter((a) => (entity === 'all' || a.entity === entity) &&
    (!q || `${a.detail} ${a.byName} ${a.action}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <PageHead title="Audit Log" sub="Every pipeline, document, tracker, logistics and QC change — who, when, what." />
      <ErrorNote error={error} />
      <div className="toolbar">
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="all">All</option><option value="student">Students</option><option value="tracker">Tracker</option>
          <option value="logistics">Logistics</option><option value="qc">QC</option>
        </select>
      </div>
      {loading ? <Empty>Loading…</Empty> : rows.length === 0 ? <Empty>No entries.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>Area</th><th>Action</th><th>Detail</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{fmtDate(a.at, true)}</td><td>{a.byName}</td><td>{a.entity}</td><td>{a.action}</td>
                  <td>{a.entity === 'student' ? <Link to={`/students/${a.entityId}`}>{a.detail}</Link> : a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
