import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RequireRole from './components/RequireRole';
import { useAuth } from './context/AuthContext';
import { HOME_BY_ROLE } from './lib/roles';
import Login from './pages/Login';
import Students from './pages/counselor/Students';
import StudentDetail from './pages/counselor/StudentDetail';
import FollowUps from './pages/counselor/FollowUps';
import Tracker from './pages/Tracker';
import DocumentReview from './pages/admission/DocumentReview';
import QualityControl from './pages/qc/QualityControl';
import AuditLog from './pages/qc/AuditLog';
import Analytics from './pages/admin/Analytics';
import Users from './pages/admin/Users';
import KnowledgeBase from './pages/admin/KnowledgeBase';
import Chatbot from './pages/Chatbot';
import { lazy, Suspense } from 'react';

// Logistics is large (maps, OCR, photo tools) — loaded only when a Logistics tab is opened
const LogisticsShell = lazy(() => import('./logistics/LogisticsShell'));
const LogisticsView = lazy(() => import('./logistics/LogisticsShell').then((m) => ({ default: m.LogisticsView })));

function Home() {
  const { profile } = useAuth();
  return <Navigate to={profile ? HOME_BY_ROLE[profile.role] : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireRole><Layout /></RequireRole>}>
        <Route index element={<Home />} />
        <Route path="students" element={<RequireRole roles={['admin', 'counselor', 'admission', 'qc']}><Students /></RequireRole>} />
        <Route path="students/:id" element={<RequireRole roles={['admin', 'counselor', 'admission', 'qc']}><StudentDetail /></RequireRole>} />
        <Route path="followups" element={<RequireRole roles={['admin', 'counselor']}><FollowUps /></RequireRole>} />
        <Route path="tracker" element={<RequireRole roles={['admin', 'counselor', 'admission', 'qc', 'logistics_coordinator']}><Tracker /></RequireRole>} />
        <Route path="admission/documents" element={<RequireRole roles={['admin', 'admission']}><DocumentReview /></RequireRole>} />
        <Route path="logistics" element={<Suspense fallback={<div className="empty">Loading logistics…</div>}><LogisticsShell /></Suspense>}>
          <Route index element={<LogisticsView />} />
          <Route path="student/:id" element={<LogisticsView />} />
          <Route path=":view" element={<LogisticsView />} />
        </Route>
        <Route path="qc" element={<RequireRole roles={['admin', 'qc']}><QualityControl /></RequireRole>} />
        <Route path="qc/audit" element={<RequireRole roles={['admin', 'qc']}><AuditLog /></RequireRole>} />
        <Route path="analytics" element={<RequireRole roles={['admin']}><Analytics /></RequireRole>} />
        <Route path="admin/users" element={<RequireRole roles={['admin']}><Users /></RequireRole>} />
        <Route path="admin/kb" element={<RequireRole roles={['admin']}><KnowledgeBase /></RequireRole>} />
        <Route path="chatbot" element={<Chatbot />} />
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
