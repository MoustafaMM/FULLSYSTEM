import { NavLink, Outlet } from 'react-router-dom';
import { useAuth, useMe } from '../context/AuthContext';
import { NAV, NAV_GROUP_ORDER, ROLE_LABEL } from '../lib/roles';
import { LOGI_TABS } from '../logistics/bridge';

export default function Layout() {
  const me = useMe();
  const { logout } = useAuth();
  const items = [
    ...NAV.filter((n) => n.roles.includes(me.role)),
    ...LOGI_TABS[me.role].map((t) => ({ to: `/logistics/${t.view}`, label: t.label, group: 'Logistics' as const })),
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="" />
          <span>Express Tracker</span>
        </div>
        <nav>
          {NAV_GROUP_ORDER.map((g) => {
            const list = items.filter((i) => i.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className="nav-group">
                <div className="nav-group-title">{g}</div>
                {list.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.to === '/qc'} className={({ isActive }) => (isActive ? 'active' : '')}>
                    {n.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="me">
            <strong>{me.name}</strong>
            <span>{ROLE_LABEL[me.role]}</span>
          </div>
          <button className="btn btn-ghost" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
