import React, { useState, useMemo, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  PhoneCall,
  Phone,
  Search,
  RotateCcw,
  Calendar,
  Clock,
  User as UserIcon,
  Tag,
  Camera,
  FileText,
  Star,
  Edit,
  Eye,
  Download,
  Copy,
  Lightbulb,
  Award,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  ClipboardList,
  MessageSquare,
} from 'lucide-react';
import { format, addDays, subDays, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import { useAppContext } from '../context/AppContext';
import { QCErrorTagId, QCGrade, QCTaskReview, Task, User } from '../types';
import {
  getLocalDateStr,
  getTaskDisplayTitle,
  getTaskSearchableText,
  getTaskServiceLabel,
  getTaskStatusBadgeClasses,
  normalizeTaskStatus,
} from '../utils/taskClassification';
import { formatDateDDMMYYYY } from '../utils/dateFormat';
import {
  QC_ERROR_TAGS,
  QC_GRADES,
  computeDailyQCStats,
  computeOfficerQCStats,
  getEffectiveTaskDate,
  getQCErrorTagLabel,
  getQCGradeLabel,
} from '../utils/qualityControl';
import { formatWhatsAppUrl } from '../components/CompactTaskCard';
import QCReviewModal from '../components/QCReviewModal';
import TaskDetailModal from '../components/TaskDetailModal';
import PhotoLightboxModal from '../components/PhotoLightboxModal';
import Pagination from '../components/Pagination';
import { cn } from '../components/layout/Layout';

type QCTab = 'reviews' | 'daily_report' | 'staff_eval' | 'urgent_calls';

function formatTaskDurationText(start?: string, end?: string, isRTL = false): string {
  if (!start) return '--';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return '--';
  const mins = Math.round((e - s) / 60000);
  if (mins < 60) return isRTL ? `${mins} د` : `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return isRTL ? `${h} س ${m} د` : `${h}h ${m}m`;
}

export default function QualityControl() {
  const {
    currentUser,
    tasks,
    users,
    students,
    presets,
    qcReviews,
    qcDailyReports,
    qcOfficerEvaluations,
    toggleQCUrgentCallResolved,
    saveQCDailyReport,
    saveQCOfficerEvaluation,
    language,
    t,
  } = useAppContext();

  const isRTL = language === 'ar';
  const todayStr = getLocalDateStr();

  const [activeTab, setActiveTab] = useState<QCTab>('reviews');

  // Tab 1 Filters (Task Reviews)
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<'all' | 'unreviewed' | QCGrade>('all');
  const [officerFilter, setOfficerFilter] = useState<string>('all');
  const [errorTagFilter, setErrorTagFilter] = useState<'all' | QCErrorTagId>('all');
  const [urgentFilter, setUrgentFilter] = useState<'all' | 'pending_call' | 'any_call'>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Modals
  const [reviewingTask, setReviewingTask] = useState<Task | null>(null);
  const [inspectingTask, setInspectingTask] = useState<Task | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<{
    url: string;
    title?: string;
    timestamp?: string;
    location?: string;
  } | null>(null);

  // Tab 2 State (Daily Report & General Advice)
  const [reportDate, setReportDate] = useState<string>(todayStr);
  const [dailySummaryInput, setDailySummaryInput] = useState('');
  const [generalAdviceInput, setGeneralAdviceInput] = useState('');
  const [isSavingDaily, setIsSavingDaily] = useState(false);

  // Tab 3 State (Internal Staff Evaluation Modal)
  const [evaluatingOfficer, setEvaluatingOfficer] = useState<User | null>(null);
  const [evalRating, setEvalRating] = useState<number>(5);
  const [evalStrengths, setEvalStrengths] = useState('');
  const [evalImprovements, setEvalImprovements] = useState('');
  const [evalNotes, setEvalNotes] = useState('');
  const [isSavingEval, setIsSavingEval] = useState(false);

  // Tab 4 State (Urgent Calls Filter)
  const [urgentSubFilter, setUrgentSubFilter] = useState<'pending' | 'resolved' | 'all'>('pending');

  // Map taskId -> QCTaskReview
  const reviewByTaskId = useMemo(() => {
    const map = new Map<string, QCTaskReview>();
    qcReviews.forEach((r) => {
      map.set(r.taskId || r.id, r);
    });
    return map;
  }, [qcReviews]);

  const fieldOfficers = useMemo(() => {
    return users
      .filter((u) => u.role === 'field_officer')
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  // Overall QC KPIs
  const overviewStats = useMemo(() => {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => normalizeTaskStatus(t) === 'completed').length;
    const reviewed = qcReviews.length;
    const green = qcReviews.filter((r) => r.grade === 'green').length;
    const yellow = qcReviews.filter((r) => r.grade === 'yellow').length;
    const red = qcReviews.filter((r) => r.grade === 'red').length;
    const pendingCalls = qcReviews.filter((r) => r.needsUrgentCall && !r.urgentCallResolved).length;
    const greenRate = reviewed > 0 ? Math.round((green / reviewed) * 100) : 0;
    return { totalTasks, completedTasks, reviewed, green, yellow, red, pendingCalls, greenRate };
  }, [tasks, qcReviews]);

  // Tab 1 Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        const rev = reviewByTaskId.get(task.id);

        if (gradeFilter === 'unreviewed') {
          if (rev) return false;
        } else if (gradeFilter !== 'all') {
          if (!rev || rev.grade !== gradeFilter) return false;
        }

        if (officerFilter !== 'all' && task.assigneeId !== officerFilter) return false;

        if (errorTagFilter !== 'all') {
          if (!rev || !(rev.errorTags || []).includes(errorTagFilter)) return false;
        }

        if (urgentFilter === 'pending_call') {
          if (!rev || !rev.needsUrgentCall || rev.urgentCallResolved) return false;
        } else if (urgentFilter === 'any_call') {
          if (!rev || !rev.needsUrgentCall) return false;
        }

        if (dateFilter) {
          const effDate = getEffectiveTaskDate(task);
          if (effDate !== dateFilter) return false;
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const baseText = getTaskSearchableText(task, presets, students, users);
          const qcText = rev
            ? `${rev.comment || ''} ${(rev.customTags || []).join(' ')} ${rev.urgentCallReason || ''}`.toLowerCase()
            : '';
          if (!baseText.includes(q) && !qcText.includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const tA = new Date(a.completedAt || a.startedAt || a.createdAt || 0).getTime();
        const tB = new Date(b.completedAt || b.startedAt || b.createdAt || 0).getTime();
        return tB - tA;
      });
  }, [
    tasks,
    reviewByTaskId,
    gradeFilter,
    officerFilter,
    errorTagFilter,
    urgentFilter,
    dateFilter,
    searchQuery,
    presets,
    students,
    users,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [gradeFilter, officerFilter, errorTagFilter, urgentFilter, dateFilter, searchQuery, pageSize]);

  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, currentPage, pageSize]);

  // Tab 2: Sync Daily Report inputs when reportDate or qcDailyReports changes
  const activeDailyReport = useMemo(() => {
    return qcDailyReports.find((r) => r.date === reportDate || r.id === reportDate) || null;
  }, [qcDailyReports, reportDate]);

  useEffect(() => {
    setDailySummaryInput(activeDailyReport?.dailySummary || '');
    setGeneralAdviceInput(activeDailyReport?.generalAdvice || '');
  }, [reportDate, activeDailyReport?.updatedAt]);

  const dailyStats = useMemo(() => {
    return computeDailyQCStats(reportDate, tasks, qcReviews);
  }, [reportDate, tasks, qcReviews]);

  const sortedSavedDailyReports = useMemo(() => {
    return [...qcDailyReports]
      .filter((r) => r.dailySummary?.trim() || r.generalAdvice?.trim())
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [qcDailyReports]);

  // Tab 3: Officer Stats & Evaluations
  const officerScorecards = useMemo(() => {
    return fieldOfficers.map((officer) => {
      const stats = computeOfficerQCStats(officer.id, tasks, qcReviews);
      const evaluation = qcOfficerEvaluations.find(
        (e) => e.officerId === officer.id || e.id === officer.id
      );
      return { officer, stats, evaluation };
    });
  }, [fieldOfficers, tasks, qcReviews, qcOfficerEvaluations]);

  // Tab 4: Urgent Calls Items
  const urgentCallEntries = useMemo(() => {
    return qcReviews
      .filter((r) => r.needsUrgentCall)
      .filter((r) => {
        if (urgentSubFilter === 'pending') return !r.urgentCallResolved;
        if (urgentSubFilter === 'resolved') return Boolean(r.urgentCallResolved);
        return true;
      })
      .map((review) => ({
        review,
        task: tasks.find((t) => t.id === review.taskId),
      }))
      .sort((a, b) => {
        if (Boolean(a.review.urgentCallResolved) !== Boolean(b.review.urgentCallResolved)) {
          return a.review.urgentCallResolved ? 1 : -1;
        }
        return new Date(b.review.updatedAt).getTime() - new Date(a.review.updatedAt).getTime();
      });
  }, [qcReviews, tasks, urgentSubFilter]);

  // Access gate: Admin + Express Tracker Quality Control
  if (currentUser?.role !== 'admin' && currentUser?.etRole !== 'qc') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4 border border-red-100 shadow-xs">
          <ShieldAlert size={36} />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">{t('accessDenied')}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
          {isRTL
            ? 'قسم مراقبة الجودة (Quality Control) مخصص لحساب الأدمن فقط ولا يُسمح لأي دور آخر بالوصول إليه.'
            : 'Quality Control is strictly restricted to Admin accounts only.'}
        </p>
      </div>
    );
  }

  const handleSaveDaily = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDaily(true);
    try {
      await saveQCDailyReport(reportDate, {
        dailySummary: dailySummaryInput,
        generalAdvice: generalAdviceInput,
      });
      toast.success(isRTL ? 'تم حفظ التقرير اليومي والنصائح العامة' : 'Daily QC Report & General Advice saved');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save daily report');
    } finally {
      setIsSavingDaily(false);
    }
  };

  const handleExportDailyExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const summaryRows = [
        { Field: 'Report Date', Value: reportDate },
        { Field: 'Total Day Tasks', Value: dailyStats.dayTasks.length },
        { Field: 'QC Reviewed', Value: dailyStats.reviewedCount },
        { Field: 'Unreviewed', Value: dailyStats.unreviewedCount },
        { Field: 'Green (Clean)', Value: dailyStats.greenCount },
        { Field: 'Yellow (Minor Issue)', Value: dailyStats.yellowCount },
        { Field: 'Red (Critical Issue)', Value: dailyStats.redCount },
        { Field: 'Urgent Calls Needed', Value: dailyStats.urgentCallCount },
        { Field: 'Unresolved Urgent Calls', Value: dailyStats.unresolvedUrgentCallCount },
        { Field: 'Daily Operational Summary', Value: dailySummaryInput || '-' },
        { Field: 'General Advice & Recommendations', Value: generalAdviceInput || '-' },
      ];

      const taskRows = dailyStats.dayTasks.map((task) => {
        const rev = reviewByTaskId.get(task.id);
        const officer = users.find((u) => u.id === task.assigneeId);
        const student = !task.isNonStudentTask && task.studentId ? students.find((s) => s.id === task.studentId) : undefined;
        return {
          'Task ID': task.id,
          'Task Title': getTaskDisplayTitle(task, presets, language),
          'Student / Beneficiary': student?.fullName || task.nonStudentTitle || '-',
          'Field Officer': officer?.name || '-',
          'Task Status': normalizeTaskStatus(task),
          'Scheduled Time': task.taskTime || '-',
          'Duration': formatTaskDurationText(task.startedAt, task.completedAt, false),
          'QC Grade': rev ? getQCGradeLabel(rev.grade, language) : 'Not Reviewed',
          'Internal Score': rev?.internalScore ?? '-',
          'Error Tags': rev ? [...(rev.errorTags || []).map((id) => getQCErrorTagLabel(id, language)), ...(rev.customTags || [])].join(', ') : '-',
          'QC Comment': rev?.comment || '-',
          'Urgent Call Needed': rev?.needsUrgentCall ? (rev.urgentCallResolved ? 'Yes (Resolved)' : 'YES - PENDING') : 'No',
          'Urgent Call Reason': rev?.urgentCallReason || '-',
          'Evidence Screenshots': rev?.evidenceMedia?.length || 0,
        };
      });

      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      const wsTasks = XLSX.utils.json_to_sheet(taskRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Daily QC Summary');
      XLSX.utils.book_append_sheet(wb, wsTasks, 'Tasks QC Breakdown');
      XLSX.writeFile(wb, `QC_Daily_Report_${reportDate}.xlsx`);
      toast.success(isRTL ? 'تم تصدير التقرير اليومي بنجاح' : 'Daily QC Excel exported');
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Export failed');
    }
  };

  const handleCopyDailySummary = async () => {
    const lines = [
      `📋 *Quality Control Daily Report (${reportDate})*`,
      `• Tasks: ${dailyStats.dayTasks.length} | Reviewed: ${dailyStats.reviewedCount} | Unreviewed: ${dailyStats.unreviewedCount}`,
      `• 🟢 Green: ${dailyStats.greenCount} | 🟡 Yellow: ${dailyStats.yellowCount} | 🔴 Red: ${dailyStats.redCount}`,
      `• 📞 Urgent Calls: ${dailyStats.urgentCallCount} (${dailyStats.unresolvedUrgentCallCount} pending)`,
    ];

    if (dailyStats.tagCounts.length > 0) {
      const tagStr = dailyStats.tagCounts
        .map((item) => `${getQCErrorTagLabel(item.tagId, language)} (${item.count})`)
        .join('، ');
      lines.push(`• 🏷️ Top Issues: ${tagStr}`);
    }

    if (dailySummaryInput.trim()) {
      lines.push('', `📝 *Daily Summary:*`, dailySummaryInput.trim());
    }
    if (generalAdviceInput.trim()) {
      lines.push('', `💡 *General Advice & Recommendations:*`, generalAdviceInput.trim());
    }

    const flaggedTasks = dailyStats.dayTasks.filter((t) => {
      const r = reviewByTaskId.get(t.id);
      return r && (r.grade === 'red' || r.grade === 'yellow' || r.needsUrgentCall);
    });

    if (flaggedTasks.length > 0) {
      lines.push('', `⚠️ *Flagged Tasks (${flaggedTasks.length}):*`);
      flaggedTasks.forEach((t) => {
        const r = reviewByTaskId.get(t.id)!;
        const officer = users.find((u) => u.id === t.assigneeId)?.name || 'Unassigned';
        const icon = r.grade === 'red' ? '🔴' : r.grade === 'yellow' ? '🟡' : '🟢';
        lines.push(`${icon} ${getTaskDisplayTitle(t, presets, language)} (${officer})${r.needsUrgentCall ? ' [URGENT CALL]' : ''}: ${r.comment || '-'}`);
      });
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success(isRTL ? 'تم نسخ ملخص التقرير اليومي' : 'Daily QC summary copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const openOfficerEvalModal = (officer: User) => {
    const existing = qcOfficerEvaluations.find((e) => e.officerId === officer.id || e.id === officer.id);
    setEvaluatingOfficer(officer);
    setEvalRating(existing?.rating ?? 5);
    setEvalStrengths(existing?.strengths || '');
    setEvalImprovements(existing?.improvements || '');
    setEvalNotes(existing?.notes || '');
  };

  const handleSaveOfficerEval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evaluatingOfficer) return;
    setIsSavingEval(true);
    try {
      await saveQCOfficerEvaluation(evaluatingOfficer.id, {
        rating: evalRating,
        strengths: evalStrengths,
        improvements: evalImprovements,
        notes: evalNotes,
      });
      toast.success(isRTL ? 'تم حفظ التقييم الداخلي للموظف' : 'Internal staff evaluation saved');
      setEvaluatingOfficer(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save evaluation');
    } finally {
      setIsSavingEval(false);
    }
  };

  const stepReportDate = (delta: number) => {
    try {
      const d = parseISO(reportDate);
      const next = delta > 0 ? addDays(d, delta) : subDays(d, Math.abs(delta));
      setReportDate(format(next, 'yyyy-MM-dd'));
    } catch {
      setReportDate(todayStr);
    }
  };

  const clearTab1Filters = () => {
    setSearchQuery('');
    setGradeFilter('all');
    setOfficerFilter('all');
    setErrorTagFilter('all');
    setUrgentFilter('all');
    setDateFilter('');
  };

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      gradeFilter !== 'all' ||
      officerFilter !== 'all' ||
      errorTagFilter !== 'all' ||
      urgentFilter !== 'all' ||
      dateFilter
  );

  return (
    <div className="space-y-6 pb-12" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-xl border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-400/30 text-red-200 text-xs font-bold mb-2">
              <ShieldCheck size={14} />
              <span>{t('qcAdminOnlyNotice')}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{t('qualityControl')}</h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">{t('qcSubtitle')}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('daily_report')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 transition-colors cursor-pointer"
            >
              <Lightbulb size={15} className="text-amber-300" />
              <span>{t('qcDailyReportTab')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('urgent_calls')}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer',
                overviewStats.pendingCalls > 0
                  ? 'bg-red-600 hover:bg-red-700 text-white border-red-500 shadow-lg shadow-red-600/30'
                  : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
              )}
            >
              <PhoneCall size={15} />
              <span>
                {t('qcUrgentCallsTab')} ({overviewStats.pendingCalls})
              </span>
            </button>
          </div>
        </div>

        {/* 5 KPI Overview Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3.5 border border-white/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block">
              {isRTL ? 'المهام المراجعة' : 'QC Reviewed'}
            </span>
            <div className="text-2xl font-black mt-1">{overviewStats.reviewed}</div>
            <span className="text-[11px] text-slate-300">
              {isRTL ? `من ${overviewStats.completedTasks} مكتملة` : `of ${overviewStats.completedTasks} completed`}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveTab('reviews');
              setGradeFilter('green');
            }}
            className="bg-emerald-500/15 hover:bg-emerald-500/25 backdrop-blur-sm rounded-2xl p-3.5 border border-emerald-400/25 text-start transition-colors cursor-pointer"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200 block">
              {isRTL ? 'أخضر (ممتاز)' : 'Green (Clean)'}
            </span>
            <div className="text-2xl font-black text-emerald-300 mt-1">{overviewStats.green}</div>
            <span className="text-[11px] text-emerald-200">
              {overviewStats.greenRate}% {isRTL ? 'نسبة الجودة' : 'clean rate'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('reviews');
              setGradeFilter('yellow');
            }}
            className="bg-amber-500/15 hover:bg-amber-500/25 backdrop-blur-sm rounded-2xl p-3.5 border border-amber-400/25 text-start transition-colors cursor-pointer"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200 block">
              {isRTL ? 'أصفر (خطأ بسيط)' : 'Yellow (Minor)'}
            </span>
            <div className="text-2xl font-black text-amber-300 mt-1">{overviewStats.yellow}</div>
            <span className="text-[11px] text-amber-200">{isRTL ? 'أخطاء غير جسيمة' : 'non-critical'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('reviews');
              setGradeFilter('red');
            }}
            className="bg-red-500/20 hover:bg-red-500/30 backdrop-blur-sm rounded-2xl p-3.5 border border-red-400/30 text-start transition-colors cursor-pointer"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-200 block">
              {isRTL ? 'أحمر (مشكلة كبيرة)' : 'Red (Critical)'}
            </span>
            <div className="text-2xl font-black text-red-300 mt-1">{overviewStats.red}</div>
            <span className="text-[11px] text-red-200">{isRTL ? 'تحتاج متابعة عاجلة' : 'major issues'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('urgent_calls')}
            className="col-span-2 sm:col-span-1 bg-rose-500/20 hover:bg-rose-500/30 backdrop-blur-sm rounded-2xl p-3.5 border border-rose-400/30 text-start transition-colors cursor-pointer"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-200 block">
              {isRTL ? 'اتصالات ضرورية معلقة' : 'Pending Urgent Calls'}
            </span>
            <div className="text-2xl font-black text-rose-200 mt-1">{overviewStats.pendingCalls}</div>
            <span className="text-[11px] text-rose-200">{isRTL ? 'لأخذ الفيدباك / المتابعة' : 'feedback / follow-up'}</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-x-auto">
        {([
          { id: 'reviews', label: t('qcTaskReviewsTab'), icon: ClipboardList },
          { id: 'daily_report', label: t('qcDailyReportTab'), icon: Lightbulb },
          { id: 'staff_eval', label: t('qcStaffEvalTab'), icon: Award },
          { id: 'urgent_calls', label: t('qcUrgentCallsTab'), icon: PhoneCall, badge: overviewStats.pendingCalls },
        ] as const).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer',
                active
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
              {'badge' in tab && tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded-full text-[10px] font-black',
                    active ? 'bg-white/25 text-white' : 'bg-red-600 text-white'
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: TASK REVIEWS & QUEUE                                           */}
      {/* ===================================================================== */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <div className="relative md:col-span-2">
                <Search className={cn('absolute top-1/2 -translate-y-1/2 text-slate-400', isRTL ? 'right-3' : 'left-3')} size={16} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isRTL ? 'بحث بالطالب، الموظف، المهمة، أو كومنت الكواليتي...' : 'Search student, officer, task, or QC note...'}
                  className={cn(
                    'w-full py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600',
                    isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
                  )}
                />
              </div>

              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value as any)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value="all">{isRTL ? 'كل درجات الجودة' : 'All QC Grades'}</option>
                <option value="unreviewed">{t('qcUnreviewed')}</option>
                <option value="green">{t('qcGradeGreen')}</option>
                <option value="yellow">{t('qcGradeYellow')}</option>
                <option value="red">{t('qcGradeRed')}</option>
              </select>

              <select
                value={officerFilter}
                onChange={(e) => setOfficerFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value="all">{isRTL ? 'كل الموظفين' : 'All Officers'}</option>
                {fieldOfficers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>

              <select
                value={errorTagFilter}
                onChange={(e) => setErrorTagFilter(e.target.value as any)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value="all">{isRTL ? 'كل تصنيفات الأخطاء' : 'All Error Tags'}</option>
                {QC_ERROR_TAGS.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {isRTL ? tag.labelAr : tag.labelEn}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setUrgentFilter(urgentFilter === 'pending_call' ? 'all' : 'pending_call')}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border transition-colors cursor-pointer',
                    urgentFilter === 'pending_call'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  )}
                >
                  <PhoneCall size={12} />
                  <span>{isRTL ? 'يحتاج اتصال ضروري فقط' : 'Pending Urgent Call Only'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDateFilter(dateFilter === todayStr ? '' : todayStr)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border transition-colors cursor-pointer',
                    dateFilter === todayStr
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  )}
                >
                  <Calendar size={12} />
                  <span>{isRTL ? 'مهام اليوم' : 'Today'}</span>
                </button>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearTab1Filters}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>{isRTL ? 'مسح الفلاتر' : 'Reset'}</span>
                  </button>
                )}
              </div>

              <span className="text-xs text-slate-500 dark:text-slate-400">
                {isRTL ? `عرض ${filteredTasks.length} مهمة` : `Showing ${filteredTasks.length} tasks`}
              </span>
            </div>
          </div>

          {/* Tasks List */}
          <div className="space-y-3">
            {paginatedTasks.map((task) => {
              const rev = reviewByTaskId.get(task.id);
              const officer = users.find((u) => u.id === task.assigneeId);
              const student =
                !task.isNonStudentTask && task.studentId
                  ? students.find((s) => s.id === task.studentId)
                  : undefined;
              const taskTitle = getTaskDisplayTitle(task, presets, language);
              const serviceLabel = getTaskServiceLabel(task, presets, language);
              const effectiveStatus = normalizeTaskStatus(task);
              const contactPhone = task.isNonStudentTask ? task.nonStudentContact : student?.contactInfo;
              const whatsappUrl = formatWhatsAppUrl(contactPhone);

              return (
                <div
                  key={task.id}
                  className={cn(
                    'bg-white dark:bg-slate-900 rounded-2xl border p-4 sm:p-5 shadow-2xs transition-all space-y-3',
                    rev?.grade === 'red'
                      ? 'border-red-300 dark:border-red-800/80'
                      : rev?.grade === 'yellow'
                        ? 'border-amber-300 dark:border-amber-800/80'
                        : rev?.grade === 'green'
                          ? 'border-emerald-200 dark:border-emerald-800/70'
                          : 'border-slate-200 dark:border-slate-800'
                  )}
                >
                  {/* Top Row */}
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {rev ? (
                          <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold border', QC_GRADES[rev.grade].badgeClasses)}>
                            <span className={cn('w-2 h-2 rounded-full', QC_GRADES[rev.grade].dotClass)} />
                            <span>{getQCGradeLabel(rev.grade, language)}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            {t('qcUnreviewed')}
                          </span>
                        )}

                        {rev?.needsUrgentCall && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold border',
                              rev.urgentCallResolved
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-rose-600 text-white border-rose-600'
                            )}
                          >
                            <PhoneCall size={11} />
                            <span>
                              {rev.urgentCallResolved
                                ? (isRTL ? 'تم الاتصال' : 'Call Done')
                                : (isRTL ? 'مطلوب اتصال ضروري' : 'Urgent Call Needed')}
                            </span>
                          </span>
                        )}

                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border', getTaskStatusBadgeClasses(effectiveStatus))}>
                          {t(effectiveStatus) || effectiveStatus}
                        </span>

                        <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800/60">
                          {serviceLabel}
                        </span>
                      </div>

                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white leading-snug">
                        {taskTitle}
                      </h3>

                      <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {student?.fullName || task.nonStudentTitle || (isRTL ? 'مهمة عامة' : 'General')}
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <UserIcon size={12} className="text-blue-500" />
                          {officer?.name || (isRTL ? 'غير معين' : 'Unassigned')}
                        </span>
                        {task.taskDate && (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1">
                              <Calendar size={12} className="text-purple-500" />
                              {formatDateDDMMYYYY(task.taskDate)} {task.taskTime ? `@ ${task.taskTime}` : ''}
                            </span>
                          </>
                        )}
                        {task.startedAt && (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock size={12} className="text-emerald-500" />
                              {formatTaskDurationText(task.startedAt, task.completedAt, isRTL)}
                            </span>
                          </>
                        )}
                        {task.feedback?.rating && (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                              <Star size={12} className="fill-amber-400 text-amber-400" />
                              {task.feedback.rating}/5 CSAT
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {whatsappUrl && (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold transition-colors"
                        >
                          <Phone size={13} />
                          <span>WhatsApp</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setInspectingTask(task)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Eye size={13} />
                        <span>{isRTL ? 'عرض المهمة' : 'Inspect'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewingTask(task)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-colors cursor-pointer shadow-2xs',
                          rev
                            ? 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white'
                            : 'bg-red-600 hover:bg-red-700 text-white'
                        )}
                      >
                        <ShieldCheck size={14} />
                        <span>
                          {rev
                            ? (isRTL ? 'تعديل تقرير الجودة' : 'Edit QC Report')
                            : (isRTL ? 'كتابة تقرير جودة' : 'Write QC Report')}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Field Officer Logistic Report snippet */}
                  {task.notes && (
                    <div className="bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700/70 text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-extrabold text-slate-500 dark:text-slate-400 uppercase text-[10px] mr-1.5">
                        {t('fieldOfficerReport')}:
                      </span>
                      <span>{task.notes}</span>
                    </div>
                  )}

                  {/* QC Review Details Box (if reviewed) */}
                  {rev && (
                    <div className="bg-slate-900/5 dark:bg-slate-950/80 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                          <ShieldCheck size={13} className="text-red-600" />
                          <span>{t('qcReport')}</span>
                          {rev.internalScore && (
                            <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 ml-2">
                              • <Star size={11} className="fill-amber-400 text-amber-400" /> {rev.internalScore}/5
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {rev.reviewedByName} • {format(new Date(rev.updatedAt), 'dd/MM/yyyy HH:mm')}
                        </span>
                      </div>

                      {/* Tags */}
                      {((rev.errorTags && rev.errorTags.length > 0) || (rev.customTags && rev.customTags.length > 0)) && (
                        <div className="flex flex-wrap gap-1.5">
                          {(rev.errorTags || []).map((tagId) => (
                            <span
                              key={tagId}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/70 text-[11px] font-bold"
                            >
                              <Tag size={10} />
                              <span>{getQCErrorTagLabel(tagId, language)}</span>
                            </span>
                          ))}
                          {(rev.customTags || []).map((ct) => (
                            <span
                              key={ct}
                              className="inline-flex items-center px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/70 text-[11px] font-bold"
                            >
                              #{ct}
                            </span>
                          ))}
                        </div>
                      )}

                      {rev.comment && (
                        <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
                          {rev.comment}
                        </p>
                      )}

                      {rev.needsUrgentCall && (
                        <div className="flex items-center justify-between flex-wrap gap-2 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800/60 text-xs">
                          <div className="flex items-center gap-2 text-rose-900 dark:text-rose-200">
                            <PhoneCall size={13} className="text-rose-600 shrink-0" />
                            <span>
                              <strong>{isRTL ? 'سبب الاتصال الضروري:' : 'Urgent Call:'}</strong>{' '}
                              {rev.urgentCallReason || (isRTL ? 'مطلوب متابعة وأخذ الفيدباك' : 'Follow-up / Feedback required')}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleQCUrgentCallResolved(task.id, !rev.urgentCallResolved)}
                            className={cn(
                              'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer',
                              rev.urgentCallResolved
                                ? 'bg-emerald-600 text-white'
                                : 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border border-rose-300 hover:bg-rose-100'
                            )}
                          >
                            {rev.urgentCallResolved ? t('qcUrgentCallResolved') : t('qcMarkCallDone')}
                          </button>
                        </div>
                      )}

                      {/* Evidence Screenshots */}
                      {rev.evidenceMedia && rev.evidenceMedia.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap pt-1">
                          {rev.evidenceMedia.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() =>
                                setLightboxMedia({
                                  url: m.url,
                                  title: m.caption || m.name || 'QC Chat Evidence',
                                  timestamp: m.uploadedAt,
                                })
                              }
                              className="group flex items-center gap-2 p-1.5 pr-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-purple-400 transition-colors cursor-pointer"
                            >
                              <img src={m.url} alt={m.caption || 'Evidence'} className="w-9 h-9 rounded-lg object-cover" />
                              <div className="text-start">
                                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 block max-w-[140px] truncate">
                                  {m.caption || (isRTL ? 'صورة إثبات' : 'Chat Evidence')}
                                </span>
                                <span className="text-[10px] text-purple-600 dark:text-purple-400 flex items-center gap-1">
                                  <Camera size={10} /> {isRTL ? 'تكبير' : 'View'}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredTasks.length === 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-400">
                <ShieldCheck size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-bold">{isRTL ? 'لا توجد مهام مطابقة للفلاتر الحالية.' : 'No tasks match your current filters.'}</p>
              </div>
            )}
          </div>

          {filteredTasks.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalItems={filteredTasks.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              colorScheme="red"
            />
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: DAILY QC REPORT & GENERAL ADVICE                               */}
      {/* ===================================================================== */}
      {activeTab === 'daily_report' && (
        <div className="space-y-6">
          {/* Date Selector & Export Actions */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => stepReportDate(-1)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                title="Previous day"
              >
                {isRTL ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value || todayStr)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => stepReportDate(1)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                title="Next day"
              >
                {isRTL ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </button>
              {reportDate !== todayStr && (
                <button
                  type="button"
                  onClick={() => setReportDate(todayStr)}
                  className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-xs font-bold cursor-pointer"
                >
                  {isRTL ? 'اليوم' : 'Today'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleCopyDailySummary}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold transition-colors cursor-pointer"
              >
                <Copy size={14} />
                <span>{t('qcCopyDailySummary')}</span>
              </button>
              <button
                type="button"
                onClick={handleExportDailyExcel}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <Download size={14} />
                <span>{t('qcExportDailyExcel')}</span>
              </button>
            </div>
          </div>

          {/* Day Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">{isRTL ? 'مهام اليوم' : 'Day Tasks'}</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white">{dailyStats.dayTasks.length}</span>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">{isRTL ? 'تمت مراجعتها' : 'Reviewed'}</span>
              <span className="text-2xl font-black text-blue-600">{dailyStats.reviewedCount}</span>
              <span className="text-[10px] text-slate-400 block">{dailyStats.unreviewedCount} {isRTL ? 'متبقية' : 'unreviewed'}</span>
            </div>
            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60">
              <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block">{isRTL ? 'أخضر' : 'Green'}</span>
              <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{dailyStats.greenCount}</span>
            </div>
            <div className="bg-amber-50/70 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-800/60">
              <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300 block">{isRTL ? 'أصفر' : 'Yellow'}</span>
              <span className="text-2xl font-black text-amber-700 dark:text-amber-300">{dailyStats.yellowCount}</span>
            </div>
            <div className="bg-red-50/70 dark:bg-red-950/30 p-4 rounded-2xl border border-red-200 dark:border-red-800/60">
              <span className="text-[10px] font-bold uppercase text-red-700 dark:text-red-300 block">{isRTL ? 'أحمر' : 'Red'}</span>
              <span className="text-2xl font-black text-red-700 dark:text-red-300">{dailyStats.redCount}</span>
            </div>
            <div className="bg-rose-50/70 dark:bg-rose-950/30 p-4 rounded-2xl border border-rose-200 dark:border-rose-800/60">
              <span className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300 block">{isRTL ? 'اتصال ضروري' : 'Urgent Calls'}</span>
              <span className="text-2xl font-black text-rose-700 dark:text-rose-300">{dailyStats.urgentCallCount}</span>
            </div>
          </div>

          {/* Day Top Error Tags */}
          {dailyStats.tagCounts.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-extrabold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mr-1">
                <Tag size={14} className="text-red-600" />
                {isRTL ? 'أكثر الأخطاء اليوم:' : "Today's Error Tags:"}
              </span>
              {dailyStats.tagCounts.map((item) => (
                <span
                  key={item.tagId}
                  className="px-2.5 py-1 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-xs font-bold"
                >
                  {getQCErrorTagLabel(item.tagId, language)} ({item.count})
                </span>
              ))}
            </div>
          )}

          {/* Daily Summary & General Advice Editor (NOT tied to any specific ticket) */}
          <form
            onSubmit={handleSaveDaily}
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Lightbulb size={18} className="text-amber-500" />
                  <span>{t('qcGeneralAdvice')}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isRTL
                    ? 'مساحة مخصصة لكتابة التقرير اليومي العام والنصائح والتوجيهات المستقلة عن أي مهمة محددة.'
                    : 'Dedicated daily report & general operational advice independent of any specific ticket.'}
                </p>
              </div>

              {activeDailyReport && (
                <span className="text-[11px] text-slate-400">
                  {isRTL ? 'آخر تحديث:' : 'Last saved:'} {activeDailyReport.updatedByName} •{' '}
                  {format(new Date(activeDailyReport.updatedAt), 'dd/MM HH:mm')}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-200 block">
                  {t('qcDailySummary')} ({formatDateDDMMYYYY(reportDate)})
                </label>
                <textarea
                  rows={5}
                  value={dailySummaryInput}
                  onChange={(e) => setDailySummaryInput(e.target.value)}
                  placeholder={isRTL ? 'اكتب ملخص سير العمل وجودة التنفيذ خلال هذا اليوم...' : 'Summarize overall operational quality for this day...'}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <Lightbulb size={14} />
                  <span>{t('qcGeneralAdvice')}</span>
                </label>
                <textarea
                  rows={5}
                  value={generalAdviceInput}
                  onChange={(e) => setGeneralAdviceInput(e.target.value)}
                  placeholder={t('qcGeneralAdvicePlaceholder')}
                  className="w-full p-3 bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-2xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSavingDaily}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold rounded-xl shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSavingDaily ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}
                <span>{isSavingDaily ? t('saving') : t('qcSaveDailyReport')}</span>
              </button>
            </div>
          </form>

          {/* Day's Tasks Breakdown */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              {isRTL ? `تفاصيل مهام يوم ${formatDateDDMMYYYY(reportDate)} (${dailyStats.dayTasks.length})` : `Tasks on ${formatDateDDMMYYYY(reportDate)} (${dailyStats.dayTasks.length})`}
            </h3>

            {dailyStats.dayTasks.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {dailyStats.dayTasks.map((task) => {
                  const rev = reviewByTaskId.get(task.id);
                  const officer = users.find((u) => u.id === task.assigneeId);
                  const student = !task.isNonStudentTask && task.studentId ? students.find((s) => s.id === task.studentId) : undefined;
                  return (
                    <div key={task.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {rev ? (
                            <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-extrabold border', QC_GRADES[rev.grade].badgeClasses)}>
                              {getQCGradeLabel(rev.grade, language)}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                              {t('qcUnreviewed')}
                            </span>
                          )}
                          <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {getTaskDisplayTitle(task, presets, language)}
                          </span>
                          {rev?.needsUrgentCall && !rev.urgentCallResolved && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-600 text-white">
                              {isRTL ? 'اتصال ضروري' : 'Urgent Call'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {student?.fullName || task.nonStudentTitle || '-'} • {officer?.name || 'Unassigned'}
                          {rev?.comment ? ` — "${rev.comment}"` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setInspectingTask(task)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                        >
                          {isRTL ? 'تفاصيل' : 'Inspect'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setReviewingTask(task)}
                          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 text-white text-xs font-bold cursor-pointer"
                        >
                          {rev ? (isRTL ? 'تعديل' : 'Edit QC') : (isRTL ? 'مراجعة' : 'Review')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">
                {isRTL ? 'لا توجد مهام مسجلة في هذا اليوم.' : 'No tasks recorded for this date.'}
              </p>
            )}
          </div>

          {/* Saved Daily Reports & Advice Archive */}
          {sortedSavedDailyReports.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                {isRTL ? 'أرشيف التقارير اليومية والنصائح العامة' : 'Saved Daily Reports & Advice History'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sortedSavedDailyReports.slice(0, 10).map((rep) => (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() => setReportDate(rep.date)}
                    className={cn(
                      'p-3.5 rounded-2xl border text-start transition-all cursor-pointer space-y-1.5',
                      rep.date === reportDate
                        ? 'bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-800'
                        : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-red-300'
                    )}
                  >
                    <div className="flex items-center justify-between text-xs font-extrabold text-slate-900 dark:text-white">
                      <span>{formatDateDDMMYYYY(rep.date)}</span>
                      <span className="text-[10px] font-normal text-slate-400">{rep.updatedByName}</span>
                    </div>
                    {rep.generalAdvice && (
                      <p className="text-xs text-amber-800 dark:text-amber-300 line-clamp-2">
                        💡 {rep.generalAdvice}
                      </p>
                    )}
                    {rep.dailySummary && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                        {rep.dailySummary}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: INTERNAL STAFF EVALUATION                                      */}
      {/* ===================================================================== */}
      {activeTab === 'staff_eval' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {officerScorecards.map(({ officer, stats, evaluation }) => {
            const scoreColor =
              stats.qualityScore === null
                ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                : stats.qualityScore >= 85
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : stats.qualityScore >= 65
                    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300';

            return (
              <div
                key={officer.id}
                className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Officer Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center font-black text-lg">
                        {officer.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-slate-900 dark:text-white text-base">{officer.name}</h3>
                        <p className="text-xs text-slate-500 font-mono">@{officer.username}</p>
                      </div>
                    </div>

                    <div className={cn('px-3 py-1.5 rounded-2xl border text-center', scoreColor)}>
                      <span className="text-[10px] font-bold uppercase block">{t('qcQualityScore')}</span>
                      <span className="text-lg font-black">
                        {stats.qualityScore !== null ? `${stats.qualityScore}%` : '--'}
                      </span>
                    </div>
                  </div>

                  {/* Grade Distribution Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 font-semibold">
                      <span>
                        {isRTL ? `تم مراجعة ${stats.totalReviewed} مهمة` : `${stats.totalReviewed} tasks QC reviewed`}
                      </span>
                      <div className="flex items-center gap-3 text-[11px] font-bold">
                        <span className="text-emerald-600">🟢 {stats.greenCount}</span>
                        <span className="text-amber-600">🟡 {stats.yellowCount}</span>
                        <span className="text-red-600">🔴 {stats.redCount}</span>
                      </div>
                    </div>
                    {stats.totalReviewed > 0 && (
                      <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                        <div className="bg-emerald-500" style={{ width: `${(stats.greenCount / stats.totalReviewed) * 100}%` }} />
                        <div className="bg-amber-400" style={{ width: `${(stats.yellowCount / stats.totalReviewed) * 100}%` }} />
                        <div className="bg-red-600" style={{ width: `${(stats.redCount / stats.totalReviewed) * 100}%` }} />
                      </div>
                    )}
                  </div>

                  {/* Quick Metrics */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 block font-bold">{isRTL ? 'متوسط التقييم' : 'Avg Task Star'}</span>
                      <span className="font-black text-slate-900 dark:text-white">
                        {stats.avgInternalScore !== null ? `${stats.avgInternalScore} / 5` : '--'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 block font-bold">{isRTL ? 'مكتمل غير مراجع' : 'Unreviewed'}</span>
                      <span className="font-black text-slate-900 dark:text-white">{stats.unreviewedCompleted}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700">
                      <span className="text-[10px] text-slate-400 block font-bold">{isRTL ? 'اتصالات ضرورية' : 'Urgent Calls'}</span>
                      <span className="font-black text-rose-600">{stats.urgentCallsCount}</span>
                    </div>
                  </div>

                  {/* Recurring Error Tags */}
                  {(stats.tagCounts.length > 0 || stats.customTagCounts.length > 0) && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                        {isRTL ? 'أكثر الأخطاء تكراراً:' : 'Top Recurring Error Tags:'}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {stats.tagCounts.slice(0, 5).map((item) => (
                          <span
                            key={item.tagId}
                            className="px-2 py-0.5 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/70 text-[11px] font-bold"
                          >
                            {getQCErrorTagLabel(item.tagId, language)} × {item.count}
                          </span>
                        ))}
                        {stats.customTagCounts.slice(0, 3).map((item) => (
                          <span
                            key={item.tag}
                            className="px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/70 text-[11px] font-bold"
                          >
                            #{item.tag} × {item.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Confidential Internal QC Evaluation Box */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                        {t('qcInternalEvaluation')}
                      </span>
                      {evaluation && (
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              size={13}
                              className={s <= evaluation.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {evaluation ? (
                      <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                        {evaluation.strengths && (
                          <p>
                            <strong className="text-emerald-700 dark:text-emerald-400">{isRTL ? 'نقاط القوة:' : 'Strengths:'}</strong>{' '}
                            {evaluation.strengths}
                          </p>
                        )}
                        {evaluation.improvements && (
                          <p>
                            <strong className="text-amber-700 dark:text-amber-400">{isRTL ? 'نقاط التحسين:' : 'To Improve:'}</strong>{' '}
                            {evaluation.improvements}
                          </p>
                        )}
                        {evaluation.notes && <p className="italic">{evaluation.notes}</p>}
                        <p className="text-[10px] text-slate-400 pt-1">
                          {evaluation.updatedByName} • {format(new Date(evaluation.updatedAt), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        {isRTL ? 'لم يتم كتابة تقييم داخلي بعد.' : 'No confidential internal evaluation written yet.'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setOfficerFilter(officer.id);
                      setGradeFilter('all');
                      setActiveTab('reviews');
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                  >
                    {isRTL ? 'عرض مهام الموظف' : 'View Reviewed Tasks'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openOfficerEvalModal(officer)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                  >
                    <Edit size={13} />
                    <span>{evaluation ? (isRTL ? 'تعديل التقييم الداخلي' : 'Edit Internal Evaluation') : (isRTL ? 'إضافة تقييم داخلي' : 'Add Internal Evaluation')}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: URGENT CALLS QUEUE                                             */}
      {/* ===================================================================== */}
      {activeTab === 'urgent_calls' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 w-fit">
            {([
              { id: 'pending', label: isRTL ? 'بانتظار الاتصال' : 'Pending Call' },
              { id: 'resolved', label: isRTL ? 'تم الاتصال' : 'Resolved' },
              { id: 'all', label: isRTL ? 'الكل' : 'All' },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setUrgentSubFilter(item.id)}
                className={cn(
                  'px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors',
                  urgentSubFilter === item.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {urgentCallEntries.map(({ review, task }) => {
              const student = task && !task.isNonStudentTask && task.studentId ? students.find((s) => s.id === task.studentId) : undefined;
              const officer = users.find((u) => u.id === (task?.assigneeId || review.officerId));
              const contactName = student?.fullName || task?.nonStudentTitle || (isRTL ? 'مستفيد' : 'Beneficiary');
              const contactPhone = task?.isNonStudentTask ? task.nonStudentContact : student?.contactInfo;
              const whatsappUrl = formatWhatsAppUrl(contactPhone);

              return (
                <div
                  key={review.id}
                  className={cn(
                    'bg-white dark:bg-slate-900 rounded-2xl border p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4',
                    review.urgentCallResolved
                      ? 'border-emerald-200 dark:border-emerald-800/70'
                      : 'border-rose-300 dark:border-rose-800'
                  )}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold',
                          review.urgentCallResolved
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-600 text-white'
                        )}
                      >
                        <PhoneCall size={11} />
                        <span>{review.urgentCallResolved ? t('qcUrgentCallResolved') : (isRTL ? 'مطلوب اتصال ضروري' : 'Urgent Call Needed')}</span>
                      </span>
                      <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-bold border', QC_GRADES[review.grade].badgeClasses)}>
                        {getQCGradeLabel(review.grade, language)}
                      </span>
                      {task?.taskDate && (
                        <span className="text-xs text-slate-400">{formatDateDDMMYYYY(task.taskDate)}</span>
                      )}
                    </div>

                    <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                      {contactName} {contactPhone ? `• ${contactPhone}` : ''}
                    </h4>

                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {task ? getTaskDisplayTitle(task, presets, language) : review.taskId} • {officer?.name || 'Unassigned'}
                    </p>

                    {review.urgentCallReason && (
                      <p className="text-xs font-semibold text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800/60">
                        {review.urgentCallReason}
                      </p>
                    )}

                    {review.comment && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 italic">"{review.comment}"</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {contactPhone && (
                      <a
                        href={`tel:${contactPhone}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold"
                      >
                        <Phone size={13} />
                        <span>{isRTL ? 'اتصال' : 'Call'}</span>
                      </a>
                    )}
                    {whatsappUrl && (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold"
                      >
                        <MessageSquare size={13} />
                        <span>WhatsApp</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleQCUrgentCallResolved(review.taskId, !review.urgentCallResolved)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-colors',
                        review.urgentCallResolved
                          ? 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      )}
                    >
                      <CheckCircle2 size={14} />
                      <span>{review.urgentCallResolved ? t('qcReopenCall') : t('qcMarkCallDone')}</span>
                    </button>
                    {task && (
                      <button
                        type="button"
                        onClick={() => setReviewingTask(task)}
                        className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                      >
                        {isRTL ? 'تعديل' : 'Edit'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {urgentCallEntries.length === 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-400">
                <PhoneCall size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-bold">
                  {isRTL ? 'لا توجد مكالمات ضرورية في هذه القائمة.' : 'No urgent calls in this queue.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Internal Officer Evaluation Modal */}
      {evaluatingOfficer && (
        <div
          className="fixed inset-0 z-[75] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setEvaluatingOfficer(null)}
        >
          <form
            onSubmit={handleSaveOfficerEval}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-300 block">
                  {t('qcAdminOnlyNotice')}
                </span>
                <h3 className="text-lg font-black mt-0.5">{evaluatingOfficer.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEvaluatingOfficer(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-200 block mb-1.5">
                  {t('qcInternalRating')} (1 - 5)
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setEvalRating(star)}
                      className="p-1 cursor-pointer transition-transform hover:scale-110"
                    >
                      <Star
                        size={24}
                        className={star <= evalRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}
                      />
                    </button>
                  ))}
                  <span className="text-sm font-black text-slate-800 dark:text-white ml-2">{evalRating} / 5</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 block mb-1">
                  {isRTL ? 'نقاط القوة' : 'Strengths'}
                </label>
                <input
                  type="text"
                  value={evalStrengths}
                  onChange={(e) => setEvalStrengths(e.target.value)}
                  placeholder={isRTL ? 'مثال: التزام ممتاز بالمواعيد وتواصل راقي...' : 'e.g., Punctual, polite with students...'}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-extrabold text-amber-700 dark:text-amber-400 block mb-1">
                  {isRTL ? 'نقاط تحتاج تحسين' : 'Areas to Improve'}
                </label>
                <input
                  type="text"
                  value={evalImprovements}
                  onChange={(e) => setEvalImprovements(e.target.value)}
                  placeholder={isRTL ? 'مثال: سرعة رفع الصور وتفاصيل التقرير...' : 'e.g., Photo clarity, faster initial contact...'}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-200 block mb-1">
                  {isRTL ? 'ملاحظات التقييم الداخلي (سرية)' : 'Confidential Assessment Notes'}
                </label>
                <textarea
                  rows={4}
                  value={evalNotes}
                  onChange={(e) => setEvalNotes(e.target.value)}
                  placeholder={isRTL ? 'تقييم شامل لأداء الموظف بناءً على مراجعة المهام...' : 'Internal performance assessment based on observed QC reviews...'}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEvaluatingOfficer(null)}
                className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={isSavingEval}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
              >
                {isSavingEval ? t('saving') : t('qcSaveEvaluation')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* QC Review Modal */}
      <QCReviewModal
        isOpen={!!reviewingTask}
        onClose={() => setReviewingTask(null)}
        task={reviewingTask}
        onInspectTask={(taskToInspect) => setInspectingTask(taskToInspect)}
      />

      {/* Full Task Audit Modal */}
      <TaskDetailModal
        isOpen={!!inspectingTask}
        onClose={() => setInspectingTask(null)}
        task={inspectingTask}
        onOpenLightbox={(url, caption, timestamp, location) =>
          setLightboxMedia({ url, title: caption, timestamp, location })
        }
      />

      {/* Lightbox */}
      <PhotoLightboxModal
        isOpen={!!lightboxMedia}
        onClose={() => setLightboxMedia(null)}
        imageUrl={lightboxMedia?.url || null}
        title={lightboxMedia?.title}
        timestamp={lightboxMedia?.timestamp}
        location={lightboxMedia?.location}
      />
    </div>
  );
}
