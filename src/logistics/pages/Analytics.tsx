import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  Activity,
  Clock,
  CheckCircle2,
  TrendingUp,
  Users,
  Award,
  Star,
  MessageSquare,
  ThumbsUp,
  Timer,
  BarChart3,
  Search,
  Filter,
  RotateCcw,
  X,
  XCircle,
  Tag
} from 'lucide-react';
import {
  TaskCategory,
  getTaskAnalyticsGroup,
  getTaskCategory,
  getTaskDisplayTitle,
  getTaskSearchableText,
  matchesTaskTypeFilter,
  normalizeTaskStatus
} from '../utils/taskClassification';

/**
 * Format a duration in milliseconds into human-readable simple English or Arabic.
 * Example: "2 hours 15 mins", "45 mins", "1 day 3 hours"
 */
function formatDuration(ms: number, isArabic = false): string {
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

export default function Analytics() {
  const { t, tasks, students, users, presets, language } = useAppContext();
  const isRTL = language === 'ar';

  // Multi-variable filter states
  const [officerFilter, setOfficerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'pending' | 'completed' | 'cancelled'>('all');
  const [presetFilter, setPresetFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'on_time'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TaskCategory>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fieldOfficers = useMemo(() => {
    return users.filter(u => u.role === 'field_officer').sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (officerFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (presetFilter !== 'all') count++;
    if (outcomeFilter !== 'all') count++;
    if (categoryFilter !== 'all') count++;
    if (fromDate) count++;
    if (toDate) count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [officerFilter, statusFilter, presetFilter, outcomeFilter, categoryFilter, fromDate, toDate, searchQuery]);

  const handleClearFilters = () => {
    setOfficerFilter('all');
    setStatusFilter('all');
    setPresetFilter('all');
    setOutcomeFilter('all');
    setCategoryFilter('all');
    setFromDate('');
    setToDate('');
    setSearchQuery('');
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // 1. Officer Filter
      if (officerFilter !== 'all' && task.assigneeId !== officerFilter) return false;

      // 2. Status Filter
      const effectiveStatus = normalizeTaskStatus(task);
      if (statusFilter !== 'all' && effectiveStatus !== statusFilter) return false;

      // 3. Preset / Task Type Filter (handles omitted presetId and legacy presetId === 'custom')
      if (!matchesTaskTypeFilter(task, presetFilter)) return false;

      // 4. Execution Outcome Filter
      if (outcomeFilter !== 'all') {
        if (outcomeFilter === 'on_time' && effectiveStatus !== 'completed') return false;
      }

      // 5. Task Category Filter (student_preset vs student_custom vs non_student)
      if (categoryFilter !== 'all' && getTaskCategory(task) !== categoryFilter) return false;

      // 6. Date Range Filter (explicit date filter excludes undated tasks)
      const taskDate = task.taskDate || (task.completedAt ? task.completedAt.slice(0, 10) : (task.startedAt ? task.startedAt.slice(0, 10) : (task.createdAt ? task.createdAt.slice(0, 10) : '')));
      if ((fromDate || toDate) && !taskDate) return false;
      if (fromDate && taskDate < fromDate) return false;
      if (toDate && taskDate > toDate) return false;

      // 7. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const haystack = getTaskSearchableText(task, presets, students, users);
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [tasks, officerFilter, statusFilter, presetFilter, outcomeFilter, categoryFilter, fromDate, toDate, searchQuery, presets, students, users]);

  // Metrics calculation (Status-separated: In Progress vs Pending vs Completed vs Cancelled)
  const totalStudents = students.length;
  const inProgressTasks = filteredTasks.filter(t => normalizeTaskStatus(t) === 'in_progress');
  const pendingTasks = filteredTasks.filter(t => normalizeTaskStatus(t) === 'pending');
  const completedTasks = filteredTasks.filter(t => normalizeTaskStatus(t) === 'completed');
  const cancelledTasks = filteredTasks.filter(t => normalizeTaskStatus(t) === 'cancelled');

  // Overall Average Completion Time (strictly uses startedAt -> completedAt, never createdAt)
  let totalTime = 0;
  let tasksWithTime = 0;
  completedTasks.forEach(task => {
    const start = task.startedAt ? new Date(task.startedAt).getTime() : 0;
    const end = task.completedAt ? new Date(task.completedAt).getTime() : 0;
    if (start > 0 && end > start) {
      totalTime += end - start;
      tasksWithTime++;
    }
  });
  const avgTimeMs = tasksWithTime > 0 ? totalTime / tasksWithTime : 0;
  const avgTimeString = tasksWithTime > 0 ? formatDuration(avgTimeMs, isRTL) : (isRTL ? 'لا توجد بيانات' : 'No data yet');

  // Group and average durations by Task Type (collision-free key across Student SOP, Student Custom, Non-Student)
  interface TaskTypeStats {
    id: string;
    name: string;
    completedCount: number;
    totalTasksCount: number;
    totalDurationMs: number;
    averageDurationMs: number;
    formattedDuration: string;
  }

  const typeMap = new Map<string, { name: string; durations: number[]; totalTasks: number }>();

  // Pre-seed known student SOP presets from Firestore
  if (categoryFilter === 'all' || categoryFilter === 'student_preset') {
    presets.forEach(p => {
      const name = (isRTL && p.nameAr) ? p.nameAr : (p.nameEn || p.id);
      typeMap.set(`student_preset:${p.id}`, { name, durations: [], totalTasks: 0 });
    });
  }

  // Track non-cancelled tasks to get clean operational volume per type
  filteredTasks.forEach(task => {
    if (normalizeTaskStatus(task) === 'cancelled' && statusFilter !== 'cancelled') return;
    const group = getTaskAnalyticsGroup(task, presets, language);

    if (!typeMap.has(group.key)) {
      typeMap.set(group.key, { name: group.label, durations: [], totalTasks: 0 });
    }
    typeMap.get(group.key)!.totalTasks++;
  });

  // Calculate duration for completed tasks strictly from startedAt -> completedAt
  completedTasks.forEach(task => {
    const start = task.startedAt ? new Date(task.startedAt).getTime() : 0;
    const end = task.completedAt ? new Date(task.completedAt).getTime() : 0;
    const duration = (start > 0 && end > start) ? end - start : 0;

    const group = getTaskAnalyticsGroup(task, presets, language);
    if (typeMap.has(group.key) && duration > 0) {
      typeMap.get(group.key)!.durations.push(duration);
    }
  });

  const taskTypeDurations: TaskTypeStats[] = Array.from(typeMap.entries()).map(([id, data]) => {
    const count = data.durations.length;
    const totalMs = data.durations.reduce((a, b) => a + b, 0);
    const avgMs = count > 0 ? Math.round(totalMs / count) : 0;
    return {
      id,
      name: data.name,
      completedCount: count,
      totalTasksCount: data.totalTasks,
      totalDurationMs: totalMs,
      averageDurationMs: avgMs,
      formattedDuration: formatDuration(avgMs, isRTL),
    };
  });

  // Sort: completed with duration first (descending average duration), then those without completions
  taskTypeDurations.sort((a, b) => {
    if (a.completedCount > 0 && b.completedCount === 0) return -1;
    if (a.completedCount === 0 && b.completedCount > 0) return 1;
    if (a.completedCount > 0 && b.completedCount > 0) {
      return b.averageDurationMs - a.averageDurationMs;
    }
    return b.totalTasksCount - a.totalTasksCount;
  });

  const maxDurationMs = Math.max(...taskTypeDurations.map(t => t.averageDurationMs), 0);

  // Student Reviews / Feedback Calculations
  const feedbackList = filteredTasks
    .filter(t => t.feedback && t.feedback.rating)
    .map(t => ({
      ...t.feedback!,
      taskTitle: getTaskDisplayTitle(t, presets, language),
      studentId: t.studentId,
    }));

  const totalFeedbacks = feedbackList.length;
  const avgRating = totalFeedbacks > 0
    ? (feedbackList.reduce((acc, f) => acc + (f.rating || 0), 0) / totalFeedbacks).toFixed(1)
    : '0.0';

  const positiveFeedbacks = feedbackList.filter(
    f => f.satisfaction === 'very_satisfied' || f.satisfaction === 'satisfied' || f.rating >= 4
  ).length;
  const satisfactionRate = totalFeedbacks > 0 ? Math.round((positiveFeedbacks / totalFeedbacks) * 100) : 0;

  // Most Active Field Officer
  const officerStats = filteredTasks.reduce((acc, task) => {
    if (normalizeTaskStatus(task) === 'completed') {
      acc[task.assigneeId] = (acc[task.assigneeId] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  let topOfficerId = '';
  let maxTasks = 0;
  for (const id in officerStats) {
    if (officerStats[id] > maxTasks) {
      maxTasks = officerStats[id];
      topOfficerId = id;
    }
  }
  const topOfficer = users.find(u => u.id === topOfficerId);

  return (
    <div className="space-y-6">
      {/* Header with Title and Live Badge */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {isRTL ? 'نظرة عامة على الأداء والعمليات' : 'Operations & Performance Overview'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {isRTL 
              ? 'متابعة مباشرة لأداء المهام ومؤشرات جودة الخدمة' 
              : 'Live summary of operational tasks, delivery times, and student satisfaction'}
          </p>
        </div>
        <div className="bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-xs text-xs font-semibold text-slate-700 flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <TrendingUp size={14} className="text-emerald-600" />
          <span>{isRTL ? 'تحديثات مباشرة' : 'Live Updates'}</span>
        </div>
      </div>

      {/* Multi-Axis Analytics Filter Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-red-600" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {isRTL ? 'تصفية وفصل التحليلات' : 'Analytics Scope & Task Separation'}
            </span>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
                {activeFilterCount} {isRTL ? 'نشط' : 'active'}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>{isRTL ? 'إعادة ضبط' : 'Clear Filters'}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isRTL ? 'بحث باسم الطالب أو المهمة...' : 'Search student, non-student, SOP, officer...'}
              className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Officer */}
          <select
            value={officerFilter}
            onChange={(e) => setOfficerFilter(e.target.value)}
            className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20"
          >
            <option value="all">{t('allStaff') || 'All Officers'}</option>
            {fieldOfficers.map(fo => (
              <option key={fo.id} value={fo.id}>{fo.name}</option>
            ))}
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20"
          >
            <option value="all">{t('allStatus') || 'All Statuses'}</option>
            <option value="in_progress">{t('in_progress') || 'In Progress'}</option>
            <option value="pending">{t('pending') || 'Pending'}</option>
            <option value="completed">{t('completed') || 'Completed'}</option>
            <option value="cancelled">{t('cancelled') || 'Cancelled'}</option>
          </select>

          {/* Category */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20"
          >
            <option value="all">{t('allCategories') || 'All Categories'}</option>
            <option value="student_preset">{t('studentPresetCategory') || 'Student SOP'}</option>
            <option value="student_custom">{t('studentCustomCategory') || 'Student Custom'}</option>
            <option value="non_student">{t('nonStudentCategory') || 'Non-Student'}</option>
          </select>

          {/* Preset / Type */}
          <select
            value={presetFilter}
            onChange={(e) => setPresetFilter(e.target.value)}
            className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20"
          >
            <option value="all">{t('allTaskTypes') || 'All Task Types'}</option>
            <option value="custom">{t('customTaskOption') || 'Custom / Ad-Hoc'}</option>
            <option value="non_student">{t('nonStudentCategory') || 'Non-Student'}</option>
            {presets.map(p => (
              <option key={p.id} value={p.id}>{isRTL ? (p.nameAr || p.nameEn) : p.nameEn}</option>
            ))}
          </select>

          {/* Date Range */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              title="From date"
              className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              title="To date"
              className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600/20"
            />
          </div>
        </div>
      </div>

      {/* Primary KPI Grid — Separated Status Buckets */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Activity size={18} />
            </div>
            <h3 className="font-semibold text-slate-700 text-sm">
              {t('in_progress') || (isRTL ? 'قيد التنفيذ' : 'In Progress')}
            </h3>
          </div>
          <div className="text-3xl font-bold text-blue-600">{inProgressTasks.length}</div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {isRTL ? 'مهام بدأت وتعمل حالياً' : 'Live tasks currently running'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Clock size={18} />
            </div>
            <h3 className="font-semibold text-slate-700 text-sm">
              {t('pending') || (isRTL ? 'قيد الانتظار' : 'Pending')}
            </h3>
          </div>
          <div className="text-3xl font-bold text-amber-600">{pendingTasks.length}</div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {isRTL ? 'مهام مجدولة لم تبدأ بعد' : 'Queued / not started yet'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <CheckCircle2 size={18} />
            </div>
            <h3 className="font-semibold text-slate-700 text-sm">
              {t('completed') || (isRTL ? 'مكتملة' : 'Completed')}
            </h3>
          </div>
          <div className="text-3xl font-bold text-emerald-600">{completedTasks.length}</div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {isRTL ? 'مهام تم إنجازها بنجاح' : 'Tasks finished successfully'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
              <XCircle size={18} />
            </div>
            <h3 className="font-semibold text-slate-700 text-sm">
              {t('cancelled') || (isRTL ? 'ملغاة' : 'Cancelled')}
            </h3>
          </div>
          <div className="text-3xl font-bold text-rose-600">{cancelledTasks.length}</div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {isRTL ? 'مهام ملغاة ومستبعدة' : 'Voided / excluded from load'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200">
              <Users size={18} />
            </div>
            <h3 className="font-semibold text-slate-700 text-sm">
              {isRTL ? 'إجمالي الطلاب' : 'Total Students'}
            </h3>
          </div>
          <div className="text-3xl font-bold text-slate-900">{totalStudents}</div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {isRTL ? 'الطلاب المسجلون في النظام' : 'Registered students'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Star size={18} className="fill-amber-500 text-amber-500" />
            </div>
            <h3 className="font-semibold text-slate-700 text-sm">
              {isRTL ? 'تقييم الطلاب' : 'Student Rating'}
            </h3>
          </div>
          <div className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <span>{avgRating}</span>
            <span className="text-sm font-normal text-slate-400">/ 5.0</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {totalFeedbacks} {isRTL ? 'تقييم من الطلاب' : 'student reviews'}
          </p>
        </div>
      </div>

      {/* Operational Performance & Overview Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student Satisfaction Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ThumbsUp size={18} className="text-red-600" />
                <span>{isRTL ? 'معدل رضا الطلاب' : 'Student Satisfaction'}</span>
              </h3>
              <span className="text-xs font-semibold px-2.5 py-1 bg-green-50 text-green-700 border border-green-200/60 rounded-full">
                {satisfactionRate}% {isRTL ? 'إيجابي' : 'Positive'}
              </span>
            </div>
            
            <div className="flex items-baseline gap-2 my-4">
              <div className="text-4xl font-extrabold text-slate-900">{satisfactionRate}%</div>
              <div className="text-xs text-slate-500 font-medium">
                {isRTL ? 'نسبة التقييم الإيجابي' : 'Positive Feedback Rate'}
              </div>
            </div>

            {/* Satisfaction Bar */}
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex my-3">
              <div style={{ width: `${satisfactionRate}%` }} className="bg-green-500 transition-all duration-500"></div>
              <div style={{ width: `${100 - satisfactionRate}%` }} className="bg-slate-200"></div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{isRTL ? 'إجمالي المراجعات:' : 'Total Reviews:'} <strong>{totalFeedbacks}</strong></span>
            <span>{isRTL ? 'التقييمات الإيجابية:' : 'Positive Reviews:'} <strong>{positiveFeedbacks}</strong></span>
          </div>
        </div>

        {/* Overall Average Time Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Clock className="text-slate-500" size={18} />
              <span>{isRTL ? 'متوسط الوقت لكل مهمة' : 'Average Time per Task'}</span>
            </h3>
            <div className="flex items-center justify-center py-4">
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-1">{avgTimeString}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isRTL ? 'متوسط الوقت المستغرق لإنجاز المهمة' : 'Average time to finish any task'}
                </p>
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 text-center">
            {isRTL ? 'محسوب بناءً على جميع المهام المكتملة' : 'Based on all completed tasks'}
          </div>
        </div>

        {/* Top Field Officer Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Award className="text-amber-500" size={18} />
              <span>{isRTL ? 'أفضل موظف ميداني' : 'Top Field Officer'}</span>
            </h3>
            {topOfficer ? (
              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                {topOfficer.avatar ? (
                  <img src={topOfficer.avatar} alt={topOfficer.name} className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-sm" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg font-bold border-2 border-white shadow-sm">
                    {topOfficer.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h4 className="text-base font-bold text-slate-900">{topOfficer.name}</h4>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <CheckCircle2 size={13} className="text-green-500" />
                    <span>{maxTasks} {isRTL ? 'مهام منجزة' : 'tasks finished'}</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-xs">
                {isRTL ? 'لا توجد بيانات متاحة بعد.' : 'No completed tasks yet.'}
              </div>
            )}
          </div>
          <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 text-center">
            {isRTL ? 'الموظف الأكثر إنجازاً للمهام الميدانية' : 'Field officer with the most completed tasks'}
          </div>
        </div>
      </div>

      {/* Average Duration per Task Type (Dedicated New Section) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Timer className="text-red-600" size={20} />
              <span>{isRTL ? 'متوسط الوقت حسب نوع المهمة' : 'Average Time by Task Type'}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {isRTL 
                ? 'متوسط الوقت المستغرق من بداية المهمة حتى إنجازها لكل مرحلة أو خدمة'
                : 'Average time taken by field officers from start to finish for each type of logistics service'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 self-start sm:self-auto">
            <Clock size={14} className="text-slate-400" />
            <span>{isRTL ? 'المتوسط العام:' : 'Overall Average:'} <strong className="text-slate-900 dark:text-white">{avgTimeString}</strong></span>
          </div>
        </div>

        {taskTypeDurations.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            {isRTL ? 'لا توجد أنواع مهام محددة حتى الآن.' : 'No task types available.'}
          </div>
        ) : (
          <div className="space-y-4">
            {taskTypeDurations.map((stat) => {
              const hasCompleted = stat.completedCount > 0;
              const barPercent = hasCompleted && maxDurationMs > 0
                ? Math.max(8, Math.round((stat.averageDurationMs / maxDurationMs) * 100))
                : 0;

              return (
                <div 
                  key={stat.id} 
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        hasCompleted 
                          ? 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/60' 
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                      }`}>
                        <BarChart3 size={18} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{stat.name}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {hasCompleted
                            ? (isRTL 
                                ? `بناءً على ${stat.completedCount} ${stat.completedCount === 1 ? 'مهمة منجزة' : 'مهام منجزة'}`
                                : `Based on ${stat.completedCount} finished ${stat.completedCount === 1 ? 'task' : 'tasks'}`)
                            : (isRTL ? 'لا توجد مهام منجزة من هذا النوع بعد' : 'No completed tasks recorded yet')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {hasCompleted ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xs text-xs font-bold text-slate-800 dark:text-slate-200">
                          <Clock size={13} className="text-red-500" />
                          <span>{stat.formattedDuration}</span>
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-400 rounded-lg text-xs font-medium">
                          {isRTL ? 'في انتظار الإنجاز' : 'Awaiting completion'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Duration Progress Bar */}
                  <div className="w-full h-2.5 bg-slate-200/60 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${barPercent}%` }}
                      className={`h-full rounded-full transition-all duration-500 ${
                        hasCompleted 
                          ? 'bg-gradient-to-r from-red-600 to-amber-500' 
                          : 'bg-transparent'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Student Reviews */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <MessageSquare className="text-red-600" size={18} />
          <span>{isRTL ? 'آخر آراء وتقييمات الطلاب' : 'Recent Student Reviews'}</span>
        </h3>

        {feedbackList.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            {isRTL ? 'لا توجد تقييمات مقدمة بعد.' : 'No student reviews submitted yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {feedbackList.slice(0, 6).map((f, idx) => {
              const student = f.studentId ? students.find(s => s.id === f.studentId) : undefined;
              return (
                <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-900 text-sm">{student?.fullName || f.studentEmail || (isRTL ? 'عميل' : 'Client')}</span>
                      <div className="flex text-amber-400">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star key={star} size={13} className={star <= f.rating ? 'fill-amber-400' : 'text-slate-200'} />
                        ))}
                      </div>
                    </div>
                    {f.comments ? (
                      <p className="text-xs text-slate-600 italic bg-white p-2.5 rounded-lg border border-slate-100">
                        "{f.comments}"
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        {isRTL ? 'لا يوجد تعليق مكتوب.' : 'No written comment provided.'}
                      </p>
                    )}
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-200/60 flex justify-between items-center text-[10px] text-slate-400">
                    <span className="capitalize text-emerald-700 font-medium">
                      {f.satisfaction ? f.satisfaction.replace('_', ' ') : (isRTL ? 'مكتمل' : 'Completed')}
                    </span>
                    <span>{new Date(f.submittedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
