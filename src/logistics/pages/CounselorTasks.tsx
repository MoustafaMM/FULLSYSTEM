import React, { useState, useMemo, useEffect } from 'react';
import {
  ClipboardCheck,
  Plus,
  Search,
  X,
  ThumbsUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Trash2,
  ShieldAlert,
  TrendingUp,
  Layers,
  Play,
  Megaphone,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../context/AppContext';
import {
  CounselorTask,
  CounselorTaskAttachment,
  CounselorTaskCategory,
  CounselorTaskPriority,
} from '../types';
import {
  getCounselorTaskMetrics,
  isCounselorProgressCompleted,
  isCounselorTaskCompletedForManager,
  isCounselorTaskOverdueForCounselor,
} from '../utils/counselorTaskTiming';
import CounselorTaskCard from '../components/CounselorTaskCard';
import CreateCounselorTaskModal from '../components/CreateCounselorTaskModal';
import CompleteCounselorTaskModal from '../components/CompleteCounselorTaskModal';
import CounselorTaskDetailDrawer from '../components/CounselorTaskDetailDrawer';
import Pagination from '../components/Pagination';
import PhotoLightboxModal from '../components/PhotoLightboxModal';
import { cn } from '../components/layout/Layout';

type StatusPillFilter = 'all' | 'unacked' | 'active' | 'completed' | 'overdue' | 'notices';
type SortOption = 'pinned_deadline' | 'newest' | 'priority';

const PRIORITY_WEIGHT: Record<CounselorTaskPriority, number> = {
  urgent: 3,
  high: 2,
  normal: 1,
};

export default function CounselorTasks() {
  const {
    counselorTasks,
    users,
    currentUser,
    language,
    t,
    updateCounselorTaskProgress,
    deleteCounselorTask,
  } = useAppContext();

  const isRTL = language === 'ar';
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusPillFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | CounselorTaskCategory>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | CounselorTaskPriority>('all');
  const [targetCounselorFilter, setTargetCounselorFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('pinned_deadline');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [deletingTask, setDeletingTask] = useState<CounselorTask | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{ url: string; title?: string; timestamp?: string } | null>(null);

  const [nowMs, setNowMs] = useState(() => Date.now());

  const isAuthorized =
    currentUser?.role === 'counselor_manager' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'counselor';

  const isManager = currentUser?.role === 'counselor_manager' || currentUser?.role === 'admin';
  const isCounselor = currentUser?.role === 'counselor';

  const counselors = useMemo(
    () =>
      users
        .filter((u) => u.role === 'counselor')
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [users]
  );

  // Scope tasks strictly to assigned counselor if currentUser is counselor
  const scopedTasks = useMemo(() => {
    if (!currentUser) return [];
    if (isManager) return counselorTasks;
    if (isCounselor) {
      return counselorTasks.filter((ct) => (ct.assignedCounselorIds || []).includes(currentUser.id));
    }
    return [];
  }, [counselorTasks, currentUser, isManager, isCounselor]);

  // Adaptive countdown timer: 1s tick if any scoped incomplete task is <1h to deadline, else 15s
  const hasUrgentSecondCountdown = useMemo(() => {
    return scopedTasks.some((ct) => {
      if (!ct.deadlineAt) return false;
      const deadlineMs = new Date(ct.deadlineAt).getTime();
      if (Number.isNaN(deadlineMs)) return false;
      const rem = deadlineMs - nowMs;
      if (rem <= 0 || rem >= 60 * 60 * 1000) return false;

      if (isCounselor && currentUser) {
        return ct.mode === 'notice'
          ? !ct.acknowledgments?.[currentUser.id]
          : !isCounselorProgressCompleted(ct.progressByCounselor?.[currentUser.id]);
      }
      const metrics = getCounselorTaskMetrics(ct, nowMs);
      return ct.mode === 'notice' ? metrics.unackedCount > 0 : metrics.incompleteIds.length > 0;
    });
  }, [scopedTasks, nowMs, isCounselor, currentUser]);

  useEffect(() => {
    const intervalMs = hasUrgentSecondCountdown ? 1000 : 15000;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [hasUrgentSecondCountdown]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, categoryFilter, priorityFilter, targetCounselorFilter, sortBy]);

  // KPI metrics
  const kpi = useMemo(() => {
    if (!currentUser) {
      return { total: 0, unseen: 0, second: 0, overdue: 0, last: '0%' };
    }

    if (isManager) {
      let hasUnseen = 0;
      let fullyDone = 0;
      let overdue = 0;
      let ackSum = 0;

      scopedTasks.forEach((ct) => {
        const m = getCounselorTaskMetrics(ct, nowMs);
        ackSum += m.ackRate;
        if (m.unackedCount > 0) hasUnseen++;
        if (m.isOverdueForManager) overdue++;
        if (ct.mode === 'notice') {
          if (m.totalAssigned > 0 && m.unackedCount === 0) fullyDone++;
        } else {
          if (m.totalAssigned > 0 && m.completedCount === m.totalAssigned) fullyDone++;
        }
      });

      const avgAck = scopedTasks.length > 0 ? Math.round(ackSum / scopedTasks.length) : 0;
      return {
        total: scopedTasks.length,
        unseen: hasUnseen,
        second: fullyDone,
        overdue,
        last: `${avgAck}%`,
      };
    }

    // Counselor view KPIs
    let needsMyLike = 0;
    let inProgress = 0;
    let overdue = 0;
    let completed = 0;

    scopedTasks.forEach((ct) => {
      const acked = Boolean(ct.acknowledgments?.[currentUser.id]);
      const prog = ct.progressByCounselor?.[currentUser.id];
      const isDone = ct.mode === 'action' && isCounselorProgressCompleted(prog);

      if (!acked) needsMyLike++;
      if (ct.mode === 'action' && !isDone && prog?.status === 'in_progress') inProgress++;
      if (isDone) completed++;

      if (isCounselorTaskOverdueForCounselor(ct, currentUser.id, nowMs)) {
        overdue++;
      }
    });

    return {
      total: scopedTasks.length,
      unseen: needsMyLike,
      second: inProgress,
      overdue,
      last: String(completed),
    };
  }, [scopedTasks, currentUser, isManager, nowMs]);

  const userNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => {
      map[u.id] = u.name;
    });
    return map;
  }, [users]);

  const filteredAndSortedTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = scopedTasks.filter((ct) => {
      if (q) {
        const assigneeNames = (ct.assignedCounselorIds || [])
          .map((id) => userNameMap[id] || '')
          .join(' ')
          .toLowerCase();
        const hay = `${ct.title} ${ct.titleAr || ''} ${ct.description || ''} ${ct.createdByName || ''} ${assigneeNames}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (categoryFilter !== 'all' && ct.category !== categoryFilter) return false;
      if (priorityFilter !== 'all' && ct.priority !== priorityFilter) return false;
      if (
        isManager &&
        targetCounselorFilter !== 'all' &&
        !(ct.assignedCounselorIds || []).includes(targetCounselorFilter)
      ) {
        return false;
      }

      const metrics = getCounselorTaskMetrics(ct, nowMs);
      const myAck = currentUser ? Boolean(ct.acknowledgments?.[currentUser.id]) : false;
      const myProg = currentUser ? ct.progressByCounselor?.[currentUser.id] : undefined;
      const isCounselorDone = ct.mode === 'action' && isCounselorProgressCompleted(myProg);
      const isManagerDone = isCounselorTaskCompletedForManager(ct);

      const isOverdue = isManager
        ? metrics.isOverdueForManager
        : currentUser
          ? isCounselorTaskOverdueForCounselor(ct, currentUser.id, nowMs)
          : false;

      switch (statusFilter) {
        case 'unacked':
          return isManager ? metrics.unackedCount > 0 : !myAck;
        case 'active':
          return isManager ? !isManagerDone : ct.mode === 'action' ? !isCounselorDone : !myAck;
        case 'completed':
          return isManager ? isManagerDone : isCounselorDone;
        case 'overdue':
          return isOverdue;
        case 'notices':
          return ct.mode === 'notice';
        default:
          return true;
      }
    });

    const sorted = [...filtered].sort((a, b) => {
      // Pinned always rises to top in pinned_deadline sort
      if (sortBy === 'pinned_deadline') {
        if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
          return a.isPinned ? -1 : 1;
        }
        // Tasks with deadlines come before tasks without deadlines when incomplete
        const aDeadline = a.deadlineAt ? new Date(a.deadlineAt).getTime() : Infinity;
        const bDeadline = b.deadlineAt ? new Date(b.deadlineAt).getTime() : Infinity;
        if (aDeadline !== bDeadline) {
          return aDeadline - bDeadline;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }

      if (sortBy === 'priority') {
        const diff = (PRIORITY_WEIGHT[b.priority] || 1) - (PRIORITY_WEIGHT[a.priority] || 1);
        if (diff !== 0) return diff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return sorted;
  }, [
    scopedTasks,
    searchQuery,
    categoryFilter,
    priorityFilter,
    targetCounselorFilter,
    statusFilter,
    sortBy,
    isManager,
    currentUser,
    nowMs,
    userNameMap,
  ]);

  if (!isAuthorized) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4 border border-red-100 shadow-xs">
          <ShieldAlert size={36} />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">{t('accessDenied')}</h2>
        <p className="text-sm text-slate-500 max-w-md">
          {isRTL
            ? 'هذه الصفحة مخصصة لمدير المستشارين والمستشارين والمشرف العام فقط.'
            : 'This workspace is restricted to Counselors Manager, Counselors, and Admins.'}
        </p>
      </div>
    );
  }

  const editingTask = editingTaskId
    ? counselorTasks.find((ct) => ct.id === editingTaskId) || null
    : null;
  const detailTask = detailTaskId
    ? counselorTasks.find((ct) => ct.id === detailTaskId) || null
    : null;
  const completingTask = completingTaskId
    ? counselorTasks.find((ct) => ct.id === completingTaskId) || null
    : null;

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    statusFilter !== 'all' ||
    categoryFilter !== 'all' ||
    priorityFilter !== 'all' ||
    targetCounselorFilter !== 'all';

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setPriorityFilter('all');
    setTargetCounselorFilter('all');
  };

  const handleConfirmCompletion = async (note: string, attachments: CounselorTaskAttachment[]) => {
    if (!completingTask) return;
    await updateCounselorTaskProgress(completingTask.id, 'completed', {
      completionNote: note,
      completionAttachments: attachments,
    });
    toast.success(isRTL ? 'تم إكمال المهمة بنجاح!' : 'Task marked as completed!');
    setCompletingTaskId(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingTask || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteCounselorTask(deletingTask.id);
      if (detailTaskId === deletingTask.id) setDetailTaskId(null);
      toast.success(isRTL ? 'تم حذف المهمة' : 'Counselor task deleted');
      setDeletingTask(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete task');
    } finally {
      setIsDeleting(false);
    }
  };

  const paginatedTasks = filteredAndSortedTasks.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-md shadow-red-600/20 shrink-0">
            <ClipboardCheck size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {t('counselorTasks')}
              </h1>
              <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                {isRTL ? 'منفصل عن اللوجستيات' : 'Non-Logistics'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {t('counselorTasksSubtitle')}
            </p>
          </div>
        </div>

        {isManager && (
          <button
            type="button"
            onClick={() => {
              setEditingTaskId(null);
              setIsCreateModalOpen(true);
            }}
            className="bg-red-600 hover:bg-red-700 active:scale-95 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 shadow-md shadow-red-600/25 transition-all cursor-pointer shrink-0"
          >
            <Plus size={17} />
            <span>{t('newCounselorTask')}</span>
          </button>
        )}
      </div>

      {/* 5-Card KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={cn(
            'text-start bg-white dark:bg-slate-900 p-4 rounded-2xl border shadow-2xs transition-all cursor-pointer hover:shadow-sm',
            statusFilter === 'all'
              ? 'border-blue-400 ring-1 ring-blue-300/60'
              : 'border-slate-200 dark:border-slate-800'
          )}
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isManager ? (isRTL ? 'إجمالي المهام' : 'Total Tasks') : isRTL ? 'المهام المسندة' : 'Assigned to Me'}</span>
            <Layers size={16} className="text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">{kpi.total}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('unacked')}
          className={cn(
            'text-start bg-white dark:bg-slate-900 p-4 rounded-2xl border shadow-2xs transition-all cursor-pointer hover:shadow-sm',
            statusFilter === 'unacked'
              ? 'border-amber-400 ring-1 ring-amber-300/60'
              : 'border-slate-200 dark:border-slate-800'
          )}
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isManager ? (isRTL ? 'بانتظار المشاهدة' : 'Has Unseen') : t('needsMyLike')}</span>
            <ThumbsUp size={16} className="text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">{kpi.unseen}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(isManager ? 'completed' : 'active')}
          className={cn(
            'text-start bg-white dark:bg-slate-900 p-4 rounded-2xl border shadow-2xs transition-all cursor-pointer hover:shadow-sm',
            statusFilter === (isManager ? 'completed' : 'active')
              ? 'border-emerald-400 ring-1 ring-emerald-300/60'
              : 'border-slate-200 dark:border-slate-800'
          )}
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isManager ? t('completedTab') : isRTL ? 'قيد التنفيذ' : 'In Progress'}</span>
            {isManager ? (
              <CheckCircle2 size={16} className="text-emerald-600" />
            ) : (
              <Play size={16} className="text-blue-600" />
            )}
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">{kpi.second}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('overdue')}
          className={cn(
            'text-start bg-white dark:bg-slate-900 p-4 rounded-2xl border shadow-2xs transition-all cursor-pointer hover:shadow-sm',
            statusFilter === 'overdue'
              ? 'border-red-400 ring-1 ring-red-300/60'
              : 'border-slate-200 dark:border-slate-800'
          )}
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isRTL ? 'متأخرة' : 'Overdue'}</span>
            <AlertTriangle size={16} className="text-red-600" />
          </div>
          <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-2">{kpi.overdue}</p>
        </button>

        <button
          type="button"
          onClick={() => (isCounselor ? setStatusFilter('completed') : setStatusFilter('all'))}
          className={cn(
            'col-span-2 sm:col-span-1 text-start bg-white dark:bg-slate-900 p-4 rounded-2xl border shadow-2xs transition-all cursor-pointer hover:shadow-sm',
            isCounselor && statusFilter === 'completed'
              ? 'border-emerald-400 ring-1 ring-emerald-300/60'
              : 'border-slate-200 dark:border-slate-800'
          )}
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isManager ? (isRTL ? 'معدل التأكيد' : 'Avg Ack Rate') : t('completedTab')}</span>
            {isManager ? (
              <TrendingUp size={16} className="text-indigo-600" />
            ) : (
              <CheckCircle2 size={16} className="text-emerald-600" />
            )}
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{kpi.last}</p>
        </button>
      </div>

      {/* Filters & Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 space-y-3.5">
        {/* Search & Clear */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isRTL
                  ? 'ابحث بالعنوان أو الوصف أو اسم المستشار...'
                  : 'Search by title, instructions, creator, or counselor...'
              }
              className="w-full ps-10 pe-9 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 hover:text-red-600 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw size={13} />
              <span>{isRTL ? 'إعادة ضبط' : 'Reset'}</span>
            </button>
          )}
        </div>

        {/* Status Pills */}
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'all', label: isRTL ? 'الكل' : 'All' },
              {
                id: 'unacked',
                label: isManager ? (isRTL ? 'لم تُشاهد بعد' : 'Has Unseen') : t('needsMyLike'),
              },
              { id: 'active', label: isRTL ? 'نشطة' : 'Active' },
              { id: 'completed', label: t('completedTab') },
              { id: 'overdue', label: isRTL ? 'متأخرة' : 'Overdue' },
              { id: 'notices', label: isRTL ? 'إشعارات' : 'Notices', icon: Megaphone },
            ] as { id: StatusPillFilter; label: string; icon?: any }[]
          ).map((pill) => {
            const PillIcon = pill.icon;
            const active = statusFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStatusFilter(pill.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border',
                  active
                    ? 'bg-red-600 text-white border-red-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                )}
              >
                {PillIcon && <PillIcon size={12} />}
                <span>{pill.label}</span>
              </button>
            );
          })}
        </div>

        {/* Dropdown Filters & Sort */}
        <div className={cn('grid gap-2.5', isManager ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3')}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="all">{isRTL ? 'كل التصنيفات' : 'All Categories'}</option>
            <option value="follow_up">{t('catFollowUp')}</option>
            <option value="sales_leads">{t('catSalesLeads')}</option>
            <option value="meeting">{t('catMeeting')}</option>
            <option value="admin">{t('catAdmin')}</option>
            <option value="training">{t('catTraining')}</option>
            <option value="notice">{t('catNotice')}</option>
            <option value="other">{t('catOther')}</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="all">{isRTL ? 'كل الأولويات' : 'All Priorities'}</option>
            <option value="urgent">{t('priorityUrgent')}</option>
            <option value="high">{t('priorityHigh')}</option>
            <option value="normal">{t('priorityNormal')}</option>
          </select>

          {isManager && (
            <select
              value={targetCounselorFilter}
              onChange={(e) => setTargetCounselorFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              <option value="all">{t('allCounselors')}</option>
              {counselors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="pinned_deadline">
              {isRTL ? 'الترتيب: المثبتة وأقرب موعد نهائي' : 'Sort: Pinned & Nearest Deadline'}
            </option>
            <option value="newest">{isRTL ? 'الترتيب: الأحدث أولاً' : 'Sort: Newest First'}</option>
            <option value="priority">{isRTL ? 'الترتيب: الأعلى أولوية' : 'Sort: Highest Priority'}</option>
          </select>
        </div>
      </div>

      {/* Task Cards Grid */}
      {filteredAndSortedTasks.length > 0 ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paginatedTasks.map((ct) => (
              <CounselorTaskCard
                key={ct.id}
                task={ct}
                nowMs={nowMs}
                onOpenDetail={(task) => setDetailTaskId(task.id)}
                onOpenCompletionModal={(task) => setCompletingTaskId(task.id)}
                onEditTask={(task) => {
                  setEditingTaskId(task.id);
                  setIsCreateModalOpen(true);
                }}
                onDeleteTask={(task) => setDeletingTask(task)}
                onPreviewImage={setPreviewMedia}
              />
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalItems={filteredAndSortedTasks.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[12, 24, 48]}
            itemLabel={isRTL ? 'مهمة' : 'tasks'}
            colorScheme="red"
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Clock size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white">
            {t('noCounselorTasksYet')}
          </h3>
          {isManager && !hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setEditingTaskId(null);
                setIsCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
            >
              <Plus size={15} />
              {t('newCounselorTask')}
            </button>
          )}
        </div>
      )}

      {/* Modals & Drawers */}
      <CreateCounselorTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingTaskId(null);
        }}
        editingTask={editingTask}
      />

      <CompleteCounselorTaskModal
        isOpen={Boolean(completingTask)}
        task={completingTask}
        onClose={() => setCompletingTaskId(null)}
        onConfirm={handleConfirmCompletion}
      />

      <CounselorTaskDetailDrawer
        isOpen={Boolean(detailTask)}
        task={detailTask}
        onClose={() => setDetailTaskId(null)}
        nowMs={nowMs}
        onOpenCompletionModal={(task) => setCompletingTaskId(task.id)}
        onOpenEditModal={(task) => {
          setEditingTaskId(task.id);
          setIsCreateModalOpen(true);
        }}
        onPreviewImage={setPreviewMedia}
      />

      <PhotoLightboxModal
        isOpen={Boolean(previewMedia)}
        onClose={() => setPreviewMedia(null)}
        imageUrl={previewMedia?.url || null}
        title={previewMedia?.title}
        timestamp={previewMedia?.timestamp}
      />

      {/* Delete Confirmation Modal */}
      {deletingTask && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          dir={isRTL ? 'rtl' : 'ltr'}
          onClick={() => !isDeleting && setDeletingTask(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {isRTL ? 'حذف مهمة المستشار؟' : 'Delete Counselor Task?'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {isRTL
                    ? `هل أنت متأكد من حذف "${deletingTask.title}"؟ لا يمكن التراجع عن هذا الإجراء.`
                    : `Are you sure you want to permanently delete "${deletingTask.title}"? All acknowledgments and comments will be removed.`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingTask(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>{isRTL ? 'نعم، حذف' : 'Delete Task'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
