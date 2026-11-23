import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { HOME_BY_ROLE } from '../lib/roles';
import type { Role } from '../lib/types';

export default function RequireRole({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="center-screen">Loading…</div>;
  if (!user || !profile) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(profile.role)) return <Navigate to={HOME_BY_ROLE[profile.role]} replace />;
  return <>{children}</>;
}
