import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext, MappedFeedbackEntry } from '../context/AppContext';
import { Language, ServicePackage, TaskFeedback } from '../types';
import { getServiceQuestions } from './FeedbackForm';
import { cn } from '../components/layout/Layout';
import {
  TaskCategory,
  getTaskCategory,
  getTaskDisplayTitle,
  getTaskSubjectName,
  matchesTaskTypeFilter,
  normalizeTaskStatus,
} from '../utils/taskClassification';
import {
  MessageSquareQuote,
  Star,
  ThumbsUp,
  AlertTriangle,
  Search,
  Filter,
  RotateCcw,
  User,
  Mail,
  Calendar,
  Clock,
  Layers,
  Sparkles,
  ExternalLink,
  X,
  CheckCircle2,
  MessageSquare,
  Timer,
  ShieldAlert,
  LayoutGrid,
  Table as TableIcon,
  Eye,
  ArrowUpRight,
  GraduationCap,
} from 'lucide-react';

interface FeedbacksProps {
  onSelectStudent?: (studentId: string) => void;
}

const formatDateTimeUTC8 = (dateStr?: string, lang: Language = 'en') => {
  if (!dateStr) return lang === 'ar' ? 'غير متوفر' : 'N/A';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  try {
    const formatted = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-MY' : 'en-US', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
    return formatted;
  } catch {
    return date.toLocaleString();
  }
};

const formatDuration = (startStr?: string, endStr?: string, isRTL = false) => {
  if (!startStr || !endStr) return isRTL ? 'غير متوفر' : 'N/A';
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  const diff = end - start;
  if (isNaN(diff) || diff <= 0) return isRTL ? 'أقل من دقيقة' : '< 1m';

  const totalMinutes = Math.round(diff / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return isRTL ? `${days} يوم و ${hours} ساعة` : `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return isRTL ? `${hours} ساعة و ${minutes} دقيقة` : `${hours}h ${minutes}m`;
  }
  return isRTL ? `${minutes} دقيقة` : `${minutes}m`;
};

const getSatisfactionMeta = (satisfaction?: TaskFeedback['satisfaction'], lang: Language = 'en') => {
  switch (satisfaction) {
    case 'very_satisfied':
      return {
        label: lang === 'ar' ? 'راضٍ جداً' : 'Very Satisfied',
        emoji: '😍',
        pillClass: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80',
      };
    case 'satisfied':
      return {
        label: lang === 'ar' ? 'راضٍ' : 'Satisfied',
        emoji: '😊',
        pillClass: 'bg-green-100 dark:bg-emerald-950/60 text-green-800 dark:text-emerald-300 border-green-200 dark:border-emerald-800/80',
      };
    case 'neutral':
      return {
        label: lang === 'ar' ? 'محايد' : 'Neutral',
        emoji: '😐',
        pillClass: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/80',
      };
    case 'dissatisfied':
      return {
        label: lang === 'ar' ? 'غير راضٍ' : 'Dissatisfied',
        emoji: '🙁',
        pillClass: 'bg-orange-100 dark:bg-orange-950/70 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800/80',
      };
    case 'very_dissatisfied':
      return {
        label: lang === 'ar' ? 'غير راضٍ جداً' : 'Very Dissatisfied',
        emoji: '😞',
        pillClass: 'bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800/80',
      };
    default:
      return {
        label: lang === 'ar' ? 'تم التقييم' : 'Evaluated',
        emoji: '⭐',
        pillClass: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700',
      };
  }
};

const getPackageBadgeMeta = (pkg?: ServicePackage | string) => {
  if (pkg === '500$') {
    return {
      label: '500$',
      className: 'bg-purple-50 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800/60',
      iconClass: 'text-purple-600',
    };
  }
  if (pkg === '300$') {
    return {
      label: '300$',
      className: 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
      iconClass: 'text-emerald-600',
    };
  }
  if (pkg === '300$(Free)') {
    return {
      label: '300$(Free)',
      className: 'bg-teal-50 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800/60',
      iconClass: 'text-teal-600',
    };
  }
  return {
    label: pkg || 'Free',
    className: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    iconClass: 'text-slate-500',
  };
};

const getSubtaskScoreMeta = (score: number | string, lang: Language = 'en') => {
  if (typeof score === 'number') {
    const pillClass =
      score >= 4
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : score === 3
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-red-50 text-red-800 border-red-200';
    return {
      isNumeric: true,
      numericScore: score,
      label: `${score} / 5 ★`,
      pillClass,
    };
  }

  const normalized = String(score).trim().toLowerCase();
  if (normalized === 'good' || normalized === 'yes' || normalized === 'excellent') {
    const label =
      normalized === 'yes'
        ? (lang === 'ar' ? 'نعم، بالكامل 👍' : 'Yes, Completely 👍')
        : (lang === 'ar' ? 'ممتاز 👍' : 'Good 👍');
    return {
      isNumeric: false,
      label,
      pillClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  if (normalized === 'acceptable' || normalized === 'partially' || normalized === 'fair') {
    const label =
      normalized === 'partially'
        ? (lang === 'ar' ? 'إلى حد ما 😐' : 'Somewhat / Partially 😐')
        : (lang === 'ar' ? 'مقبول 😐' : 'Acceptable 😐');
    return {
      isNumeric: false,
      label,
      pillClass: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  if (normalized === 'poor' || normalized === 'no') {
    const label =
      normalized === 'no'
        ? (lang === 'ar' ? 'لا 👎' : 'No 👎')
        : (lang === 'ar' ? 'ضعيف 👎' : 'Poor 👎');
    return {
      isNumeric: false,
      label,
      pillClass: 'bg-red-50 text-red-800 border-red-200',
    };
  }

  return {
    isNumeric: false,
    label: String(score),
    pillClass: 'bg-slate-100 text-slate-800 border-slate-200',
  };
};

export default function Feedbacks({ onSelectStudent }: FeedbacksProps) {
  const { currentUser, feedbackEntries, presets, users, tasks, language, t } = useAppContext();
  const isRTL = language === 'ar';

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [satisfactionFilter, setSatisfactionFilter] = useState<string>('all');
  const [presetFilter, setPresetFilter] = useState<string>('all');
  const [officerFilter, setOfficerFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'on_time'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TaskCategory>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Detailed Subtask Breakdown Modal State
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  // Close modal on Escape key
  useEffect(() => {
    if (!selectedEntryId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedEntryId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEntryId]);

  // Strict Access Control Gate (Admin, Coordinator, Counselor, Counselors Manager)
  if (
    currentUser?.role !== 'admin' &&
    currentUser?.role !== 'coordinator' &&
    currentUser?.role !== 'counselor' &&
    currentUser?.role !== 'counselor_manager'
  ) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4 border border-red-100 shadow-xs">
          <ShieldAlert size={36} />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">{t('accessDenied')}</h2>
        <p className="text-sm text-slate-500 max-w-md leading-relaxed">
          {isRTL
            ? 'هذه الصفحة مخصصة للمشرف العام (Admin) فقط ولا يُسمح للأدوار الأخرى بالوصول إليها.'
            : 'This dedicated Feedbacks management ledger is strictly restricted to administrators.'}
        </p>
      </div>
    );
  }

  const fieldOfficers = useMemo(
    () => users.filter(u => u.role === 'field_officer').sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  // Helper to resolve task title / preset label
  const getTaskTypeTitle = (entry: MappedFeedbackEntry) => {
    return getTaskDisplayTitle(
      entry.task || { presetId: entry.presetId, isNonStudentTask: false },
      presets,
      language
    );
  };

  // Helper to resolve granular subtask ratings breakdown for any feedback entry
  const getSubtaskBreakdown = (entry: MappedFeedbackEntry) => {
    const { feedback, preset, task } = entry;
    const definedQuestions = getServiceQuestions(preset, task);
    const breakdown: { id: string; title?: string; question: string; score: number | string }[] = [];

    if (feedback.subtaskRatings && Object.keys(feedback.subtaskRatings).length > 0) {
      Object.entries(feedback.subtaskRatings).forEach(([qId, item]) => {
        const matchedDef = definedQuestions.find(q => q.id === qId);
        const title = matchedDef
          ? (isRTL ? (matchedDef.titleAr || matchedDef.titleEn) : matchedDef.titleEn)
          : undefined;
        const question =
          isRTL && item.questionAr
            ? item.questionAr
            : item.questionEn || (matchedDef ? (isRTL ? matchedDef.questionAr : matchedDef.questionEn) : qId);
        breakdown.push({
          id: qId,
          title,
          question,
          score: item.score,
        });
      });
    } else if (feedback.answers && feedback.answers.length > 0) {
      feedback.answers.forEach(ans => {
        const matchedDef = definedQuestions.find(q => q.id === ans.questionId);
        const title = matchedDef
          ? (isRTL ? (matchedDef.titleAr || matchedDef.titleEn) : matchedDef.titleEn)
          : undefined;
        const question = isRTL && ans.questionAr ? ans.questionAr : ans.question;
        const score = typeof ans.answer === 'boolean' ? (ans.answer ? 'Yes' : 'No') : ans.answer;
        breakdown.push({
          id: ans.questionId,
          title,
          question,
          score,
        });
      });
    } else if (feedback.dynamicAnswers && Object.keys(feedback.dynamicAnswers).length > 0) {
      Object.entries(feedback.dynamicAnswers).forEach(([qId, val]) => {
        const matchedDef = definedQuestions.find(q => q.id === qId);
        const title = matchedDef
          ? (isRTL ? (matchedDef.titleAr || matchedDef.titleEn) : matchedDef.titleEn)
          : undefined;
        const question = matchedDef
          ? (isRTL ? matchedDef.questionAr : matchedDef.questionEn)
          : qId;
        breakdown.push({
          id: qId,
          title,
          question,
          score: typeof val === 'number' || typeof val === 'string' ? val : String(val),
        });
      });
    }

    return breakdown;
  };

  // Top KPI Summary Bar Aggregations
  const kpiStats = useMemo(() => {
    const total = feedbackEntries.length;
    const completedTasksCount = tasks.filter(tk => normalizeTaskStatus(tk) === 'completed').length;

    const avgRating =
      total > 0
        ? (feedbackEntries.reduce((sum, item) => sum + (Number(item.feedback.rating) || 0), 0) / total).toFixed(1)
        : '0.0';

    const positiveCount = feedbackEntries.filter(
      item =>
        item.feedback.satisfaction === 'very_satisfied' ||
        item.feedback.satisfaction === 'satisfied'
    ).length;

    const positiveSentimentRate = total > 0 ? Math.round((positiveCount / total) * 100) : 0;

    const lowRatingAlertsCount = feedbackEntries.filter(
      item => Number(item.feedback.rating) < 4
    ).length;

    return {
      total,
      completedTasksCount,
      avgRating,
      positiveCount,
      positiveSentimentRate,
      lowRatingAlertsCount,
    };
  }, [feedbackEntries, tasks]);

    const activeFilterCount = useMemo(() => {
    let count = 0;
    if (ratingFilter !== 'all') count++;
    if (satisfactionFilter !== 'all') count++;
    if (presetFilter !== 'all') count++;
    if (officerFilter !== 'all') count++;
    if (outcomeFilter !== 'all') count++;
    if (categoryFilter !== 'all') count++;
    if (fromDate) count++;
    if (toDate) count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [ratingFilter, satisfactionFilter, presetFilter, officerFilter, outcomeFilter, categoryFilter, fromDate, toDate, searchQuery]);

  const resetFilters = () => {
    setRatingFilter('all');
    setSatisfactionFilter('all');
    setPresetFilter('all');
    setOfficerFilter('all');
    setOutcomeFilter('all');
    setCategoryFilter('all');
    setFromDate('');
    setToDate('');
    setSearchQuery('');
  };

  // Filtered Feedback Entries
  const filteredFeedbacks = useMemo(() => {
    return feedbackEntries.filter(entry => {
      const rating = Number(entry.feedback.rating) || 0;
      const taskLike = entry.task || { presetId: entry.presetId, isNonStudentTask: false };

      // 1. Star Rating Filter
      if (ratingFilter !== 'all') {
        if (ratingFilter === 'low_alert') {
          if (rating >= 4) return false;
        } else {
          if (rating !== Number(ratingFilter)) return false;
        }
      }

      // 2. Satisfaction Level Filter
      if (satisfactionFilter !== 'all') {
        if (entry.feedback.satisfaction !== satisfactionFilter) return false;
      }

      // 3. Task Preset / Service Type Filter
      if (presetFilter !== 'all') {
        if (!matchesTaskTypeFilter(taskLike, presetFilter)) return false;
      }

      // 4. Assigned Field Officer Filter
      if (officerFilter !== 'all') {
        if (entry.assigneeId !== officerFilter) return false;
      }

      // 5. Execution Outcome Filter
      if (outcomeFilter !== 'all') {
        if (outcomeFilter === 'on_time' && (!entry.task || normalizeTaskStatus(entry.task) !== 'completed')) return false;
      }

      // 6. Task Category Filter (student_preset / student_custom / non_student)
      if (categoryFilter !== 'all') {
        if (getTaskCategory(taskLike) !== categoryFilter) return false;
      }

      // 7. Date Range Filter
      const fbDate = (entry.feedback.submittedAt || entry.task?.completedAt || entry.task?.createdAt || '').slice(0, 10);
      if ((fromDate || toDate) && !fbDate) return false;
      if (fromDate && fbDate < fromDate) return false;
      if (toDate && fbDate > toDate) return false;

      // 8. Student / Beneficiary Name, Email, Task, or Officer Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const subjectName = entry.task
          ? getTaskSubjectName(entry.task, entry.student ? [entry.student] : [], language).toLowerCase()
          : (entry.student?.fullName || '').toLowerCase();
        const studentEmail = (entry.studentEmail || entry.student?.email || entry.feedback.studentEmail || '').toLowerCase();
        const passport = (entry.student?.passportNumber || '').toLowerCase();
        const comments = (entry.feedback.comments || '').toLowerCase();
        const taskTitle = getTaskTypeTitle(entry).toLowerCase();
        const nonStudentTitle = (entry.task?.nonStudentTitle || '').toLowerCase();
        const nonStudentContact = (entry.task?.nonStudentContact || '').toLowerCase();
        const officerName = (entry.officer?.name || '').toLowerCase();

        return (
          subjectName.includes(q) ||
          studentEmail.includes(q) ||
          passport.includes(q) ||
          comments.includes(q) ||
          taskTitle.includes(q) ||
          nonStudentTitle.includes(q) ||
          nonStudentContact.includes(q) ||
          officerName.includes(q)
        );
      }

      return true;
    });
  }, [feedbackEntries, ratingFilter, satisfactionFilter, presetFilter, officerFilter, outcomeFilter, categoryFilter, fromDate, toDate, searchQuery, presets, language]);

  const hasActiveFilters = activeFilterCount > 0;

  const selectedModalEntry = useMemo(() => {
    if (!selectedEntryId) return null;
    return feedbackEntries.find(e => e.id === selectedEntryId) || null;
  }, [selectedEntryId, feedbackEntries]);

  return (
    <div className="space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-md shadow-red-600/20 shrink-0">
            <MessageSquareQuote size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                {isRTL ? 'إدارة تقييمات الطلاب (CSAT)' : 'Student Feedbacks & CSAT Ledger'}
              </h2>
              <span className="px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider bg-slate-900 text-white rounded-full">
                {isRTL ? 'الإدارة والمستشارون' : 'Management & Counselors'}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {isRTL
                ? 'مراقبة حية لتقييمات الخدمات اللوجستية، مؤشرات الرضا، وتفاصيل تقييم المهام الفرعية'
                : 'Real-time audit of student service evaluations, sentiment scores, and granular subtask ratings'}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{isRTL ? 'مزامنة فورية عبر Firestore' : 'Live Firestore onSnapshot'}</span>
        </div>
      </div>

      {/* 1. Top KPI Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Feedbacks Received */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              {isRTL ? 'إجمالي التقييمات المستلمة' : 'Total Feedbacks Received'}
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <MessageSquareQuote size={20} />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">{kpiStats.total}</div>
            <p className="text-xs text-slate-500 mt-1.5 font-medium">
              {isRTL
                ? `من أصل ${kpiStats.completedTasksCount} مهمة مكتملة`
                : `Across ${kpiStats.completedTasksCount} completed logistics tasks`}
            </p>
          </div>
        </div>

        {/* Card 2: Average Overall Star Rating */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              {isRTL ? 'متوسط التقييم العام' : 'Average Overall Rating'}
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center border border-amber-100">
              <Star size={20} className="fill-amber-400 text-amber-400" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">★ {kpiStats.avgRating}</span>
              <span className="text-xs font-bold text-slate-400">/ 5.0</span>
            </div>
            <div className="flex items-center gap-1 mt-2">
              {[1, 2, 3, 4, 5].map(star => (
                <Star
                  key={star}
                  size={14}
                  className={cn(
                    star <= Math.round(Number(kpiStats.avgRating))
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-slate-200 fill-slate-100'
                  )}
                />
              ))}
              <span className="text-[11px] text-slate-500 font-medium ml-1">
                {isRTL ? 'مقياس 1 إلى 5 نجوم' : '1–5 Star CSAT Scale'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Positive Sentiment Rate */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              {isRTL ? 'نسبة الرضا الإيجابي' : 'Positive Sentiment Rate'}
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <ThumbsUp size={20} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-3xl font-black text-emerald-600">{kpiStats.positiveSentimentRate}%</span>
              <span className="text-xs font-bold text-slate-500">
                {kpiStats.positiveCount} / {kpiStats.total}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
              <div
                style={{ width: `${kpiStats.positiveSentimentRate}%` }}
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 font-medium">
              {isRTL ? 'راضٍ جداً + راضٍ' : '% of Very Satisfied & Satisfied'}
            </p>
          </div>
        </div>

        {/* Card 4: Low-Rating Alerts (< 4 stars) */}
        <div
          onClick={() => setRatingFilter(ratingFilter === 'low_alert' ? 'all' : 'low_alert')}
          className={cn(
            'p-5 rounded-2xl border shadow-xs flex flex-col justify-between cursor-pointer transition-all',
            ratingFilter === 'low_alert'
              ? 'bg-red-600 text-white border-red-700 ring-4 ring-red-600/20'
              : kpiStats.lowRatingAlertsCount > 0
              ? 'bg-red-50/60 border-red-200 hover:border-red-300'
              : 'bg-white border-slate-200 hover:border-slate-300'
          )}
          title={isRTL ? 'انقر لتصفية التقييمات المنخفضة (< 4 نجوم)' : 'Click to filter low-rating alerts (< 4 stars)'}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className={cn(
                'text-xs font-extrabold uppercase tracking-wider',
                ratingFilter === 'low_alert'
                  ? 'text-red-100'
                  : kpiStats.lowRatingAlertsCount > 0
                  ? 'text-red-700'
                  : 'text-slate-500'
              )}
            >
              {isRTL ? 'تنبيهات التقييم المنخفض (< 4★)' : 'Low-Rating Alerts (< 4★)'}
            </span>
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center border',
                ratingFilter === 'low_alert'
                  ? 'bg-white/15 text-white border-white/20'
                  : kpiStats.lowRatingAlertsCount > 0
                  ? 'bg-red-100 text-red-600 border-red-200'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
              )}
            >
              <AlertTriangle size={20} />
            </div>
          </div>
          <div>
            <div
              className={cn(
                'text-3xl font-black',
                ratingFilter === 'low_alert'
                  ? 'text-white'
                  : kpiStats.lowRatingAlertsCount > 0
                  ? 'text-red-600'
                  : 'text-slate-900'
              )}
            >
              {kpiStats.lowRatingAlertsCount}
            </div>
            <p
              className={cn(
                'text-xs mt-1.5 font-medium',
                ratingFilter === 'low_alert'
                  ? 'text-red-100'
                  : kpiStats.lowRatingAlertsCount > 0
                  ? 'text-red-700'
                  : 'text-slate-500'
              )}
            >
              {ratingFilter === 'low_alert'
                ? (isRTL ? 'تصفية نشطة — انقر للإلغاء' : 'Filter active — click to show all')
                : (isRTL ? 'التقييمات الأقل من 4 نجوم (1★–3★)' : 'Evaluations rated below 4★ (1★–3★)')}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Filtering & Search Controls Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter size={17} className="text-red-600" />
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              {isRTL ? 'تصفية وبحث التقييمات' : 'Filter & Search Feedbacks'}
            </h3>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {filteredFeedbacks.length} {isRTL ? 'نتيجة' : 'results'}
            </span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 shadow-2xs">
                <Filter size={12} />
                <span>{activeFilterCount} Active {activeFilterCount === 1 ? 'Filter' : 'Filters'}</span>
              </span>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>{isRTL ? 'إعادة ضبط الفلاتر' : 'Reset Filters'}</span>
              </button>
            )}

            {/* View Switcher: Cards vs Table */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/70">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer',
                  viewMode === 'cards' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                )}
              >
                <LayoutGrid size={14} />
                <span>{isRTL ? 'بطاقات' : 'Cards'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer',
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                )}
              >
                <TableIcon size={14} />
                <span>{isRTL ? 'جدول' : 'Table'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* Search by Student / Beneficiary, Task, or Email */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isRTL ? 'بحث بالطالب، المستفيد، المهمة، أو البريد...' : 'Search student, beneficiary, task, or email...'}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all"
            />
          </div>

          {/* Filter by Star Rating */}
          <div>
            <select
              value={ratingFilter}
              onChange={e => setRatingFilter(e.target.value)}
              aria-label="Filter by Star Rating"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">{isRTL ? 'جميع التقييمات (★ 1–5)' : 'All Star Ratings (★ 1–5)'}</option>
              <option value="5">★★★★★ (5★ Excellent)</option>
              <option value="4">★★★★☆ (4★ Very Good)</option>
              <option value="3">★★★☆☆ (3★ Good)</option>
              <option value="2">★★☆☆☆ (2★ Fair)</option>
              <option value="1">★☆☆☆☆ (1★ Poor)</option>
              <option value="low_alert">{isRTL ? '⚠️ تنبيهات منخفضة (< 4★)' : '⚠️ Low-Rating Alerts (< 4★)'}</option>
            </select>
          </div>

          {/* Filter by Satisfaction Level */}
          <div>
            <select
              value={satisfactionFilter}
              onChange={e => setSatisfactionFilter(e.target.value)}
              aria-label="Filter by Satisfaction Level"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">{isRTL ? 'جميع مستويات الرضا' : 'All Satisfaction Levels'}</option>
              <option value="very_satisfied">😍 {isRTL ? 'راضٍ جداً' : 'Very Satisfied'}</option>
              <option value="satisfied">😊 {isRTL ? 'راضٍ' : 'Satisfied'}</option>
              <option value="neutral">😐 {isRTL ? 'محايد' : 'Neutral'}</option>
              <option value="dissatisfied">🙁 {isRTL ? 'غير راضٍ' : 'Dissatisfied'}</option>
              <option value="very_dissatisfied">😞 {isRTL ? 'غير راضٍ جداً' : 'Very Dissatisfied'}</option>
            </select>
          </div>

          {/* Filter by Task Category */}
          <div>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value as 'all' | TaskCategory)}
              aria-label="Filter by Task Category"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">{isRTL ? 'جميع تصنيفات المهام' : 'All Task Categories'}</option>
              <option value="student_preset">{isRTL ? 'مهمة طلابية قياسية (SOP)' : 'Student SOP Tasks'}</option>
              <option value="student_custom">{isRTL ? 'مهمة طلابية مخصصة' : 'Custom Student Tasks'}</option>
              <option value="non_student">{isRTL ? 'مهمة غير طلابية' : 'Non-Student Tasks'}</option>
            </select>
          </div>

          {/* Filter by Task Preset / Service Type */}
          <div>
            <select
              value={presetFilter}
              onChange={e => setPresetFilter(e.target.value)}
              aria-label="Filter by Task Preset"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">{isRTL ? 'جميع أنواع الخدمات / القوالب' : 'All Task Presets / Services'}</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>
                  {isRTL ? p.nameAr || p.nameEn : p.nameEn}
                </option>
              ))}
              <option value="custom">{isRTL ? 'مهمة مخصصة (أخرى)' : 'Custom Task (Other)'}</option>
              <option value="non_student">{isRTL ? 'مهمة غير طلابية' : 'Non-Student Task'}</option>
            </select>
          </div>

          {/* Filter by Assigned Field Officer */}
          <div>
            <select
              value={officerFilter}
              onChange={e => setOfficerFilter(e.target.value)}
              aria-label="Filter by Assigned Field Officer"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="all">{isRTL ? 'جميع الموظفين الميدانيين' : 'All Assigned Field Officers'}</option>
              {fieldOfficers.map(officer => (
                <option key={officer.id} value={officer.id}>
                  {officer.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter From Date */}
          <div>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              aria-label="Filter from submission date"
              title={isRTL ? 'من تاريخ' : 'From Date'}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            />
          </div>

          {/* Filter To Date */}
          <div>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              aria-label="Filter to submission date"
              title={isRTL ? 'إلى تاريخ' : 'To Date'}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            />
          </div>
        </div>
      </div>

      {/* 3. Feedback Ledger (Chronological Cards Feed or Structured Table) */}
      {filteredFeedbacks.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4 border border-slate-200">
            <MessageSquareQuote size={30} />
          </div>
          <h3 className="text-lg font-bold text-slate-800">
            {hasActiveFilters
              ? (isRTL ? 'لا توجد تقييمات مطابقة للفلاتر المحددة' : 'No feedbacks match your active filters')
              : (isRTL ? 'لم يتم استلام أي تقييمات بعد' : 'No student feedbacks submitted yet')}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5 leading-relaxed">
            {hasActiveFilters
              ? (isRTL
                  ? 'جرب تعديل خيارات التصفية أو مسح نص البحث لعرض جميع التقييمات المسجلة.'
                  : 'Try adjusting your filter dropdowns or clearing the search query to view all submitted evaluations.')
              : (isRTL
                  ? 'ستظهر تقييمات الطلاب هنا تلقائياً في الوقت الفعلي بمجرد إرسالهم لنموذج التقييم بعد إتمام المهام.'
                  : 'Student CSAT evaluations will appear here automatically in real time as students submit their post-service feedback forms.')}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              <RotateCcw size={14} />
              <span>{isRTL ? 'إعادة ضبط الفلاتر' : 'Clear All Filters'}</span>
            </button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        /* Chronological Cards Feed */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredFeedbacks.map(entry => {
            const { feedback, task, student, officer, studentEmail } = entry;
            const satMeta = getSatisfactionMeta(feedback.satisfaction, language);
            const taskLike = task || { presetId: entry.presetId, isNonStudentTask: false };
            const taskCategory = getTaskCategory(taskLike);
            const isNonStudent = taskCategory === 'non_student';
            const pkg = !isNonStudent ? (student?.package || student?.servicePackage || 'Free') : null;
            const pkgMeta = pkg ? getPackageBadgeMeta(pkg) : null;
            const subjectName = task
              ? getTaskSubjectName(task, student ? [student] : [], language)
              : (student?.fullName || (isRTL ? 'طالب' : 'Student'));
            const taskTypeTitle = getTaskTypeTitle(entry);
            const subtaskList = getSubtaskBreakdown(entry);
            const isLowRating = Number(feedback.rating) < 4;

            return (
              <div
                key={entry.id}
                onClick={() => setSelectedEntryId(entry.id)}
                className={cn(
                  'group bg-white dark:bg-slate-900 rounded-3xl border p-5 sm:p-6 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-4',
                  isLowRating
                    ? 'border-red-200 dark:border-red-900/60 hover:border-red-400 dark:hover:border-red-800 bg-gradient-to-br from-white via-white to-red-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-red-950/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-red-300 dark:hover:border-slate-700'
                )}
              >
                <div className="space-y-4">
                  {/* Top Row: Student / Beneficiary Info + Category & Package Badges + Star Rating */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={cn(
                        'w-11 h-11 rounded-2xl text-white flex items-center justify-center font-black text-base shrink-0 shadow-xs',
                        isNonStudent ? 'bg-purple-900' : 'bg-blue-950'
                      )}>
                        {(subjectName || studentEmail || 'S').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black text-slate-900 dark:text-white text-base group-hover:text-red-600 transition-colors truncate">
                            {subjectName}
                          </h4>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border uppercase tracking-wider',
                              taskCategory === 'non_student'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : taskCategory === 'student_custom'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            )}
                          >
                            {taskCategory === 'non_student'
                              ? (isRTL ? 'غير طلابية' : 'Non-Student')
                              : taskCategory === 'student_custom'
                              ? (isRTL ? 'طلابية مخصصة' : 'Student Custom')
                              : (isRTL ? 'خدمة قياسية' : 'Student SOP')}
                          </span>
                          {pkgMeta && (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border',
                                pkgMeta.className
                              )}
                            >
                              <Sparkles size={11} className={pkgMeta.iconClass} />
                              <span>{pkgMeta.label}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          <Mail size={12} className="text-slate-400 shrink-0" />
                          <span className="truncate">
                            {isNonStudent
                              ? (task?.nonStudentContact || studentEmail || 'N/A')
                              : (student?.email || studentEmail || 'N/A')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Visual Star Rating + Satisfaction Badge */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="flex items-center gap-1.5 bg-amber-50/90 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/60 px-2.5 py-1 rounded-xl">
                        <div className="flex items-center gap-0.5 text-amber-400">
                          {[1, 2, 3, 4, 5].map(star => (
                            <Star
                              key={star}
                              size={14}
                              className={cn(
                                star <= feedback.rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-200 fill-slate-100'
                              )}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-black text-slate-900 dark:text-amber-200">
                          {feedback.rating}/5
                        </span>
                      </div>

                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border',
                          satMeta.pillClass
                        )}
                      >
                        <span>{satMeta.emoji}</span>
                        <span>{satMeta.label}</span>
                      </span>
                    </div>
                  </div>

                  {/* Middle Row: Evaluated Task Type + Assigned Field Officer + Timestamp */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200/80 dark:border-red-800/60 font-extrabold">
                        <Layers size={13} className="text-red-600 shrink-0" />
                        <span>{taskTypeTitle}</span>
                      </span>

                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 font-semibold">
                        <User size={12} className="text-slate-500 shrink-0" />
                        <span>{officer?.name || (isRTL ? 'غير معين' : 'Unassigned Officer')}</span>
                      </span>
                    </div>

                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                      <Clock size={12} />
                      <span>{formatDateTimeUTC8(feedback.submittedAt, language)}</span>
                    </span>
                  </div>

                  {/* Open-Ended Remarks / Comments Preview */}
                  <div className="bg-slate-50/90 dark:bg-slate-950/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <MessageSquare size={11} />
                        <span>{isRTL ? 'ملاحظات وتعليقات التقييم' : 'Feedback Remarks Preview'}</span>
                      </span>
                      {subtaskList.length > 0 && (
                        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800">
                          {subtaskList.length} {isRTL ? 'تقييمات فرعية' : 'Subtask Ratings'}
                        </span>
                      )}
                    </div>
                    {feedback.comments ? (
                      <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 italic line-clamp-2 leading-relaxed">
                        &ldquo;{feedback.comments}&rdquo;
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                        {isRTL ? 'لا توجد ملاحظات مكتوبة إضافية.' : 'No open-ended written remarks provided.'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Card Footer */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  {!isNonStudent && entry.studentId && onSelectStudent ? (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onSelectStudent(entry.studentId!);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <span>{isRTL ? 'ملف الطالب' : 'Student Dossier'}</span>
                      <ArrowUpRight size={14} />
                    </button>
                  ) : (
                    <span />
                  )}

                  <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-red-600 group-hover:translate-x-0.5 transition-transform">
                    <Eye size={14} />
                    <span>{isRTL ? 'عرض تفاصيل التقييم الفرعي' : 'Inspect Subtask Breakdown'}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Structured Table View */
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">{isRTL ? 'الطالب / المستفيد والباقة' : 'Student / Beneficiary'}</th>
                  <th className="py-3.5 px-4">{isRTL ? 'نوع الخدمة والموظف' : 'Task Type & Officer'}</th>
                  <th className="py-3.5 px-4">{isRTL ? 'التقييم والرضا' : 'Rating & Sentiment'}</th>
                  <th className="py-3.5 px-4">{isRTL ? 'تعليقات التقييم' : 'Remarks Preview'}</th>
                  <th className="py-3.5 px-4">{isRTL ? 'تاريخ التقديم' : 'Submitted At'}</th>
                  <th className="py-3.5 px-4 text-right">{isRTL ? 'إجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredFeedbacks.map(entry => {
                  const { feedback, task, student, officer, studentEmail } = entry;
                  const satMeta = getSatisfactionMeta(feedback.satisfaction, language);
                  const taskLike = task || { presetId: entry.presetId, isNonStudentTask: false };
                  const taskCategory = getTaskCategory(taskLike);
                  const isNonStudent = taskCategory === 'non_student';
                  const pkg = !isNonStudent ? (student?.package || student?.servicePackage || 'Free') : null;
                  const pkgMeta = pkg ? getPackageBadgeMeta(pkg) : null;
                  const subjectName = task
                    ? getTaskSubjectName(task, student ? [student] : [], language)
                    : (student?.fullName || (isRTL ? 'طالب' : 'Student'));
                  const taskTypeTitle = getTaskTypeTitle(entry);

                  return (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedEntryId(entry.id)}
                      className="hover:bg-slate-50/90 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900">
                                {subjectName}
                              </span>
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-full text-[9px] font-extrabold border uppercase tracking-wider',
                                  taskCategory === 'non_student'
                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                    : taskCategory === 'student_custom'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                )}
                              >
                                {taskCategory === 'non_student'
                                  ? (isRTL ? 'غير طلابية' : 'Non-Student')
                                  : taskCategory === 'student_custom'
                                  ? (isRTL ? 'طلابية مخصصة' : 'Student Custom')
                                  : (isRTL ? 'خدمة قياسية' : 'Student SOP')}
                              </span>
                              {pkgMeta && (
                                <span
                                  className={cn(
                                    'px-2 py-0.5 rounded-full text-[10px] font-extrabold border',
                                    pkgMeta.className
                                  )}
                                >
                                  {pkgMeta.label}
                                </span>
                              )}
                            </div>
                            <div className="text-slate-500 text-[11px] mt-0.5">
                              {isNonStudent
                                ? (task?.nonStudentContact || studentEmail || 'N/A')
                                : (student?.email || studentEmail || 'N/A')}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{taskTypeTitle}</div>
                        <div className="text-slate-500 text-[11px] mt-0.5 flex items-center gap-1">
                          <User size={11} className="text-slate-400" />
                          <span>{officer?.name || (isRTL ? 'غير معين' : 'Unassigned')}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1 text-amber-400 mb-1">
                          {[1, 2, 3, 4, 5].map(star => (
                            <Star
                              key={star}
                              size={13}
                              className={cn(
                                star <= feedback.rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-200 fill-slate-100'
                              )}
                            />
                          ))}
                          <span className="text-slate-900 font-black ml-1">{feedback.rating}/5</span>
                        </div>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                            satMeta.pillClass
                          )}
                        >
                          <span>{satMeta.emoji}</span>
                          <span>{satMeta.label}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 min-w-[220px]">
                        {feedback.comments ? (
                          <p className="text-slate-700 italic line-clamp-2">&ldquo;{feedback.comments}&rdquo;</p>
                        ) : (
                          <span className="text-slate-400 italic">
                            {isRTL ? 'لا يوجد تعليق' : 'No comment'}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 font-medium whitespace-nowrap">
                        {formatDateTimeUTC8(feedback.submittedAt, language)}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedEntryId(entry.id);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-red-600 text-white text-[11px] font-bold rounded-xl transition-colors cursor-pointer"
                        >
                          <Eye size={12} />
                          <span>{isRTL ? 'التفاصيل' : 'Inspect'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Detailed Subtask Breakdown Modal / Drawer */}
      {selectedModalEntry && (() => {
        const { feedback, task, student, officer, studentId, studentEmail, assigneeId } = selectedModalEntry;
        const satMeta = getSatisfactionMeta(feedback.satisfaction, language);
        const taskLike = task || { presetId: selectedModalEntry.presetId, isNonStudentTask: false };
        const taskCategory = getTaskCategory(taskLike);
        const isNonStudent = taskCategory === 'non_student';
        const pkg = !isNonStudent ? (student?.package || student?.servicePackage || 'Free') : null;
        const pkgMeta = pkg ? getPackageBadgeMeta(pkg) : null;
        const subjectName = task
          ? getTaskSubjectName(task, student ? [student] : [], language)
          : (student?.fullName || (isRTL ? 'تفاصيل تقييم الطالب' : 'Student Feedback Inspection'));
        const taskTypeTitle = getTaskTypeTitle(selectedModalEntry);
        const subtaskBreakdown = getSubtaskBreakdown(selectedModalEntry);
        const executionDuration = formatDuration(task?.startedAt || task?.createdAt, task?.completedAt, isRTL);

        return (
          <div
            className="fixed inset-0 bg-slate-900/65 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setSelectedEntryId(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-modal-title"
          >
            <div
              className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 relative"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Sticky Header */}
              <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 sm:p-7 sticky top-0 z-10 border-b border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600 text-white text-xs font-extrabold tracking-wide shadow-xs">
                        <Layers size={13} />
                        <span>{taskTypeTitle}</span>
                      </span>

                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold border uppercase tracking-wider',
                          taskCategory === 'non_student'
                            ? 'bg-purple-500/25 text-purple-200 border-purple-400/40'
                            : taskCategory === 'student_custom'
                            ? 'bg-amber-500/25 text-amber-200 border-amber-400/40'
                            : 'bg-indigo-500/25 text-indigo-200 border-indigo-400/40'
                        )}
                      >
                        {taskCategory === 'non_student'
                          ? (isRTL ? 'غير طلابية' : 'Non-Student')
                          : taskCategory === 'student_custom'
                          ? (isRTL ? 'طلابية مخصصة' : 'Student Custom')
                          : (isRTL ? 'خدمة قياسية' : 'Student SOP')}
                      </span>

                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border',
                          satMeta.pillClass
                        )}
                      >
                        <span>{satMeta.emoji}</span>
                        <span>{satMeta.label}</span>
                      </span>

                      {pkgMeta && (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold border',
                            pkgMeta.className
                          )}
                        >
                          <Sparkles size={12} className={pkgMeta.iconClass} />
                          <span>{pkgMeta.label} Package</span>
                        </span>
                      )}
                    </div>

                    <h3 id="feedback-modal-title" className="text-xl sm:text-2xl font-black tracking-tight text-white">
                      {subjectName}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                      {(student?.email || studentEmail || task?.nonStudentContact) && (
                        <span className="inline-flex items-center gap-1.5">
                          <Mail size={13} className="text-red-400" />
                          <span>{isNonStudent ? (task?.nonStudentContact || studentEmail) : (student?.email || studentEmail)}</span>
                        </span>
                      )}
                      {!isNonStudent && student?.university && (
                        <span className="inline-flex items-center gap-1.5">
                          <GraduationCap size={13} className="text-blue-400" />
                          <span>{student.university}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedEntryId(null)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors shrink-0 cursor-pointer"
                    aria-label="Close modal"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Overall CSAT Score Bar */}
                <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      {isRTL ? 'التقييم العام (CSAT):' : 'Overall CSAT Score:'}
                    </span>
                    <div className="flex items-center gap-1 text-amber-400">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          size={18}
                          className={cn(
                            star <= feedback.rating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-600 fill-slate-800'
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-black text-amber-400 ml-1">
                      ★ {feedback.rating} / 5
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
                    <Clock size={12} className="text-amber-400" />
                    <span>
                      {isRTL ? 'تاريخ التقديم:' : 'Submitted:'} {formatDateTimeUTC8(feedback.submittedAt, language)}
                    </span>
                  </span>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6 bg-white">
                {/* Section 1: Unabridged Student Comments */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                      <MessageSquare size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900">
                        {isRTL ? 'الملاحظات والتعليقات الكاملة للطالب' : 'Unabridged Student Comments & Remarks'}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {isRTL
                          ? 'النص الكامل لملاحظات الطالب المفتوحة حول الخدمة المقدمة.'
                          : 'Complete open-ended remarks submitted by the student for this service.'}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-50/40 border border-amber-200/80">
                    {feedback.comments ? (
                      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap italic">
                        &ldquo;{feedback.comments}&rdquo;
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                        {isRTL
                          ? 'لم يقم الطالب بإدخال أي تعليقات نصية إضافية.'
                          : 'No written comments or open-ended remarks were submitted by the student.'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Section 2: Granular Subtask Ratings Breakdown */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-red-50 text-red-600 border border-red-100">
                        <Layers size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900">
                          {isRTL ? 'تفاصيل تقييم المهام الفرعية (subtaskRatings)' : 'Granular Subtask Ratings Breakdown'}
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          {isRTL
                            ? `إجابات وتقييمات الطالب لكل معيار خاص بـ ${taskTypeTitle}`
                            : `Preset-specific milestone questions and individual scores for ${taskTypeTitle}`}
                        </p>
                      </div>
                    </div>
                    {subtaskBreakdown.length > 0 && (
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                        {subtaskBreakdown.length} {isRTL ? 'أسئلة' : 'Questions'}
                      </span>
                    )}
                  </div>

                  {subtaskBreakdown.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-500 text-center">
                      {isRTL
                        ? 'لم يتم تسجيل تقييمات فرعية إضافية لهذا التقييم.'
                        : 'No granular subtask ratings were recorded for this evaluation.'}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {subtaskBreakdown.map((item, idx) => {
                        const scoreMeta = getSubtaskScoreMeta(item.score, language);
                        return (
                          <div
                            key={item.id || idx}
                            className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <span className="w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-700 text-xs font-black flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                                {idx + 1}
                              </span>
                              <div className="space-y-0.5">
                                {item.title && (
                                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-600 block">
                                    {item.title}
                                  </span>
                                )}
                                <p className="text-xs sm:text-sm font-semibold text-slate-800 leading-snug">
                                  {item.question}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                              {scoreMeta.isNumeric && scoreMeta.numericScore !== undefined && (
                                <div className="flex items-center gap-0.5 text-amber-400">
                                  {[1, 2, 3, 4, 5].map(s => (
                                    <Star
                                      key={s}
                                      size={13}
                                      className={cn(
                                        s <= scoreMeta.numericScore!
                                          ? 'fill-amber-400 text-amber-400'
                                          : 'text-slate-200 fill-slate-100'
                                      )}
                                    />
                                  ))}
                                </div>
                              )}
                              <span
                                className={cn(
                                  'px-3 py-1 rounded-xl text-xs font-extrabold border shadow-2xs',
                                  scoreMeta.pillClass
                                )}
                              >
                                {scoreMeta.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Section 3: Task Execution Metadata & Quick Action Link to Student Dossier */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                      <CheckCircle2 size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900">
                        {isRTL ? 'بيانات تنفيذ المهمة والملف الشخصي' : 'Task Execution Metadata & Student Dossier'}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {isRTL
                          ? 'تفاصيل التوقيت، الموظف المسؤول، والانتقال السريع إلى ملف الطالب.'
                          : 'Operational timestamps, assigned field officer, and quick navigation to the student profile.'}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-4">
                    {/* Timestamps Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                          {isRTL ? 'وقت البدء (startedAt)' : 'Started At'}
                        </span>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Calendar size={13} className="text-blue-500 shrink-0" />
                          <span>{formatDateTimeUTC8(task?.startedAt || task?.createdAt, language)}</span>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                          {isRTL ? 'وقت الإنجاز (completedAt)' : 'Completed At'}
                        </span>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                          <span>{formatDateTimeUTC8(task?.completedAt || feedback.submittedAt, language)}</span>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                          {isRTL ? 'مدة التنفيذ' : 'Execution Duration'}
                        </span>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Timer size={13} className="text-red-500 shrink-0" />
                          <span>{executionDuration}</span>
                        </div>
                      </div>
                    </div>

                    {/* Officer & Quick Dossier Action */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-200/80">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                          {officer?.name ? officer.name.charAt(0).toUpperCase() : <User size={16} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {officer?.name || (isRTL ? 'موظف ميداني غير معين' : 'Unassigned Field Officer')}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                              {t('field_officer')}
                            </span>
                          </div>
                          {assigneeId && (
                            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                              Officer ID: {assigneeId}
                            </p>
                          )}
                        </div>
                      </div>

                      {studentId && onSelectStudent && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEntryId(null);
                            onSelectStudent(studentId);
                          }}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer shrink-0 active:scale-95"
                        >
                          <ExternalLink size={14} />
                          <span>{isRTL ? 'فتح ملف الطالب الكامل' : 'Open Student Dossier'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Sticky Footer */}
              <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3 sticky bottom-0 z-10">
                <span className="text-[11px] text-slate-400 font-medium">
                  Task ID: <code className="font-mono text-slate-600">{feedback.taskId}</code>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedEntryId(null)}
                  className="px-5 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-transparent dark:border-slate-700 transition-colors cursor-pointer"
                >
                  {isRTL ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
