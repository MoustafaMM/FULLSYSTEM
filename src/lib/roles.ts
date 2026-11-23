import type { Role } from './types';

export const ROLE_LABEL: Record<Role, string> = {
  counselor: 'Counselor (Sales)',
  admission: 'Admission',
  logistics_coordinator: 'Logistics — Coordinator',
  logistics_team: 'Logistics — Team',
  qc: 'Quality Control',
  admin: 'Admin',
};

export interface NavItem {
  to: string;
  label: string;
  roles: Role[];
  group: 'Sales & Admission' | 'Visa' | 'Quality' | 'Admin' | 'Tools';
}

const ALL: Role[] = ['admin', 'counselor', 'admission', 'logistics_coordinator', 'logistics_team', 'qc'];

/** Core tabs. Logistics tabs are added from src/logistics/bridge.ts (LOGI_TABS). */
export const NAV: NavItem[] = [
  { to: '/analytics', label: 'Analytics', roles: ['admin'], group: 'Admin' },
  { to: '/students', label: 'Students & Pipeline', roles: ['admin', 'counselor', 'admission', 'qc'], group: 'Sales & Admission' },
  { to: '/followups', label: 'Follow-ups', roles: ['admin', 'counselor'], group: 'Sales & Admission' },
  { to: '/admission/documents', label: 'Document Review', roles: ['admin', 'admission'], group: 'Sales & Admission' },
  { to: '/tracker', label: 'Visa Tracker', roles: ['admin', 'counselor', 'admission', 'qc', 'logistics_coordinator'], group: 'Visa' },
  { to: '/qc', label: 'Quality Control', roles: ['admin', 'qc'], group: 'Quality' },
  { to: '/qc/audit', label: 'Audit Log', roles: ['admin', 'qc'], group: 'Quality' },
  { to: '/admin/users', label: 'Users & Roles', roles: ['admin'], group: 'Admin' },
  { to: '/admin/kb', label: 'Chatbot Answers', roles: ['admin'], group: 'Admin' },
  { to: '/chatbot', label: 'Sales Assistant', roles: ALL, group: 'Tools' },
];

export const NAV_GROUP_ORDER = ['Sales & Admission', 'Visa', 'Logistics', 'Quality', 'Admin', 'Tools'] as const;

export const HOME_BY_ROLE: Record<Role, string> = {
  admin: '/analytics',
  counselor: '/students',
  admission: '/admission/documents',
  logistics_coordinator: '/logistics/dashboard',
  logistics_team: '/logistics/tasks',
  qc: '/qc',
};

export const can = {
  editPipeline: (r: Role) => r === 'counselor' || r === 'admin',
  reviewAdmission: (r: Role) => r === 'admission' || r === 'admin',
  raiseQc: (r: Role) => r === 'qc' || r === 'admin',
  seeAudit: (r: Role) => r === 'qc' || r === 'admin',
};
