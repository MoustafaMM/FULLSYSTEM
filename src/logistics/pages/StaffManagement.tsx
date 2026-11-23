import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  Shield, Plus, X, UserCog, Eye, EyeOff, Key, BookOpen, Calculator, Edit, ClipboardCheck,
  Clock, Search, UserX, Activity, AlertTriangle, RotateCcw
} from 'lucide-react';
import { cn } from '../components/layout/Layout';
import { formatCurrency } from '../utils/currency';
import { Role, User } from '../types';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  DEFAULT_INACTIVE_DAYS,
  UserActivityFilter,
  UserActivitySort,
  UserActivityStatus,
  filterAndSortUsersByActivity,
  formatLastAppearanceExact,
  formatLastAppearanceRelative,
  getUserActivityStatus,
  getUserActivitySummary,
  getUserLastAppearance,
} from '../utils/userPresence';

export default function StaffManagement() {
  const { t, users, addUser, updateUserPassword, language } = useAppContext();
  const [isAdding, setIsAdding] = useState(false);
  const [newUser, setNewUser] = useState<{
    name: string;
    username: string;
    password: string;
    role: Role;
  }>({ name: '', username: '', password: '', role: 'field_officer' });
  const [editingStaffUser, setEditingStaffUser] = useState<User | null>(null);
  const [editStaffForm, setEditStaffForm] = useState<{
    name: string;
    username: string;
    role: Role;
  }>({ name: '', username: '', role: 'field_officer' });
  const [editStaffError, setEditStaffError] = useState<string | null>(null);

  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [editingPasswordUser, setEditingPasswordUser] = useState<string | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');

  const [addError, setAddError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Presence & non-user filtering state
  const [searchTerm, setSearchTerm] = useState('');
  const [activityFilter, setActivityFilter] = useState<UserActivityFilter>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [inactiveDays, setInactiveDays] = useState<number>(DEFAULT_INACTIVE_DAYS);
  const [sortBy, setSortBy] = useState<UserActivitySort>('inactive_first');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const isRTL = language === 'ar';
  const isArabic = language === 'ar';

  const activitySummary = useMemo(
    () => getUserActivitySummary(users, nowMs, inactiveDays),
    [users, nowMs, inactiveDays]
  );

  const filteredUsers = useMemo(
    () =>
      filterAndSortUsersByActivity(users, {
        activityFilter,
        roleFilter,
        searchTerm,
        sortBy,
        nowMs,
        inactiveDays,
      }),
    [users, activityFilter, roleFilter, searchTerm, sortBy, nowMs, inactiveDays]
  );

  const hasActiveFilters =
    activityFilter !== 'all' || roleFilter !== 'all' || searchTerm.trim() !== '';

  const resetFilters = () => {
    setActivityFilter('all');
    setRoleFilter('all');
    setSearchTerm('');
  };

  const renderLastAppearance = (user: User, compact = false) => {
    const lastIso = getUserLastAppearance(user);
    const status: UserActivityStatus = getUserActivityStatus(user, nowMs, inactiveDays);
    const relativeLabel =
      status === 'online'
        ? t('activeNow') || 'Active now'
        : formatLastAppearanceRelative(lastIso, isArabic, nowMs);
    const exactLabel = formatLastAppearanceExact(lastIso);

    const badgeStyles: Record<UserActivityStatus, string> = {
      online: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      active: 'bg-blue-50 text-blue-700 border-blue-200',
      inactive: 'bg-amber-50 text-amber-700 border-amber-200',
      never: 'bg-rose-50 text-rose-700 border-rose-200',
    };

    const dotStyles: Record<UserActivityStatus, string> = {
      online: 'bg-emerald-500 animate-pulse',
      active: 'bg-blue-500',
      inactive: 'bg-amber-500',
      never: 'bg-rose-500',
    };

    return (
      <div className={cn('flex flex-col', compact ? 'items-end gap-0.5' : 'items-start gap-1')}>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
            badgeStyles[status]
          )}
        >
          <span className={cn('w-2 h-2 rounded-full shrink-0', dotStyles[status])} />
          <span>{relativeLabel}</span>
          {status === 'inactive' && (
            <span className="opacity-75 font-normal">
              ({t('inactiveUser') || 'Inactive'})
            </span>
          )}
        </span>
        {exactLabel ? (
          <span className="text-[11px] text-slate-400 font-mono ps-0.5">
            {exactLabel}
          </span>
        ) : (
          <span className="text-[11px] text-rose-400/90 ps-0.5">
            {t('noActivityRecorded') || 'No login or activity recorded'}
          </span>
        )}
      </div>
    );
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleUpdatePassword = async () => {
    if (editingPasswordUser && newPasswordValue) {
      setPasswordError(null);
      try {
        await updateUserPassword(editingPasswordUser, newPasswordValue);
        setEditingPasswordUser(null);
        setNewPasswordValue('');
      } catch (error) {
        setPasswordError('Failed to update password.');
      }
    }
  };

  const handleOpenEditStaff = (user: User) => {
    setEditingStaffUser(user);
    setEditStaffForm({
      name: user.name,
      username: user.username || '',
      role: user.role,
    });
    setEditStaffError(null);
  };

  const handleSaveEditStaff = async () => {
    if (!editingStaffUser || !editStaffForm.name.trim() || !editStaffForm.username.trim()) return;
    setEditStaffError(null);

    const duplicate = users.find(
      u => u.id !== editingStaffUser.id && (u.username || '').toLowerCase() === editStaffForm.username.trim().toLowerCase()
    );
    if (duplicate) {
      setEditStaffError('Username already exists.');
      return;
    }

    try {
      const updates: Record<string, any> = {
        name: editStaffForm.name.trim(),
        username: editStaffForm.username.trim(),
        role: editStaffForm.role,
      };

      // Enforce strict rule: walletBalance initialized ONLY for field_officer, omitted/removed for accountant and other roles
      if (editStaffForm.role === 'field_officer') {
        if (editingStaffUser.walletBalance === undefined) {
          updates.walletBalance = 0;
        }
      } else {
        updates.walletBalance = deleteField();
      }

      await updateDoc(doc(db, 'users', editingStaffUser.id), updates);
      setEditingStaffUser(null);
    } catch (err) {
      setEditStaffError('Failed to update staff member.');
    }
  };

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.username || !newUser.password) return;
    setAddError(null);
    try {
      const userPayload: Omit<User, 'id'> = {
        name: newUser.name,
        username: newUser.username,
        password: newUser.password,
        role: newUser.role,
      };

      // Strictly initialize walletBalance ONLY for field_officer accounts (explicitly omitted for accountant and others)
      if (newUser.role === 'field_officer') {
        userPayload.walletBalance = 0;
      }

      await addUser(userPayload);
      setIsAdding(false);
      setNewUser({ name: '', username: '', password: '', role: 'field_officer' });
    } catch (error: any) {
      if (error.message === 'DUPLICATE_USERNAME') {
        setAddError('Username already exists.');
      } else {
        setAddError('Failed to add user. Please try again.');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-blue-950">{t('staffManagement')}</h2>
          <p className="text-sm text-slate-500 mt-1">Manage platform access and user roles</p>
        </div>
        
        <button 
          onClick={() => setIsAdding(true)}
          className="flex-shrink-0 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-colors text-sm"
        >
          <Plus size={18} /> <span>{t('addStaff')}</span>
        </button>
      </div>

      {/* Website Activity & Non-Users Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => setActivityFilter('all')}
          className={cn(
            'text-start p-4 rounded-2xl border transition-all cursor-pointer',
            activityFilter === 'all'
              ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('allStaff') || 'All Staff'}
            </span>
            <UserCog size={16} className="text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{activitySummary.total}</div>
          <div className="mt-1 text-xs text-slate-500">
            {activitySummary.online} {t('activeNow') || 'Active now'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActivityFilter(activityFilter === 'not_using' ? 'all' : 'not_using')}
          className={cn(
            'text-start p-4 rounded-2xl border transition-all cursor-pointer',
            activityFilter === 'not_using'
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20'
              : 'bg-white border-rose-200/80 hover:border-rose-300'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider">
              {t('notUsingWebsite') || 'Not Using Website'}
            </span>
            <UserX size={16} className="text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-700">{activitySummary.notUsing}</div>
          <div className="mt-1 text-xs text-rose-600/80">
            {activitySummary.never} {t('neverAppearedFilter') || 'Never'} • {activitySummary.inactive} {t('inactiveUsersFilter') || 'Inactive'} ({inactiveDays}d+)
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActivityFilter(activityFilter === 'never' ? 'all' : 'never')}
          className={cn(
            'text-start p-4 rounded-2xl border transition-all cursor-pointer',
            activityFilter === 'never'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20'
              : 'bg-white border-slate-200 hover:border-amber-200'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('neverAppearedFilter') || 'Never Appeared'}
            </span>
            <AlertTriangle size={16} className="text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{activitySummary.never}</div>
          <div className="mt-1 text-xs text-slate-500">
            {t('noActivityRecorded') || 'No login or activity recorded'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActivityFilter(activityFilter === 'active' ? 'all' : 'active')}
          className={cn(
            'text-start p-4 rounded-2xl border transition-all cursor-pointer',
            activityFilter === 'active'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20'
              : 'bg-white border-slate-200 hover:border-emerald-200'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('activeUsersFilter') || 'Active'} (≤ {inactiveDays}{isArabic ? ' ي' : 'd'})
            </span>
            <Activity size={16} className="text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{activitySummary.active}</div>
          <div className="mt-1 text-xs text-slate-500">
            {activitySummary.online} {t('activeNow') || 'Active now'}
          </div>
        </button>
      </div>

      {/* Filter, Threshold & Search Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className={cn('absolute top-1/2 -translate-y-1/2 text-slate-400', isRTL ? 'right-3' : 'left-3')} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={t('searchStaffPlaceholder') || 'Search staff by name or username...'}
              className={cn(
                'w-full py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600',
                isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
              )}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as 'all' | Role)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">{t('allRoles') || 'All Roles'}</option>
              <option value="field_officer">{t('field_officer')}</option>
              <option value="counselor">{t('counselor')}</option>
              <option value="counselor_manager">{t('counselor_manager') || 'Counselors Manager'}</option>
              <option value="coordinator">{t('coordinator')}</option>
              <option value="accountant">{t('accountant') || 'Accountant'}</option>
              <option value="admin">{t('admin')}</option>
            </select>

            <div className="flex items-center gap-1.5 border border-slate-200 rounded-xl px-2.5 py-1.5 bg-slate-50 text-xs text-slate-600">
              <Clock size={14} className="text-slate-400 shrink-0" />
              <span className="font-medium whitespace-nowrap">{t('inactivityThreshold') || 'Inactive after'}:</span>
              <select
                value={inactiveDays}
                onChange={e => setInactiveDays(Number(e.target.value))}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value={3}>3 {t('daysCount') || 'days'}</option>
                <option value={7}>7 {t('daysCount') || 'days'}</option>
                <option value={14}>14 {t('daysCount') || 'days'}</option>
                <option value={30}>30 {t('daysCount') || 'days'}</option>
              </select>
            </div>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as UserActivitySort)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="inactive_first">{t('sortInactiveFirst') || 'Least Recently Seen'}</option>
              <option value="recent_first">{t('sortRecentFirst') || 'Most Recently Seen'}</option>
              <option value="name">{t('sortByName') || 'Name (A-Z)'}</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: t('allStaff') || 'All Staff', count: activitySummary.total },
                { id: 'not_using', label: t('notUsingWebsite') || 'Not Using Website', count: activitySummary.notUsing },
                { id: 'never', label: t('neverAppearedFilter') || 'Never Appeared', count: activitySummary.never },
                { id: 'inactive', label: `${t('inactiveUsersFilter') || 'Inactive'} (${inactiveDays}${isArabic ? ' ي' : 'd'}+)`, count: activitySummary.inactive },
                { id: 'active', label: t('activeUsersFilter') || 'Active', count: activitySummary.active },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivityFilter(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer border',
                  activityFilter === tab.id
                    ? tab.id === 'not_using' || tab.id === 'never'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-blue-950 text-white border-blue-950'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded-md text-[10px] font-bold',
                    activityFilter === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-white text-slate-700 border border-slate-200'
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>{t('resetFilters') || 'Reset Filters'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <UserX size={32} className="mx-auto text-slate-300" />
            <p className="text-sm font-medium text-slate-500">
              {t('noMatchingStaff') || 'No staff members match your current filters.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>{t('resetFilters') || 'Reset Filters'}</span>
              </button>
            )}
          </div>
        ) : (
          <>
        {/* Mobile Responsive Staff Cards View */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredUsers.map(user => (
            <div key={user.id} className="p-4 hover:bg-slate-50 transition-colors space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm border border-blue-100 shrink-0">
                    {user.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{user.name}</h4>
                    <span className="font-mono text-xs text-slate-500">@{user.username || '-'}</span>
                  </div>
                </div>

                <span className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0",
                  user.role === 'admin' ? "bg-purple-100 text-purple-700" :
                  user.role === 'coordinator' ? "bg-blue-100 text-blue-700" :
                  user.role === 'counselor' ? "bg-amber-100 text-amber-700" :
                  user.role === 'counselor_manager' ? "bg-rose-100 text-rose-700" :
                  user.role === 'accountant' ? "bg-indigo-100 text-indigo-700" :
                  "bg-emerald-100 text-emerald-700"
                )}>
                  {user.role === 'admin' && <Shield size={11} />}
                  {user.role === 'coordinator' && <UserCog size={11} />}
                  {user.role === 'counselor' && <BookOpen size={11} />}
                  {user.role === 'counselor_manager' && <ClipboardCheck size={11} />}
                  {user.role === 'accountant' && <Calculator size={11} />}
                  {t(user.role as any) || (user.role === 'accountant' ? 'Accountant' : user.role)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                  <Clock size={13} className="text-slate-400" />
                  {t('lastAppearance') || 'Last Appearance'}:
                </span>
                <div className="text-end">
                  {renderLastAppearance(user, true)}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-semibold">{t('password')}:</span>
                  <span className="font-mono font-medium">
                    {visiblePasswords[user.id] ? user.password : '••••••••'}
                  </span>
                  <button onClick={() => togglePasswordVisibility(user.id)} className="text-slate-400 hover:text-slate-600 p-1">
                    {visiblePasswords[user.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                {user.role === 'field_officer' && (
                  <span className={cn(
                    "font-bold px-2 py-0.5 rounded-md border text-[11px]",
                    (user.walletBalance ?? 0) < 50
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  )}>
                    {formatCurrency(user.walletBalance ?? 0)}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleOpenEditStaff(user)}
                  className="px-3 py-1.5 rounded-xl text-slate-700 hover:bg-slate-100 text-xs font-bold border border-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit size={13} />
                  <span>Edit</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setEditingPasswordUser(user.id)} 
                  className="px-3 py-1.5 rounded-xl text-blue-700 bg-blue-50 hover:bg-blue-100 text-xs font-bold border border-blue-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Key size={13} />
                  <span>Change Password</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Data Table */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('staffName')}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('username')}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('role')}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('lastAppearance') || 'Last Appearance'}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('walletBalance')}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('password')}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                        {user.name.charAt(0)}
                      </div>
                      <span className="font-semibold text-slate-900">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-mono text-sm">
                    {user.username || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                      user.role === 'admin' ? "bg-purple-100 text-purple-700" :
                      user.role === 'coordinator' ? "bg-blue-100 text-blue-700" :
                      user.role === 'counselor' ? "bg-amber-100 text-amber-700" :
                      user.role === 'counselor_manager' ? "bg-rose-100 text-rose-700" :
                      user.role === 'accountant' ? "bg-indigo-100 text-indigo-700" :
                      "bg-emerald-100 text-emerald-700"
                    )}>
                      {user.role === 'admin' && <Shield size={12} />}
                      {user.role === 'coordinator' && <UserCog size={12} />}
                      {user.role === 'counselor' && <BookOpen size={12} />}
                      {user.role === 'counselor_manager' && <ClipboardCheck size={12} />}
                      {user.role === 'accountant' && <Calculator size={12} />}
                      {t(user.role as any) || (user.role === 'accountant' ? 'Accountant' : user.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {renderLastAppearance(user)}
                  </td>
                  <td className="px-6 py-4">
                    {user.role === 'field_officer' ? (
                      <div className="flex items-center">
                        <span className={cn(
                          "inline-flex items-center font-bold text-sm px-2.5 py-1 rounded-lg border",
                          (user.walletBalance ?? 0) < 50
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        )}>
                          {formatCurrency(user.walletBalance ?? 0)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-slate-600">
                        {visiblePasswords[user.id] ? user.password : '••••••••'}
                      </span>
                      <button onClick={() => togglePasswordVisibility(user.id)} className="text-slate-400 hover:text-slate-600">
                        {visiblePasswords[user.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => handleOpenEditStaff(user)}
                        className="text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1 text-sm"
                      >
                        <Edit size={14} /> Edit
                      </button>
                      <button 
                        onClick={() => setEditingPasswordUser(user.id)} 
                        className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 text-sm"
                      >
                        <Key size={14} /> Change Password
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          </>
        )}
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-blue-950/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900">{t('addStaff')}</h3>
              <button onClick={() => { setIsAdding(false); setAddError(null); }} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            {addError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100 font-medium">
                {addError}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('staffName')}</label>
                <input 
                  type="text" 
                  value={newUser.name}
                  onChange={e => setNewUser({...newUser, name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('username')}</label>
                <input 
                  type="text" 
                  value={newUser.username}
                  onChange={e => setNewUser({...newUser, username: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('password')}</label>
                <input 
                  type="password" 
                  value={newUser.password}
                  onChange={e => setNewUser({...newUser, password: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('role')}</label>
                <select 
                  value={newUser.role}
                  onChange={e => setNewUser({...newUser, role: e.target.value as Role})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                >
                  <option value="field_officer">{t('field_officer')}</option>
                  <option value="coordinator">{t('coordinator')}</option>
                  <option value="admin">{t('admin')}</option>
                  <option value="counselor">{t('counselor')}</option>
                  <option value="counselor_manager">{t('counselor_manager') || 'Counselors Manager'}</option>
                  <option value="accountant">{t('accountant') || 'Accountant'}</option>
                </select>
              </div>
              
              <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-slate-100">
                <button 
                  onClick={() => { setIsAdding(false); setAddError(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  {t('cancel')}
                </button>
                <button 
                  onClick={handleAddUser}
                  disabled={!newUser.name || !newUser.username || !newUser.password}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {t('add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingStaffUser && (
        <div className="fixed inset-0 bg-blue-950/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900">Edit Staff Member</h3>
              <button onClick={() => { setEditingStaffUser(null); setEditStaffError(null); }} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {editStaffError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100 font-medium">
                {editStaffError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('staffName')}</label>
                <input
                  type="text"
                  value={editStaffForm.name}
                  onChange={e => setEditStaffForm({ ...editStaffForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('username')}</label>
                <input
                  type="text"
                  value={editStaffForm.username}
                  onChange={e => setEditStaffForm({ ...editStaffForm, username: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('role')}</label>
                <select
                  value={editStaffForm.role}
                  onChange={e => setEditStaffForm({ ...editStaffForm, role: e.target.value as Role })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                >
                  <option value="field_officer">{t('field_officer')}</option>
                  <option value="coordinator">{t('coordinator')}</option>
                  <option value="admin">{t('admin')}</option>
                  <option value="counselor">{t('counselor')}</option>
                  <option value="counselor_manager">{t('counselor_manager') || 'Counselors Manager'}</option>
                  <option value="accountant">{t('accountant') || 'Accountant'}</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-slate-100">
                <button
                  onClick={() => { setEditingStaffUser(null); setEditStaffError(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleSaveEditStaff}
                  disabled={!editStaffForm.name.trim() || !editStaffForm.username.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {t('save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingPasswordUser && (
        <div className="fixed inset-0 bg-blue-950/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900">Change Password</h3>
              <button onClick={() => { setEditingPasswordUser(null); setPasswordError(null); }} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            {passwordError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100 font-medium">
                {passwordError}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                <input 
                  type="password" 
                  value={newPasswordValue}
                  onChange={e => setNewPasswordValue(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
              </div>
              
              <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-slate-100">
                <button 
                  onClick={() => { setEditingPasswordUser(null); setPasswordError(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  {t('cancel')}
                </button>
                <button 
                  onClick={handleUpdatePassword}
                  disabled={!newPasswordValue}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  Save Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
