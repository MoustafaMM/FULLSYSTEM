import { useState } from 'react';
import { Empty, ErrorNote, Field, Modal, PageHead } from '../../components/ui';
import { useCollection } from '../../lib/hooks';
import { usersQuery } from '../../lib/queries';
import { api } from '../../lib/api';
import { ROLE_LABEL } from '../../lib/roles';
import type { AppUser, Role } from '../../lib/types';

const ROLES = Object.keys(ROLE_LABEL) as Role[];

export default function Users() {
  const { data, error } = useCollection<AppUser & { id: string }>(usersQuery(), []);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');

  const update = (uid: string, patch: Partial<AppUser>) =>
    api(`/api/users/${uid}`, 'PATCH', patch).catch((e) => setErr(e.message));

  const rows = data.filter((u) => roleFilter === 'all' || u.role === roleFilter).sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  return (
    <>
      <PageHead title="Users & Roles" sub="Counselors · Admission · Logistics (coordinator & team) · Quality Control · Admin"
        actions={<button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add user</button>} />
      <ErrorNote error={error || err} />
      <div className="chips">
        <button className={roleFilter === 'all' ? 'chip on' : 'chip'} onClick={() => setRoleFilter('all')}>All ({data.length})</button>
        {ROLES.map((r) => <button key={r} className={roleFilter === r ? 'chip on' : 'chip'} onClick={() => setRoleFilter(r)}>{ROLE_LABEL[r]} ({data.filter((u) => u.role === r).length})</button>)}
      </div>
      {rows.length === 0 ? <Empty>No users.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className={u.active === false ? 'muted' : ''}>
                  <td><strong>{u.name}</strong></td>
                  <td>{u.email}</td>
                  <td><select value={u.role} onChange={(e) => update(u.id, { role: e.target.value as Role })}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select></td>
                  <td><button className="btn btn-sm" onClick={() => update(u.id, { active: u.active === false })}>
                    {u.active === false ? 'Reactivate' : 'Deactivate'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AddUser onClose={() => setAdding(false)} />}
    </>
  );
}

function AddUser({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'counselor' as Role });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setErr(null);
    try { await api('/api/users', 'POST', f); onClose(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Modal title="Add user" onClose={onClose}>
      <ErrorNote error={err} />
      <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Email"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Temporary password (min 8)"><input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <Field label="Role"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </select></Field>
      <div className="row gap end"><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !f.name || !f.email || f.password.length < 8} onClick={save}>Create</button></div>
    </Modal>
  );
}
