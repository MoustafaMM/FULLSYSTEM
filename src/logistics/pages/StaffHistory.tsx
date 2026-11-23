import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Users, RotateCcw, Search, Clock, CheckCircle2, ChevronRight, X, Calendar, Activity, 
  ArrowLeft, Star, ThumbsUp, AlertTriangle, FileText, MapPin, Receipt, 
  Camera, Check, ExternalLink, Shield, ShieldCheck, Car, User as UserIcon, Phone, Mail, 
  ArrowUpRight, ArrowDownRight, Filter, Eye, Layers, DollarSign, Wallet, XCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { Task, SubTask, Expense } from '../types';
import { formatCurrency } from '../utils/currency';
import { formatDateDDMMYYYY } from '../utils/dateFormat';
import { resolveExpenseVehicle } from '../utils/vehicleDetection';
import { cn } from '../components/layout/Layout';
import PhotoLightboxModal from '../components/PhotoLightboxModal';
import QCReviewModal from '../components/QCReviewModal';
import { QC_GRADES, getQCGradeLabel } from '../utils/qualityControl';
import { isCommunicationSubTask } from '../utils/taskSteps';
import {
  getLocalDateStr,
  getTaskAnalyticsGroup,
  getTaskCategory,
  getTaskDisplayTitle,
  getTaskScheduleBucket,
  getTaskSearchableText,
  getTaskServiceLabel,
  getTaskStatusBadgeClasses,
  getTaskSubjectName,
  isOpenTask,
  matchesTaskTypeFilter,
  normalizeTaskStatus
} from '../utils/taskClassification';

interface SelectedMedia {
  url: string;
  timestamp: string;
  location: string;
  title?: string;
  type?: 'subtask_proof' | 'receipt' | 'communication';
  studentName?: string;
  amount?: number;
  vehicleLabel?: string;
}

/**
 * Format a duration in milliseconds into human-readable simple English or Arabic.
 * Examples: "1 hour 45 mins", "30 mins", "2 hours"
 */
function formatDurationSimple(ms: number, isArabic = false): string {
  if (ms <= 0) return isArabic ? 'أقل من دقيقة' : 'Less than 1 min';
  const totalMinutes = Math.round(ms / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (isArabic) {
    if (days > 0) {
      const dStr = `${days} ${days === 1 ? 'يوم' : 'أيام'}`;
      const hStr = hours > 0 ? ` و ${hours} ${hours === 1 ? 'ساعة' : 'ساعات'}` : '';
      return `${dStr}${hStr}`;
    }
    if (hours > 0) {
      const hStr = `${hours} ${hours === 1 ? 'ساعة' : 'ساعات'}`;
      const mStr = minutes > 0 ? ` و ${minutes} ${minutes === 1 ? 'دقيقة' : 'دقائق'}` : '';
      return `${hStr}${mStr}`;
    }
    return `${minutes} ${minutes === 1 ? 'دقيقة' : 'دقائق'}`;
  }

  if (days > 0) {
    const dStr = `${days} ${days === 1 ? 'day' : 'days'}`;
    const hStr = hours > 0 ? ` ${hours} ${hours === 1 ? 'hour' : 'hours'}` : '';
    return `${dStr}${hStr}`;
  }

  if (hours > 0) {
    if (minutes > 0) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
    }
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  if (minutes > 0) {
    return `${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
  }

  return 'Less than 1 min';
}

export default function StaffHistory() {
  const { t, users, tasks, presets, students, expenses, vehicles, currentUser, qcReviews, language } = useAppContext();
  const isAdminQC = currentUser?.role === 'admin';
  const [qcReviewTask, setQcReviewTask] = useState<Task | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOfficerId, setSelectedOfficerId] = useState<string | null>(null);

  // Filter & View state for the selected officer's task ledger
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress' | 'pending' | 'cancelled'>('all');
  const [presetFilter, setPresetFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'on_time'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'student_preset' | 'student_custom' | 'non_student'>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [viewMode, setViewMode] = useState<'detailed' | 'compact'>('detailed');

  // Media Inspection Lightbox
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);

  const isRTL = language === 'ar';
  const todayStr = getLocalDateStr();
  const fieldOfficers = useMemo(() => users.filter(u => u.role === 'field_officer'), [users]);

  const filteredOfficers = useMemo(() => {
    return fieldOfficers.filter(officer => 
      officer.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (officer.username || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [fieldOfficers, searchTerm]);

  const selectedOfficer = useMemo(() => {
    return users.find(u => u.id === selectedOfficerId) || null;
  }, [users, selectedOfficerId]);

  // Tasks assigned to selected officer
  const officerTasks = useMemo(() => {
    if (!selectedOfficerId) return [];
    return tasks.filter(t => t.assigneeId === selectedOfficerId);
  }, [tasks, selectedOfficerId]);

  // Expenses logged by selected officer
  const officerExpenses = useMemo(() => {
    if (!selectedOfficerId) return [];
    return expenses.filter(e => e.userId === selectedOfficerId);
  }, [expenses, selectedOfficerId]);

  // KPI Calculations for the selected officer (all 4 statuses strictly separated)
  const kpiStats = useMemo(() => {
    if (!selectedOfficerId) return null;

    const totalAssigned = officerTasks.length;
    const completedTasks = officerTasks.filter(t => normalizeTaskStatus(t) === 'completed');
    const inProgressTasks = officerTasks.filter(t => normalizeTaskStatus(t) === 'in_progress');
    const pendingTasks = officerTasks.filter(t => normalizeTaskStatus(t) === 'pending');
    const cancelledTasks = officerTasks.filter(t => normalizeTaskStatus(t) === 'cancelled');
    const slaRate = 100;

    // Average Completion Duration calculation strictly from startedAt -> completedAt
    let totalDurationMs = 0;
    let completedWithDuration = 0;
    completedTasks.forEach(task => {
      const start = task.startedAt ? new Date(task.startedAt).getTime() : 0;
      const end = task.completedAt ? new Date(task.completedAt).getTime() : 0;
      if (start > 0 && end > start) {
        const diff = end - start;
        totalDurationMs += diff;
        completedWithDuration++;
      }
    });

    const avgMs = completedWithDuration > 0 ? Math.round(totalDurationMs / completedWithDuration) : 0;
    const avgDurationStr = completedWithDuration > 0 ? formatDurationSimple(avgMs, isRTL) : (isRTL ? 'لا توجد بيانات' : 'No data yet');

    // Student Ratings for this officer's tasks
    const feedbackList = officerTasks
      .filter(t => t.feedback && t.feedback.rating)
      .map(t => t.feedback!);
    
    const totalReviews = feedbackList.length;
    const avgRating = totalReviews > 0
      ? (feedbackList.reduce((sum, f) => sum + f.rating, 0) / totalReviews).toFixed(1)
      : 'N/A';

    const positiveReviews = feedbackList.filter(
      f => f.satisfaction === 'very_satisfied' || f.satisfaction === 'satisfied' || f.rating >= 4
    ).length;
    const csatPositiveRate = totalReviews > 0 ? Math.round((positiveReviews / totalReviews) * 100) : null;

    // Total Operational Expenses logged
    const totalExpensesAmount = officerExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    return {
      totalAssigned,
      completedCount: completedTasks.length,
      inProgressCount: inProgressTasks.length,
      pendingCount: pendingTasks.length,
      cancelledCount: cancelledTasks.length,
      slaRate,
      avgDurationStr,
      avgRating,
      totalReviews,
      csatPositiveRate,
      totalExpensesAmount,
      expenseReceiptsCount: officerExpenses.length,
    };
  }, [selectedOfficerId, officerTasks, officerExpenses, isRTL]);

  // Average Duration & Task Counts per Task Type for the selected officer
  interface OfficerTaskTypeStats {
    id: string;
    name: string;
    totalTasks: number;
    completedCount: number;
    inProgressCount: number;
    pendingCount: number;
    totalDurationMs: number;
    averageDurationMs: number;
    formattedDuration: string;
  }

  const officerTaskTypeStats: OfficerTaskTypeStats[] = useMemo(() => {
    if (!selectedOfficerId) return [];

    const map = new Map<string, {
      name: string;
      totalTasks: number;
      completedCount: number;
      inProgressCount: number;
      pendingCount: number;
      durations: number[];
    }>();

    // Pre-seed with student SOP presets under collision-free key
    presets.forEach(p => {
      const name = (isRTL && p.nameAr) ? p.nameAr : (p.nameEn || p.id);
      map.set(`student_preset:${p.id}`, { name, totalTasks: 0, completedCount: 0, inProgressCount: 0, pendingCount: 0, durations: [] });
    });

    // Populate from officer's non-cancelled tasks
    officerTasks.forEach(task => {
      const effectiveStatus = normalizeTaskStatus(task);
      if (effectiveStatus === 'cancelled') return;
      const group = getTaskAnalyticsGroup(task, presets, language);

      if (!map.has(group.key)) {
        map.set(group.key, { name: group.label, totalTasks: 0, completedCount: 0, inProgressCount: 0, pendingCount: 0, durations: [] });
      }

      const entry = map.get(group.key)!;
      entry.totalTasks++;
      if (effectiveStatus === 'completed') {
        entry.completedCount++;
        const start = task.startedAt ? new Date(task.startedAt).getTime() : 0;
        const end = task.completedAt ? new Date(task.completedAt).getTime() : 0;
        if (start > 0 && end > start) {
          entry.durations.push(end - start);
        }
      } else if (effectiveStatus === 'in_progress') {
        entry.inProgressCount++;
      } else if (effectiveStatus === 'pending') {
        entry.pendingCount++;
      }
    });

    const list: OfficerTaskTypeStats[] = [];
    map.forEach((data, id) => {
      if (data.totalTasks > 0 || data.completedCount > 0) {
        const count = data.durations.length;
        const totalMs = data.durations.reduce((acc, d) => acc + d, 0);
        const avgMs = count > 0 ? Math.round(totalMs / count) : 0;
        list.push({
          id,
          name: data.name,
          totalTasks: data.totalTasks,
          completedCount: data.completedCount,
          inProgressCount: data.inProgressCount,
          pendingCount: data.pendingCount,
          totalDurationMs: totalMs,
          averageDurationMs: avgMs,
          formattedDuration: count > 0 ? formatDurationSimple(avgMs, isRTL) : (isRTL ? 'لا توجد بيانات' : 'No completed tasks'),
        });
      }
    });

    if (list.length === 0) {
      presets.forEach(p => {
        list.push({
          id: `student_preset:${p.id}`,
          name: (isRTL && p.nameAr) ? p.nameAr : (p.nameEn || p.id),
          totalTasks: 0,
          completedCount: 0,
          inProgressCount: 0,
          pendingCount: 0,
          totalDurationMs: 0,
          averageDurationMs: 0,
          formattedDuration: isRTL ? 'لا توجد بيانات' : 'No completed tasks',
        });
      });
    }

    list.sort((a, b) => {
      if (a.completedCount > 0 && b.completedCount === 0) return -1;
      if (a.completedCount === 0 && b.completedCount > 0) return 1;
      if (a.completedCount > 0 && b.completedCount > 0) {
        return b.averageDurationMs - a.averageDurationMs;
      }
      return b.totalTasks - a.totalTasks;
    });

    return list;
  }, [selectedOfficerId, officerTasks, presets, isRTL, language]);

  const maxOfficerTypeDurationMs = useMemo(() => {
    return Math.max(...officerTaskTypeStats.map(s => s.averageDurationMs), 0);
  }, [officerTaskTypeStats]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'all') count++;
    if (presetFilter !== 'all') count++;
    if (outcomeFilter !== 'all') count++;
    if (categoryFilter !== 'all') count++;
    if (fromDate) count++;
    if (toDate) count++;
    if (ledgerSearch.trim()) count++;
    return count;
  }, [statusFilter, presetFilter, outcomeFilter, categoryFilter, fromDate, toDate, ledgerSearch]);

  const handleClearFilters = () => {
    setStatusFilter('all');
    setPresetFilter('all');
    setOutcomeFilter('all');
    setCategoryFilter('all');
    setFromDate('');
    setToDate('');
    setLedgerSearch('');
  };

  // Filtered tasks for the Ledger feed/table
  const filteredLedgerTasks = useMemo(() => {
    return officerTasks
      .filter(task => {
        // 1. Status filter
        const effectiveStatus = normalizeTaskStatus(task);
        if (statusFilter !== 'all' && effectiveStatus !== statusFilter) return false;

        // 2. Preset / Task Type filter
        if (!matchesTaskTypeFilter(task, presetFilter)) return false;

        // 3. Execution Outcome filter
        if (outcomeFilter !== 'all') {
          if (outcomeFilter === 'on_time' && effectiveStatus !== 'completed') return false;
        }

        // 4. Task Category filter (student_preset vs student_custom vs non_student)
        if (categoryFilter !== 'all' && getTaskCategory(task) !== categoryFilter) return false;

        // 5. Date Range filter (explicit range excludes undated records)
        const taskDate = task.taskDate || (task.completedAt ? task.completedAt.slice(0, 10) : (task.startedAt ? task.startedAt.slice(0, 10) : (task.createdAt ? task.createdAt.slice(0, 10) : '')));
        if ((fromDate || toDate) && !taskDate) return false;
        if (fromDate && taskDate < fromDate) return false;
        if (toDate && taskDate > toDate) return false;

        // 6. Search text filter
        if (ledgerSearch.trim()) {
          const q = ledgerSearch.toLowerCase().trim();
          const haystack = getTaskSearchableText(task, presets, students, users);
          if (!haystack.includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.completedAt || a.startedAt || a.createdAt).getTime();
        const timeB = new Date(b.completedAt || b.startedAt || b.createdAt).getTime();
        return timeB - timeA;
      });
  }, [officerTasks, statusFilter, presetFilter, outcomeFilter, categoryFilter, fromDate, toDate, ledgerSearch, students, presets, users]);

  const formatTaskDuration = (start?: string, end?: string) => {
    if (!start) return '--';
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const diffMs = endTime - startTime;
    if (diffMs <= 0) return isRTL ? 'أقل من دقيقة' : '0 mins';
    return formatDurationSimple(diffMs, isRTL);
  };

  // -------------------------------------------------------------
  // VIEW 1: FIELD OFFICER DIRECTORY & SELECTION CARDS
  // -------------------------------------------------------------
  if (!selectedOfficerId || !selectedOfficer) {
    return (
      <div className="space-y-6 relative">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{t('staffHistory')}</h2>
            <p className="text-sm text-slate-500 mt-1">
              {isRTL 
                ? 'ملفات أداء الموظفين الميدانيين، معدلات الالتزام بالوقت، وسجل تنفيذ المهام'
                : 'Field officer profiles, on-time completion rates, and complete task execution history'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 sm:p-6">
          <div className="relative mb-6 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder={isRTL ? 'البحث عن الموظفين بالاسم...' : 'Search officers by name or username...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredOfficers.map(officer => {
              const officerAssignedTasks = tasks.filter(t => t.assigneeId === officer.id);
              const completedCount = officerAssignedTasks.filter(t => normalizeTaskStatus(t) === 'completed').length;
              const inProgressCount = officerAssignedTasks.filter(t => normalizeTaskStatus(t) === 'in_progress').length;
              const pendingCount = officerAssignedTasks.filter(t => normalizeTaskStatus(t) === 'pending').length;
              const cancelledCount = officerAssignedTasks.filter(t => normalizeTaskStatus(t) === 'cancelled').length;
              
              const totalFinished = completedCount;
              const slaPercent = totalFinished > 0 ? Math.round((completedCount / totalFinished) * 100) : 100;
              
              const feedbackRatings = officerAssignedTasks
                .filter(t => t.feedback?.rating)
                .map(t => t.feedback!.rating);
              const avgRating = feedbackRatings.length > 0
                ? (feedbackRatings.reduce((sum, r) => sum + r, 0) / feedbackRatings.length).toFixed(1)
                : null;

              const officerTotalExpenses = expenses
                .filter(e => e.userId === officer.id)
                .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

              return (
                <div 
                  key={officer.id}
                  onClick={() => setSelectedOfficerId(officer.id)}
                  className="p-5 border border-slate-200 rounded-2xl hover:border-red-400 hover:shadow-md transition-all cursor-pointer bg-white group flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Avatar, Name & On-Time badge */}
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xl group-hover:scale-105 transition-transform shadow-inner">
                          {officer.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 group-hover:text-red-600 transition-colors text-base">
                            {officer.name}
                          </h3>
                          <p className="text-xs text-slate-500 font-mono">@{officer.username}</p>
                        </div>
                      </div>

                      <span className={cn(
                        "px-2.5 py-1 text-xs font-bold rounded-full border flex items-center gap-1",
                        slaPercent >= 90 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : slaPercent >= 75 
                          ? "bg-amber-50 text-amber-700 border-amber-200" 
                          : "bg-red-50 text-red-700 border-red-200"
                      )}>
                        <Activity size={12} />
                        {slaPercent}% {isRTL ? 'بالوقت' : 'On-Time'}
                      </span>
                    </div>

                    {/* Operational Metric Grid — Strictly Separated by Status */}
                    <div className="grid grid-cols-4 gap-1.5 text-center mb-4">
                      <div className="bg-blue-50/70 p-2 rounded-xl border border-blue-100">
                        <span className="text-blue-600 text-[9px] uppercase font-bold tracking-wider block mb-0.5 truncate">
                          {isRTL ? 'قيد التنفيذ' : 'Live'}
                        </span>
                        <span className="font-black text-blue-700 text-base">{inProgressCount}</span>
                      </div>
                      <div className="bg-amber-50/70 p-2 rounded-xl border border-amber-100">
                        <span className="text-amber-700 text-[9px] uppercase font-bold tracking-wider block mb-0.5 truncate">
                          {isRTL ? 'معلقة' : 'Pending'}
                        </span>
                        <span className="font-black text-amber-700 text-base">{pendingCount}</span>
                      </div>
                      <div className="bg-emerald-50/70 p-2 rounded-xl border border-emerald-100">
                        <span className="text-emerald-700 text-[9px] uppercase font-bold tracking-wider block mb-0.5 truncate">
                          {isRTL ? 'مكتملة' : 'Done'}
                        </span>
                        <span className="font-black text-emerald-700 text-base">{completedCount}</span>
                      </div>
                      <div className="bg-rose-50/70 p-2 rounded-xl border border-rose-100">
                        <span className="text-rose-700 text-[9px] uppercase font-bold tracking-wider block mb-0.5 truncate">
                          {isRTL ? 'ملغاة' : 'Cancelled'}
                        </span>
                        <span className="font-black text-rose-700 text-base">{cancelledCount}</span>
                      </div>
                    </div>

                    {/* Additional Officer Stats */}
                    <div className="space-y-1.5 text-xs text-slate-500 pt-2 border-t border-slate-100">
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1"><Wallet size={13} className="text-slate-400" /> {isRTL ? 'رصيد المحفظة:' : 'Wallet Balance:'}</span>
                        <span className="font-bold text-slate-800">{formatCurrency(officer.walletBalance ?? 0)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1"><Receipt size={13} className="text-slate-400" /> {isRTL ? 'إجمالي المصروفات:' : 'Total Expenses:'}</span>
                        <span className="font-bold text-slate-800">{formatCurrency(officerTotalExpenses)}</span>
                      </div>
                      {avgRating && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1"><Star size={13} className="text-amber-400 fill-amber-400" /> {isRTL ? 'تقييم الطلاب:' : 'Student Rating:'}</span>
                          <span className="font-bold text-slate-800">{avgRating} / 5.0</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Link Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-red-600 group-hover:text-red-700">
                    <span>{isRTL ? 'عرض سجل وأداء الموظف' : 'View Officer History'}</span>
                    <ChevronRight size={16} className="transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              );
            })}

            {filteredOfficers.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400">
                <Users size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="text-base font-medium">{isRTL ? 'لم يتم العثور على موظفين ميدانيين.' : 'No field officers found.'}</p>
                <p className="text-xs mt-1">{isRTL ? 'يرجى تجربة كلمة بحث أخرى.' : 'Try refining your search term.'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: COMPREHENSIVE OFFICER PROFILE & DETAILED TASK HISTORY
  // -------------------------------------------------------------
  return (
    <div className="space-y-6 w-full pb-16">
      {/* Top Navigation & Officer Profile Header Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setSelectedOfficerId(null)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors shrink-0"
          >
            <ArrowLeft size={16} />
            <span>{t('backToOfficers')}</span>
          </button>

          <div className="h-6 w-px bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xl shadow-inner">
              {selectedOfficer.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-slate-900">{selectedOfficer.name}</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-md uppercase tracking-wider">
                  {t('field_officer')}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                @{selectedOfficer.username} &bull; ID: {selectedOfficer.id}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Switch Officer Dropdown & Balance Info */}
        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end flex-wrap">
          <div className="bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-xl flex items-center gap-2">
            <Wallet size={16} className="text-red-500" />
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                {isRTL ? 'رصيد المحفظة' : 'Wallet Balance'}
              </span>
              <span className="text-sm font-black text-slate-900">{formatCurrency(selectedOfficer.walletBalance ?? 0)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 hidden sm:inline">
              {isRTL ? 'تغيير الموظف:' : 'Switch Officer:'}
            </label>
            <select
              value={selectedOfficerId}
              onChange={(e) => setSelectedOfficerId(e.target.value)}
              className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl px-3 py-2 focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              {fieldOfficers.map(fo => (
                <option key={fo.id} value={fo.id}>{fo.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Aggregated Performance Metric Cards — Status-Separated */}
      {kpiStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {/* On-Time Rate (Time Limit) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {t('slaRate')}
            </span>
            <div className="my-2">
              <div className="text-2xl sm:text-3xl font-black text-slate-900">{kpiStats.slaRate}%</div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    kpiStats.slaRate >= 90 ? "bg-emerald-500" : kpiStats.slaRate >= 75 ? "bg-amber-500" : "bg-red-500"
                  )} 
                  style={{ width: `${kpiStats.slaRate}%` }}
                />
              </div>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              {isRTL ? 'ضمن الوقت المحدد' : 'Finished within time limit'}
            </span>
          </div>

          {/* In Progress (Live) Tasks */}
          <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-sm flex flex-col justify-between">
            <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block">
              {t('in_progress') || (isRTL ? 'قيد التنفيذ' : 'In Progress')}
            </span>
            <div className="my-2">
              <div className="text-2xl sm:text-3xl font-black text-blue-600">{kpiStats.inProgressCount}</div>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              {isRTL ? 'مهام بدأت وتعمل حالياً' : 'Live tasks running now'}
            </span>
          </div>

          {/* Pending Tasks */}
          <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm flex flex-col justify-between">
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
              {t('pending') || (isRTL ? 'معلقة' : 'Pending')}
            </span>
            <div className="my-2">
              <div className="text-2xl sm:text-3xl font-black text-amber-600">{kpiStats.pendingCount}</div>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              {isRTL ? 'مهام مجدولة بانتظار البدء' : 'Queued / not started yet'}
            </span>
          </div>

          {/* Completed Tasks */}
          <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-sm flex flex-col justify-between">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
              {t('completed')}
            </span>
            <div className="my-2">
              <div className="text-2xl sm:text-3xl font-black text-emerald-600">{kpiStats.completedCount}</div>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              {isRTL ? `من أصل ${kpiStats.totalAssigned} مهمة` : `Out of ${kpiStats.totalAssigned} assigned`}
            </span>
          </div>

          {/* Cancelled Tasks */}
          <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-sm flex flex-col justify-between">
            <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">
              {t('cancelled') || (isRTL ? 'ملغاة' : 'Cancelled')}
            </span>
            <div className="my-2">
              <div className="text-2xl sm:text-3xl font-black text-rose-600">{kpiStats.cancelledCount}</div>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              {isRTL ? 'مهام ملغاة ومستبعدة' : 'Voided / excluded from load'}
            </span>
          </div>

          {/* Average Completion Duration */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {isRTL ? 'متوسط الوقت' : 'Average Time'}
            </span>
            <div className="my-2">
              <div className="text-base sm:text-lg font-black text-blue-600 truncate" title={kpiStats.avgDurationStr}>
                {kpiStats.avgDurationStr}
              </div>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              {isRTL ? 'لكل مهمة مكتملة' : 'Per completed task'}
            </span>
          </div>

          {/* Student Rating */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {isRTL ? 'تقييم الطلاب' : 'Student Rating'}
            </span>
            <div className="my-2 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-amber-500">{kpiStats.avgRating}</span>
              {kpiStats.avgRating !== 'N/A' && <span className="text-xs text-slate-400 font-bold">/ 5.0</span>}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              {kpiStats.totalReviews} {isRTL ? 'تقييم موثق' : 'student reviews'}
            </span>
          </div>

          {/* Operational Expenses */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {t('totalExpenses')}
            </span>
            <div className="my-2">
              <div className="text-xl sm:text-2xl font-black text-slate-900 truncate">
                {formatCurrency(kpiStats.totalExpensesAmount)}
              </div>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              {kpiStats.expenseReceiptsCount} {isRTL ? 'إيصالات مسجلة' : 'receipts logged'}
            </span>
          </div>
        </div>
      )}

      {/* Average Time per Task Type (Duration Split Visualization) */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <Clock className="text-red-600" size={20} />
              <span>{isRTL ? 'متوسط الوقت حسب نوع المهمة' : 'Average Time per Task Type'}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {isRTL 
                ? 'متوسط الوقت المستغرق لإنجاز كل نوع من المهام من البداية حتى الاكتمال'
                : 'Average duration measured from start to completion for each category of task'}
            </p>
          </div>
          {kpiStats && kpiStats.completedCount > 0 && (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80 self-start sm:self-auto">
              <Clock size={14} className="text-slate-400" />
              <span>{isRTL ? 'المتوسط العام:' : 'Overall Average:'} <strong className="text-slate-900">{kpiStats.avgDurationStr}</strong></span>
            </div>
          )}
        </div>

        {officerTaskTypeStats.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            {isRTL ? 'لا توجد مهام مسجلة لهذا الموظف.' : 'No tasks recorded for this officer yet.'}
          </div>
        ) : (
          <div className="space-y-3.5">
            {officerTaskTypeStats.map((stat) => {
              const hasCompleted = stat.completedCount > 0 && stat.averageDurationMs > 0;
              const barPercent = hasCompleted && maxOfficerTypeDurationMs > 0
                ? Math.max(10, Math.round((stat.averageDurationMs / maxOfficerTypeDurationMs) * 100))
                : 0;

              return (
                <div 
                  key={stat.id} 
                  className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 hover:border-slate-200 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                        hasCompleted ? "bg-red-50 text-red-600 border border-red-100" : "bg-slate-100 text-slate-400 border border-slate-200"
                      )}>
                        <Layers size={18} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{stat.name}</h4>
                        <p className="text-xs text-slate-500">
                          {hasCompleted
                            ? (isRTL 
                                ? `بناءً على ${stat.completedCount} من أصل ${stat.totalTasks} مهمة مكتملة` 
                                : `Based on ${stat.completedCount} of ${stat.totalTasks} finished ${stat.totalTasks === 1 ? 'task' : 'tasks'}`)
                            : (isRTL 
                                ? `${stat.inProgressCount} قيد التنفيذ، ${stat.pendingCount} معلقة` 
                                : `${stat.inProgressCount} in progress, ${stat.pendingCount} pending`)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {hasCompleted ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-xl shadow-2xs text-xs font-bold text-slate-800">
                          <Clock size={13} className="text-red-500" />
                          <span>{stat.formattedDuration}</span>
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-400 rounded-xl text-xs font-medium">
                          {isRTL ? 'في انتظار الإنجاز' : 'Awaiting completion'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Duration Proportional Bar */}
                  <div className="w-full h-2.5 bg-slate-200/70 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${barPercent}%` }}
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        hasCompleted ? "bg-gradient-to-r from-red-600 to-amber-500" : "bg-transparent"
                      )}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task Execution Ledger Section */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-6">
        {/* Ledger Toolbar & Filters */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <FileText size={20} className="text-red-600" />
              <span>{t('taskLedger')}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isRTL
                ? `عرض ${filteredLedgerTasks.length} سجل مهمة مع تفاصيل الخطوات وإثباتات الصور الموثقة`
                : `Showing ${filteredLedgerTasks.length} task records with step-by-step progress and photo proofs`}
            </p>
          </div>

          <div className="flex items-center gap-2 self-stretch md:self-auto flex-wrap">
            {/* View Mode Switcher */}
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode('detailed')}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-lg transition-colors",
                  viewMode === 'detailed' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-700"
                )}
              >
                {t('detailedView')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-lg transition-colors",
                  viewMode === 'compact' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-700"
                )}
              >
                {t('compactView')}
              </button>
            </div>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Multi-Criteria Filter Bar</span>
            </div>

            <div className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 shadow-2xs">
                  <Filter size={12} />
                  <span>{activeFilterCount} Active {activeFilterCount === 1 ? 'Filter' : 'Filters'}</span>
                </span>
              )}
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition-all cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>Clear All Filters</span>
                </button>
              )}
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={t('searchTasks') || "Search by student name, passport, non-student title, notes..."}
              value={ledgerSearch}
              onChange={(e) => setLedgerSearch(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-red-600/20 focus:border-red-600 focus:outline-none font-medium"
            />
            {ledgerSearch && (
              <button
                type="button"
                onClick={() => setLedgerSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Quick Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {([
              { id: 'all', label: t('allStatus') || 'All Statuses', count: officerTasks.length, cls: 'bg-slate-900 text-white border-slate-900', idle: 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50' },
              { id: 'in_progress', label: t('in_progress') || 'In Progress', count: kpiStats?.inProgressCount ?? 0, cls: 'bg-blue-600 text-white border-blue-600', idle: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
              { id: 'pending', label: t('pending') || 'Pending', count: kpiStats?.pendingCount ?? 0, cls: 'bg-amber-600 text-white border-amber-600', idle: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' },
              { id: 'completed', label: t('completed') || 'Completed', count: kpiStats?.completedCount ?? 0, cls: 'bg-emerald-600 text-white border-emerald-600', idle: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
              { id: 'cancelled', label: t('cancelled') || 'Cancelled', count: kpiStats?.cancelledCount ?? 0, cls: 'bg-rose-600 text-white border-rose-600', idle: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' },
            ] as const).map(pill => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStatusFilter(pill.id)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold border transition-colors cursor-pointer",
                  statusFilter === pill.id ? pill.cls : pill.idle
                )}
              >
                {pill.label} ({pill.count})
              </button>
            ))}
          </div>

          {/* Multi-attribute Dropdowns Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 pt-1">
            {/* Logistics Officer Switcher */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Logistics Officer
              </label>
              <select
                value={selectedOfficerId || ''}
                onChange={(e) => setSelectedOfficerId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              >
                {fieldOfficers.map(officer => (
                  <option key={officer.id} value={officer.id}>{officer.name}</option>
                ))}
              </select>
            </div>

            {/* Task Status Filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                {t('status') || 'Task Status'}
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              >
                <option value="all">{t('allStatus') || 'All Statuses'}</option>
                <option value="in_progress">{t('in_progress') || 'In Progress'}</option>
                <option value="pending">{t('pending') || 'Pending'}</option>
                <option value="completed">{t('completed') || 'Completed'}</option>
                <option value="cancelled">{t('cancelled') || 'Cancelled'}</option>
              </select>
            </div>

            {/* Task Type / Preset Filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Task Type / Preset
              </label>
              <select
                value={presetFilter}
                onChange={(e) => setPresetFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              >
                <option value="all">{t('allTaskTypes')}</option>
                <option value="non_student">{t('nonStudentCategory') || 'Non-Student Task'}</option>
                <option value="custom">{t('customTaskOption') || 'Custom Task'}</option>
                {presets.map(p => (
                  <option key={p.id} value={p.id}>
                    {isRTL ? p.nameAr : p.nameEn}
                  </option>
                ))}
              </select>
            </div>

            {/* Execution Outcome Filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Execution Outcome
              </label>
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value as any)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              >
                <option value="all">All Outcomes</option>
                <option value="on_time">Completed On-Time</option>
              </select>
            </div>

            {/* Task Category Filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Task Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as any)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              >
                <option value="all">{t('allCategories') || 'All Categories'}</option>
                <option value="student_preset">{t('studentPresetCategory') || 'Student SOP'}</option>
                <option value="student_custom">{t('studentCustomCategory') || 'Student Custom'}</option>
                <option value="non_student">{t('nonStudentCategory') || 'Non-Student'}</option>
              </select>
            </div>

            {/* Date Range: From */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Date From
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              />
            </div>

            {/* Date Range: To */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Date To
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              />
            </div>
          </div>

          {/* Live Results Counter */}
          <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>
              Showing <strong className="text-slate-900 font-bold">{filteredLedgerTasks.length}</strong> of{' '}
              <strong className="text-slate-900 font-bold">{officerTasks.length}</strong> tasks assigned to this officer
            </span>
          </div>
        </div>

        {/* Empty State */}
        {filteredLedgerTasks.length === 0 && (
          <div className="py-16 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-200/80">
            <CheckCircle2 size={40} className="mx-auto mb-2 text-slate-300" />
            <p className="text-base font-bold text-slate-700">{t('noTasksFound')}</p>
            <p className="text-xs text-slate-400 mt-1">
              {isRTL ? 'يرجى تجربة إعادة ضبط عوامل التصفية.' : 'Try resetting the status or task type filters.'}
            </p>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* LEDGER VIEW MODE A: DETAILED TASK CARDS */}
        {/* ------------------------------------------------------------- */}
        {viewMode === 'detailed' && filteredLedgerTasks.length > 0 && (
          <div className="space-y-6">
            {filteredLedgerTasks.map(task => {
              const student = task.studentId ? students.find(s => s.id === task.studentId) : undefined;
              const taskExpenses = expenses.filter(e => e.taskId === task.id);
              const taskTotalExpenses = taskExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
              const vehicle = vehicles.find(v => v.id === task.vehicleId);
              const taskCategory = getTaskCategory(task);
              const effectiveStatus = normalizeTaskStatus(task);
              const scheduleBucket = getTaskScheduleBucket(task, todayStr);
              const isOpen = isOpenTask(task);
              const serviceLabel = getTaskServiceLabel(task, presets, language);
              const subjectName = getTaskSubjectName(task, students, language);
              const checklistSubTasks = task.subTasks.filter(st => !isCommunicationSubTask(st));
              const showCommSection =
                !task.isNonStudentTask ||
                Boolean(task.studentCommunicated) ||
                Boolean(task.studentCommunicationMedia && task.studentCommunicationMedia.length > 0) ||
                task.subTasks.some(isCommunicationSubTask);

              const completedSubTasksCount = task.subTasks.filter(st => st.isCompleted).length;
              const totalSubTasksCount = task.subTasks.length;
              const progressPercent = totalSubTasksCount > 0 ? Math.round((completedSubTasksCount / totalSubTasksCount) * 100) : 0;

              return (
                <div 
                  key={task.id} 
                  className={cn(
                    "rounded-3xl border transition-all overflow-hidden bg-white shadow-sm",
                    effectiveStatus === 'completed' ? "border-slate-200 hover:border-emerald-300" :
                    effectiveStatus === 'in_progress' ? "border-blue-200 hover:border-blue-400" :
                    effectiveStatus === 'cancelled' ? "border-rose-200 hover:border-rose-300 opacity-90" :
                    "border-amber-200 hover:border-amber-400"
                  )}
                >
                  {/* Task Card Header Banner */}
                  <div className={cn(
                    "p-4 sm:p-5 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4",
                    effectiveStatus === 'completed' ? "bg-slate-900" :
                    effectiveStatus === 'in_progress' ? "bg-blue-950" :
                    effectiveStatus === 'cancelled' ? "bg-rose-950" :
                    "bg-amber-950"
                  )}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 bg-white/10 rounded-lg text-xs font-extrabold text-white tracking-wide border border-white/10">
                          {serviceLabel}
                        </span>
                        <span className={cn(
                          "px-2.5 py-0.5 text-[11px] font-extrabold rounded-lg uppercase tracking-wider border",
                          taskCategory === 'non_student'
                            ? "bg-purple-500/30 text-purple-200 border-purple-400/30"
                            : taskCategory === 'student_custom'
                            ? "bg-amber-500/25 text-amber-200 border-amber-400/30"
                            : "bg-indigo-500/25 text-indigo-200 border-indigo-400/30"
                        )}>
                          {taskCategory === 'non_student'
                            ? (t('nonStudentCategory') || 'Non-Student')
                            : taskCategory === 'student_custom'
                            ? (t('studentCustomCategory') || 'Student Custom')
                            : (t('studentPresetCategory') || 'Student SOP')}
                        </span>
                        
                        <span className={cn(
                          "px-2.5 py-0.5 text-xs font-bold rounded-lg uppercase tracking-wider border flex items-center gap-1",
                          getTaskStatusBadgeClasses(effectiveStatus, 'dark')
                        )}>
                          {effectiveStatus === 'completed' && <Check size={13} />}
                          {effectiveStatus === 'cancelled' && <XCircle size={13} />}
                          {t(effectiveStatus) || effectiveStatus.replace('_', ' ')}
                        </span>

                        {isOpen && scheduleBucket === 'overdue' && (
                          <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-lg uppercase tracking-wider bg-red-500/30 text-red-200 border border-red-400/40">
                            {isRTL ? 'متأخرة' : 'Overdue'}
                          </span>
                        )}
                        {isOpen && scheduleBucket === 'unscheduled' && (
                          <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-lg uppercase tracking-wider bg-white/15 text-slate-200 border border-white/20">
                            {isRTL ? 'غير مجدولة' : 'Unscheduled'}
                          </span>
                        )}

                        {task.taskDate && (
                          <span className="text-xs text-slate-300 flex items-center gap-1">
                            <Calendar size={13} />
                            {formatDateDDMMYYYY(task.taskDate)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 pt-1 text-sm">
                        <span className="font-bold text-white text-base">
                          {subjectName}
                        </span>
                        {task.isNonStudentTask && task.nonStudentContact && (
                          <span className="text-xs text-purple-200 bg-purple-900/50 px-2 py-0.5 rounded-md border border-purple-400/20">
                            Contact: {task.nonStudentContact}
                          </span>
                        )}
                        {!task.isNonStudentTask && student?.passportNumber && (
                          <span className="text-xs text-slate-300 font-mono bg-white/10 px-2 py-0.5 rounded-md">
                            Passport: {student.passportNumber}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Duration & Progress */}
                    <div className="flex items-center gap-4 text-xs">
                      {task.startedAt && (
                        <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">
                            {isRTL ? 'وقت الإنجاز' : 'Execution Time'}
                          </span>
                          <span className="font-bold text-red-400">{formatTaskDuration(task.startedAt, task.completedAt)}</span>
                        </div>
                      )}

                      <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          {isRTL ? 'الخطوات' : 'Subtasks'}
                        </span>
                        <span className="font-bold text-emerald-400">{completedSubTasksCount}/{totalSubTasksCount} ({progressPercent}%)</span>
                      </div>

                      {isAdminQC && (() => {
                        const rev = qcReviews.find(r => r.taskId === task.id || r.id === task.id);
                        return (
                          <button
                            type="button"
                            onClick={() => setQcReviewTask(task)}
                            className={cn(
                              'px-3 py-1.5 rounded-xl border text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors',
                              rev
                                ? QC_GRADES[rev.grade].badgeClasses
                                : 'bg-white/15 hover:bg-white/25 text-white border-white/25'
                            )}
                          >
                            <ShieldCheck size={14} />
                            <span>{rev ? `QC: ${getQCGradeLabel(rev.grade, language)}` : (t('qcReview') || 'QC Review')}</span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Task Card Body */}
                  <div className="p-5 space-y-5">
                    {/* Metadata Strip: Student Profile / Beneficiary, Counselor, Timestamps, Vehicle */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                      <div>
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                          {task.isNonStudentTask
                            ? (isRTL ? 'تصنيف المهمة' : 'Task Category')
                            : (isRTL ? 'الجامعة' : 'University')}
                        </span>
                        <span className="font-semibold text-slate-800 flex items-center gap-1">
                          {task.isNonStudentTask ? (
                            <Layers size={12} className="text-purple-500 shrink-0" />
                          ) : (
                            <MapPin size={12} className="text-red-500 shrink-0" />
                          )}
                          <span className="truncate">
                            {task.isNonStudentTask
                              ? (t('nonStudentCategory') || 'Non-Student Operation')
                              : (student?.university || 'N/A')}
                          </span>
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                          {task.isNonStudentTask
                            ? (isRTL ? 'جهة الاتصال' : 'Beneficiary Contact')
                            : (isRTL ? 'المنسق والتواصل' : 'Counselor & Contact')}
                        </span>
                        <span className="font-semibold text-slate-800 flex items-center gap-1">
                          <Phone size={12} className="text-blue-500 shrink-0" />
                          <span className="truncate">
                            {task.isNonStudentTask
                              ? (task.nonStudentContact || 'N/A')
                              : (student?.contactInfo || 'No phone')}
                          </span>
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                          {isRTL ? 'التوقيت' : 'Timestamps'}
                        </span>
                        <div className="font-medium text-slate-700 space-y-0.5 text-[11px]">
                          {task.startedAt && (
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">{isRTL ? 'البدء:' : 'Start:'}</span>
                              <span className="font-mono">{format(new Date(task.startedAt), 'MMM dd, HH:mm')}</span>
                            </div>
                          )}
                          {task.completedAt && (
                            <div className="flex items-center gap-1 text-emerald-700 font-semibold">
                              <span className="text-slate-400">{isRTL ? 'الانتهاء:' : 'End:'}</span>
                              <span className="font-mono">{format(new Date(task.completedAt), 'MMM dd, HH:mm')}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                          {isRTL ? 'المركبة المعينة' : 'Assigned Vehicle'}
                        </span>
                        <span className="font-semibold text-slate-800 flex items-center gap-1">
                          <Car size={12} className="text-slate-500 shrink-0" />
                          <span>{vehicle ? `${vehicle.name} (${vehicle.plateNumber})` : task.vehicleId || 'No vehicle'}</span>
                        </span>
                      </div>
                    </div>

                    {/* Coordinator Notes (if any) */}
                    {(task.coordinatorNote1 || task.coordinatorNote2) && (
                      <div className="bg-amber-50/70 border border-amber-200/70 p-3.5 rounded-2xl space-y-1.5">
                        <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider block">
                          {t('coordinatorNotes')}
                        </span>
                        {task.coordinatorNote1 && (
                          <p className="text-xs text-amber-900">
                            <span className="font-bold">Note 1:</span> {task.coordinatorNote1}
                          </p>
                        )}
                        {task.coordinatorNote2 && (
                          <p className="text-xs text-amber-900">
                            <span className="font-bold">Note 2:</span> {task.coordinatorNote2}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Officer Final Logistic Report (notes) */}
                    {task.notes && (() => {
                      const staffReportTs = task.notesUpdatedAt || (task.status === 'completed' ? task.completedAt : undefined);
                      const formattedStaffReportTime = (() => {
                        if (!staffReportTs) return null;
                        try {
                          const d = new Date(staffReportTs);
                          return Number.isNaN(d.getTime()) ? null : format(d, 'MMM dd, yyyy • HH:mm');
                        } catch {
                          return null;
                        }
                      })();

                      return (
                        <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-1.5">
                          <div className="flex items-center justify-between gap-1 flex-wrap mb-1">
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                              {t('logisticReport')}
                            </span>
                            {formattedStaffReportTime && (
                              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                <Clock size={10} />
                                <span>{formattedStaffReportTime}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-800 leading-relaxed font-medium">
                            {task.notes}
                          </p>
                        </div>
                      );
                    })()}

                    {/* Step-by-Step Task Checklist */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle2 size={15} className="text-emerald-600" />
                          <span>{isRTL ? 'خطوات تنفيذ المهمة' : 'Step-by-Step Task Checklist'}</span>
                        </h4>
                        <span className="text-[11px] font-bold text-slate-500">
                          {isRTL 
                            ? `تم إنجاز ${completedSubTasksCount} من أصل ${totalSubTasksCount}` 
                            : `${completedSubTasksCount} of ${totalSubTasksCount} Finished`}
                        </span>
                      </div>

                      {/* Student Communication Step */}
                      {showCommSection && (
                        <div className={cn(
                          "p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs",
                          task.studentCommunicated 
                            ? "bg-blue-50/50 border-blue-100 text-blue-900" 
                            : "bg-slate-50 border-slate-200 text-slate-500"
                        )}>
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold",
                              task.studentCommunicated ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"
                            )}>
                              {task.studentCommunicated ? <Check size={14} /> : <Clock size={12} />}
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 block">
                                {isRTL ? 'التواصل المسبق مع الطالب' : 'Communicate with Student'}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {isRTL ? 'التنسيق الأولي وتأكيد الوصول' : 'Pre-task coordination & arrival confirmation'}
                              </span>
                            </div>
                          </div>

                          {/* Communication Proof Media */}
                          {task.studentCommunicationMedia && task.studentCommunicationMedia.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                              {task.studentCommunicationMedia.map((media, mIdx) => (
                                <button
                                  key={mIdx}
                                  type="button"
                                  onClick={() => setSelectedMedia({
                                    url: media.url,
                                    timestamp: media.timestamp,
                                    location: media.location,
                                    title: `Student Communication Proof - ${student?.fullName || subjectName}`,
                                    type: 'communication',
                                    studentName: student?.fullName || subjectName
                                  })}
                                  className="group flex items-center gap-2 px-2.5 py-1 bg-white hover:bg-blue-100 border border-blue-200 rounded-xl transition-all shadow-2xs"
                                >
                                  <img src={media.url} alt="Proof" className="w-6 h-6 rounded-md object-cover border border-slate-200" />
                                  <span className="text-[11px] font-bold text-blue-700 flex items-center gap-1">
                                    <Camera size={12} /> {t('viewProof')}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Subtasks List */}
                      <div className="space-y-2">
                        {checklistSubTasks.map((subtask, sIdx) => {
                          const subtaskTitle = isRTL ? (subtask.titleAr || subtask.titleEn) : subtask.titleEn;

                          return (
                            <div 
                              key={subtask.id || sIdx}
                              className={cn(
                                "p-3 rounded-2xl border transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs",
                                subtask.isCompleted ? "bg-white border-slate-200" :
                                subtask.isSkipped ? "bg-amber-50/40 border-amber-200 text-amber-800" :
                                "bg-slate-50/70 border-slate-100 text-slate-400"
                              )}
                            >
                              <div className="flex items-center gap-2.5">
                                <div className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold",
                                  subtask.isCompleted ? "bg-emerald-500 text-white" :
                                  subtask.isSkipped ? "bg-amber-400 text-white" :
                                  "bg-slate-200 text-slate-400"
                                )}>
                                  {subtask.isCompleted ? <Check size={14} /> : subtask.isSkipped ? <X size={14} /> : <span>{sIdx + 1}</span>}
                                </div>

                                <div>
                                  <span className={cn("font-bold block", subtask.isCompleted ? "text-slate-800" : "text-slate-600")}>
                                    {subtaskTitle}
                                  </span>
                                  {subtask.completedAt && (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {isRTL ? 'الوقت:' : 'Time:'} {format(new Date(subtask.completedAt), 'HH:mm:ss')}
                                    </span>
                                  )}
                                  {subtask.isSkipped && (
                                    <span className="text-[10px] font-bold text-amber-700 uppercase">
                                      {isRTL ? 'تم التخطي' : 'Skipped'}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Photo Proofs */}
                              {subtask.media && subtask.media.length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  {subtask.media.map((media, mIdx) => (
                                    <button
                                      key={mIdx}
                                      type="button"
                                      onClick={() => setSelectedMedia({
                                        url: media.url,
                                        timestamp: media.timestamp,
                                        location: media.location,
                                        title: `${subtaskTitle} - Proof (${student?.fullName || 'Student'})`,
                                        type: 'subtask_proof',
                                        studentName: student?.fullName
                                      })}
                                      className="group flex items-center gap-2 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs"
                                    >
                                      <img src={media.url} alt="Proof" className="w-6 h-6 rounded-md object-cover border border-slate-200" />
                                      <span className="text-[11px] font-bold text-slate-700 group-hover:text-red-600 flex items-center gap-1">
                                        <Camera size={12} /> {t('viewProof')}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Operational Task Expenses Section */}
                    {taskExpenses.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <Receipt size={15} className="text-red-600" />
                            <span>{t('taskExpenses')}</span>
                          </h4>
                          <span className="text-xs font-black text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100">
                            Total: {formatCurrency(taskTotalExpenses)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {taskExpenses.map(exp => {
                            const expVeh = resolveExpenseVehicle(exp, vehicles);
                            const isExpSettled = Boolean(exp.isSettled);
                            return (
                            <div 
                              key={exp.id} 
                              className={cn(
                                "p-3 border rounded-2xl flex items-center justify-between gap-3 text-xs transition-colors",
                                isExpSettled
                                  ? "bg-teal-50/90 border-teal-300 dark:bg-teal-950/60 dark:border-teal-700"
                                  : "bg-slate-50 border-slate-200"
                              )}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {exp.receiptUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedMedia({
                                      url: exp.receiptUrl,
                                      timestamp: exp.timestamp,
                                      location: exp.location || 'Location not tagged',
                                      title: `Receipt: ${exp.category} (${formatCurrency(exp.amount)})`,
                                      type: 'receipt',
                                      amount: exp.amount,
                                      studentName: student?.fullName,
                                      vehicleLabel: expVeh?.label
                                    })}
                                    className="w-10 h-10 rounded-xl overflow-hidden border border-slate-200 shrink-0 group relative hover:opacity-90 transition-opacity bg-white"
                                  >
                                    <img src={exp.receiptUrl} alt="Receipt" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">
                                      <Eye size={12} />
                                    </div>
                                  </button>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-slate-900 truncate">{exp.category}</span>
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-extrabold border",
                                        isExpSettled
                                          ? "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/70 dark:text-teal-200 dark:border-teal-700"
                                          : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                      )}
                                    >
                                      {isExpSettled ? <CheckCircle2 size={9} /> : <Clock size={9} />}
                                      <span>{isExpSettled ? (t('settled') || 'Settled') : (t('unsettled') || 'Unsettled')}</span>
                                    </span>
                                    {expVeh && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200 text-[10px] font-semibold">
                                        <Car size={10} className="text-red-600 shrink-0" />
                                        <span className="truncate">{expVeh.label}</span>
                                      </span>
                                    )}
                                  </div>
                                  {exp.notes && <p className="text-[11px] text-slate-500 truncate">{exp.notes}</p>}
                                  {exp.location && (
                                    <p className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                                      <MapPin size={10} className="shrink-0 text-red-500" />
                                      <span className="truncate">{exp.location}</span>
                                    </p>
                                  )}
                                </div>
                              </div>

                              <span className="font-black text-sm text-red-600 shrink-0 bg-white px-2 py-1 rounded-xl border border-slate-200">
                                {formatCurrency(exp.amount)}
                              </span>
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Student Rating Review Box */}
                    {task.feedback && (
                      <div className="bg-emerald-50/70 border border-emerald-200/70 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="flex text-amber-400">
                              {[1, 2, 3, 4, 5].map(star => (
                                <Star
                                  key={star}
                                  size={14}
                                  className={star <= task.feedback!.rating ? "fill-amber-400" : "text-slate-200"}
                                />
                              ))}
                            </div>
                            <span className="text-xs font-bold text-emerald-950">
                              {task.feedback.rating}/5 {isRTL ? 'تقييم الطالب' : 'Student Rating'}
                            </span>
                            {task.feedback.satisfaction && (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-full capitalize">
                                {task.feedback.satisfaction.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                          {task.feedback.comments && (
                            <p className="text-xs text-slate-700 italic">
                              "{task.feedback.comments}"
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                          {isRTL ? 'تاريخ التقييم:' : 'Submitted:'} {format(new Date(task.feedback.submittedAt), 'MMM dd, yyyy')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* LEDGER VIEW MODE B: COMPACT AUDIT TABLE */}
        {/* ------------------------------------------------------------- */}
        {viewMode === 'compact' && filteredLedgerTasks.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-start text-xs border-collapse min-w-[850px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-4 py-3">{isRTL ? 'المهمة / نوع الخدمة' : 'Task / Service Type'}</th>
                  <th className="px-4 py-3">{isRTL ? 'الطالب' : 'Student'}</th>
                  <th className="px-4 py-3">{isRTL ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3">{isRTL ? 'بدء التنفيذ' : 'Started'}</th>
                  <th className="px-4 py-3">{isRTL ? 'اكتمال التنفيذ' : 'Completed'}</th>
                  <th className="px-4 py-3">{isRTL ? 'وقت الإنجاز' : 'Execution Time'}</th>
                  <th className="px-4 py-3">{isRTL ? 'الخطوات' : 'Subtasks'}</th>
                  <th className="px-4 py-3">{isRTL ? 'المصروفات' : 'Expenses'}</th>
                  <th className="px-4 py-3">{isRTL ? 'تقييم الطالب' : 'Student Rating'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLedgerTasks.map(task => {
                  const student = task.studentId ? students.find(s => s.id === task.studentId) : undefined;
                  const taskCategory = getTaskCategory(task);
                  const effectiveStatus = normalizeTaskStatus(task);
                  const serviceLabel = getTaskServiceLabel(task, presets, language);
                  const subjectName = getTaskSubjectName(task, students, language);
                  const scheduleBucket = getTaskScheduleBucket(task, todayStr);
                  const isOpen = isOpenTask(task);
                  const taskExpenses = expenses.filter(e => e.taskId === task.id);
                  const taskTotalExpenses = taskExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
                  const completedSubtasks = task.subTasks.filter(st => st.isCompleted).length;

                  return (
                    <tr key={task.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-900 block">
                          {serviceLabel}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          <span className={cn(
                            "px-1.5 py-0.5 text-[9px] font-extrabold rounded uppercase tracking-wider border",
                            taskCategory === 'non_student'
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : taskCategory === 'student_custom'
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-indigo-50 text-indigo-700 border-indigo-200"
                          )}>
                            {taskCategory === 'non_student'
                              ? (t('nonStudentCategory') || 'Non-Student')
                              : taskCategory === 'student_custom'
                              ? (t('studentCustomCategory') || 'Student Custom')
                              : (t('studentPresetCategory') || 'Student SOP')}
                          </span>
                          {isOpen && scheduleBucket === 'overdue' && (
                            <span className="px-1.5 py-0.5 text-[9px] font-extrabold rounded uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
                              {isRTL ? 'متأخرة' : 'Overdue'}
                            </span>
                          )}
                          {isOpen && scheduleBucket === 'unscheduled' && (
                            <span className="px-1.5 py-0.5 text-[9px] font-extrabold rounded uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                              {isRTL ? 'غير مجدولة' : 'Unscheduled'}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono">ID: {task.id.slice(0, 8)}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-800 block">{subjectName}</span>
                        {task.isNonStudentTask ? (
                          <span className="text-[10px] text-purple-600 font-semibold">
                            {task.nonStudentContact || (isRTL ? 'مهمة غير طلابية' : 'General / Non-Student')}
                          </span>
                        ) : (
                          student?.university && <span className="text-[10px] text-slate-400">{student.university}</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className={cn(
                          "px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider border inline-flex items-center gap-1",
                          getTaskStatusBadgeClasses(effectiveStatus)
                        )}>
                          {t(effectiveStatus) || effectiveStatus.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-mono text-slate-600">
                        {task.startedAt ? format(new Date(task.startedAt), 'MMM dd, HH:mm') : '--'}
                      </td>

                      <td className="px-4 py-3 font-mono text-slate-600">
                        {task.completedAt ? format(new Date(task.completedAt), 'MMM dd, HH:mm') : '--'}
                      </td>

                      <td className="px-4 py-3 font-bold text-red-600">
                        {formatTaskDuration(task.startedAt, task.completedAt)}
                      </td>

                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-700">{completedSubtasks} / {task.subTasks.length}</span>
                      </td>

                      <td className="px-4 py-3">
                        {taskTotalExpenses > 0 ? (
                          <span className="font-bold text-red-600">{formatCurrency(taskTotalExpenses)}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {task.feedback ? (
                          <span className="flex items-center gap-1 font-bold text-amber-500">
                            <Star size={12} className="fill-amber-400" />
                            {task.feedback.rating}/5
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* INTERACTIVE AUDIT MEDIA LIGHTBOX MODAL WITH MOBILE BACK & X   */}
      {/* ------------------------------------------------------------- */}
      <PhotoLightboxModal
        isOpen={!!selectedMedia}
        onClose={() => setSelectedMedia(null)}
        imageUrl={selectedMedia?.url || null}
        title={selectedMedia?.title || t('watermarkedAudit')}
        timestamp={selectedMedia?.timestamp}
        location={selectedMedia?.location}
        studentName={selectedMedia?.studentName}
        amount={selectedMedia?.amount}
        vehicleLabel={selectedMedia?.vehicleLabel}
      />

      {isAdminQC && (
        <QCReviewModal
          isOpen={!!qcReviewTask}
          onClose={() => setQcReviewTask(null)}
          task={qcReviewTask}
        />
      )}
    </div>
  );
}
