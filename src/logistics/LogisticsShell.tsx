import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { useMe } from '../context/AuthContext';
import { AppProvider, useAppContext } from './context/AppContext';
import { LOGI_ROLE, LOGI_TABS, canSeeLogiView } from './bridge';
import {
  getNotificationPermission, isPushNotificationSupported, listenToForegroundMessages, requestPushPermissionAndSubscribe,
} from './services/pushNotificationService';
import Dashboard from './pages/Dashboard';
import StudentsDirectory from './pages/StudentsDirectory';
import LiveOperations from './pages/LiveOperations';
import PresetsManager from './pages/PresetsManager';
import FieldTasks from './pages/FieldTasks';
import StudentProfile from './pages/StudentProfile';
import Analytics from './pages/Analytics';
import LiveMap from './pages/LiveMap';
import CounselorDashboard from './pages/CounselorDashboard';
import CounselorTasks from './pages/CounselorTasks';
import Vehicles from './pages/Vehicles';
import StaffHistory from './pages/StaffHistory';
import WalletPage from './pages/Wallet';
import WalletHistory from './pages/WalletHistory';
import Feedbacks from './pages/Feedbacks';
import Overtime from './pages/Overtime';
import QualityControl from './pages/QualityControl';
import ReloadPrompt from './components/ReloadPrompt';
import './index.css';

/** Mounted once for every /logistics/* route, so the real-time listeners stay alive between tabs. */
export default function LogisticsShell() {
  const me = useMe();
  const identity = useMemo(
    () => ({ uid: me.uid, name: me.name, email: me.email, role: LOGI_ROLE[me.role], etRole: me.role }),
    [me.uid, me.name, me.email, me.role],
  );
  return (
    <AppProvider identity={identity}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '12px' } }} />
      <ReloadPrompt />
      <Outlet />
    </AppProvider>
  );
}

export function LogisticsView() {
  const me = useMe();
  const nav = useNavigate();
  const { view = '', id } = useParams();
  const { currentUser, isAuthLoading, language, setLanguage } = useAppContext();
  const prevView = useRef<string>('');

  const tabs = LOGI_TABS[me.role];
  const go = (v: string, sid?: string) => {
    if (v !== 'feedback' && !canSeeLogiView(me.role, v)) return;
    if (v === 'student_profile' && sid) { prevView.current = view; nav(`/logistics/student/${sid}`); return; }
    nav(`/logistics/${v}`);
  };

  if (!tabs.length) return <Navigate to="/" replace />;
  if (!id && !tabs.some((t) => t.view === view)) return <Navigate to={`/logistics/${tabs[0].view}`} replace />;
  if (isAuthLoading || !currentUser) return <div className="empty">Loading logistics…</div>;

  const isRTL = language === 'ar';
  const title = id ? 'Student profile' : tabs.find((t) => t.view === view)?.label ?? 'Logistics';
  const role = currentUser.role;
  const select = (sid: string) => go('student_profile', sid);

  let page: React.ReactElement;
  if (id) {
    page = <StudentProfile studentId={id} onBack={() => (prevView.current ? nav(`/logistics/${prevView.current}`) : nav(-1))} />;
  } else if (role === 'counselor') {
    page = view === 'counselor_tasks' ? <CounselorTasks />
      : view === 'feedbacks' ? <Feedbacks onSelectStudent={select} />
      : view === 'students' ? <StudentsDirectory onSelectStudent={select} />
      : <CounselorDashboard initialTab={view === 'tasks' ? 'tasks' : 'students'} onSelectStudent={select} onNavigate={(v) => go(v)} />;
  } else if (role === 'field_officer') {
    page = view === 'vehicles' ? <Vehicles /> : view === 'wallet' ? <WalletPage /> : view === 'overtime' ? <Overtime /> : <FieldTasks />;
  } else {
    switch (view) {
      case 'counselor_tasks': page = <CounselorTasks />; break;
      case 'students': page = <StudentsDirectory onSelectStudent={select} />; break;
      case 'live_ops': page = <LiveOperations />; break;
      case 'wallet': case 'wallet_history': page = <WalletHistory />; break;
      case 'presets': page = <PresetsManager />; break;
      case 'feedbacks': page = <Feedbacks onSelectStudent={select} />; break;
      case 'staff_history': page = <StaffHistory />; break;
      case 'analytics': page = <Analytics />; break;
      case 'live_map': page = <LiveMap />; break;
      case 'vehicles': page = <Vehicles />; break;
      case 'overtime': page = <Overtime />; break;
      case 'quality_control': page = <QualityControl />; break;
      default: page = <Dashboard />;
    }
  }

  return (
    <div className="logi-root" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="logi-bar">
        <h1>{title}</h1>
        <div className="row gap">
          <PushButton />
          <Notifications onOpen={(v) => go(v)} />
          <button className="btn btn-sm" onClick={() => setLanguage(isRTL ? 'en' : 'ar')}>{isRTL ? 'English' : 'العربية'}</button>
        </div>
      </div>
      <div className="logi-page">{page}</div>
    </div>
  );
}

function PushButton() {
  const { currentUser } = useAppContext();
  const [perm, setPerm] = useState(getNotificationPermission());
  useEffect(() => {
    if (currentUser && perm === 'granted') requestPushPermissionAndSubscribe(currentUser.id).catch(() => undefined);
  }, [currentUser?.id, perm]);
  useEffect(() => {
    let off: (() => void) | null = null;
    listenToForegroundMessages((p) => {
      const title = p.notification?.title || p.data?.title || 'Notification';
      const body = p.notification?.body || p.data?.body || '';
      if (/delayed|متأخر/i.test(title + body)) return;
      toast(`${title}${body ? ' — ' + body : ''}`, { duration: 5500 });
    }).then((u) => { off = u; });
    return () => { off?.(); };
  }, []);
  if (!isPushNotificationSupported() || perm === 'granted' || perm === 'unsupported') return null;
  return (
    <button className="btn btn-sm" onClick={async () => {
      if (!currentUser) return;
      await requestPushPermissionAndSubscribe(currentUser.id).catch(() => undefined);
      setPerm(getNotificationPermission());
    }}>🔔 Enable alerts</button>
  );
}

function Notifications({ onOpen }: { onOpen: (view: string) => void }) {
  const { currentUser, notifications, markNotificationAsRead, markAllNotificationsAsRead } = useAppContext();
  const [open, setOpen] = useState(false);
  const mine = notifications
    .filter((n) => n.userId === currentUser?.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
  const unread = mine.filter((n) => !n.isRead).length;
  const target = (type: string) =>
    type === 'task_assigned' ? 'tasks' : type.startsWith('counselor_task') ? 'counselor_tasks'
      : type === 'task_requested' ? 'live_ops' : type === 'maintenance_due' ? 'vehicles' : type === 'low_balance' ? 'wallet' : '';
  return (
    <div className="notif">
      <button className="btn btn-sm" onClick={() => setOpen(!open)}>🔔 {unread > 0 && <span className="notif-count">{unread}</span>}</button>
      {open && (
        <div className="notif-panel">
          <div className="row gap" style={{ justifyContent: 'space-between' }}>
            <strong>Notifications</strong>
            {unread > 0 && <button className="link" style={{ margin: 0 }} onClick={() => markAllNotificationsAsRead()}>Mark all read</button>}
          </div>
          {mine.length === 0 ? <p className="muted small">No notifications.</p> : mine.map((n) => (
            <button key={n.id} className={`notif-item ${n.isRead ? '' : 'unread'}`} onClick={() => {
              markNotificationAsRead(n.id); setOpen(false);
              const v = target(n.type); if (v) onOpen(v);
            }}>
              <strong>{n.title}</strong><span>{n.message}</span>
              <span className="muted small">{new Date(n.createdAt).toLocaleString('en-GB')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
