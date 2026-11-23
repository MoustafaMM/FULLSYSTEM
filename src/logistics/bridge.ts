import type { Role as EtRole } from '../lib/types';
import type { Role as LogiRole } from './types';

/** Express Tracker role → Logistics module role */
export const LOGI_ROLE: Record<EtRole, LogiRole> = {
  admin: 'admin',
  logistics_coordinator: 'coordinator',
  logistics_team: 'field_officer',
  counselor: 'counselor',
  admission: 'counselor_manager',
  qc: 'counselor_manager',
};

export interface LogiTab { view: string; label: string }

/** Logistics tabs shown in the sidebar for each Express Tracker role (permissions as agreed). */
export const LOGI_TABS: Record<EtRole, LogiTab[]> = {
  admin: [
    { view: 'dashboard', label: 'Logistics Dashboard' },
    { view: 'live_ops', label: 'Live Operations' },
    { view: 'students', label: 'Arrivals Directory' },
    { view: 'counselor_tasks', label: 'Counselor Tasks' },
    { view: 'live_map', label: 'Live Map' },
    { view: 'vehicles', label: 'Vehicles' },
    { view: 'wallet_history', label: 'Wallets' },
    { view: 'overtime', label: 'Overtime' },
    { view: 'staff_history', label: 'Staff History' },
    { view: 'feedbacks', label: 'Student Feedback' },
    { view: 'quality_control', label: 'Logistics QC' },
    { view: 'presets', label: 'Task Presets' },
    { view: 'analytics', label: 'Logistics Analytics' },
  ],
  logistics_coordinator: [
    { view: 'dashboard', label: 'Logistics Dashboard' },
    { view: 'live_ops', label: 'Live Operations' },
    { view: 'students', label: 'Arrivals Directory' },
    { view: 'live_map', label: 'Live Map' },
    { view: 'vehicles', label: 'Vehicles' },
    { view: 'wallet_history', label: 'Wallets' },
    { view: 'overtime', label: 'Overtime' },
    { view: 'staff_history', label: 'Staff History' },
    { view: 'feedbacks', label: 'Student Feedback' },
    { view: 'presets', label: 'Task Presets' },
    { view: 'analytics', label: 'Logistics Analytics' },
  ],
  logistics_team: [
    { view: 'tasks', label: 'My Field Tasks' },
    { view: 'wallet', label: 'My Wallet' },
    { view: 'vehicles', label: 'Vehicles' },
    { view: 'overtime', label: 'Overtime' },
  ],
  counselor: [
    { view: 'dashboard', label: 'Logistics — My Students' },
    { view: 'tasks', label: 'Logistics Tasks' },
    { view: 'counselor_tasks', label: 'Counselor Tasks' },
    { view: 'feedbacks', label: 'Student Feedback' },
  ],
  admission: [
    { view: 'students', label: 'Arrivals Directory' },
  ],
  qc: [
    { view: 'quality_control', label: 'Logistics QC' },
    { view: 'feedbacks', label: 'Student Feedback' },
    { view: 'staff_history', label: 'Staff History' },
    { view: 'students', label: 'Arrivals Directory' },
    { view: 'analytics', label: 'Logistics Analytics' },
  ],
};

export const canSeeLogiView = (role: EtRole, view: string) =>
  view === 'student_profile' ? LOGI_TABS[role].some((t) => t.view === 'students' || t.view === 'dashboard')
    : LOGI_TABS[role].some((t) => t.view === view);
