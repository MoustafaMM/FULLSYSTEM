import { format } from 'date-fns';
import { Language, QCErrorTagId, QCGrade, QCTaskReview, Task } from '../types';
import { normalizeTaskStatus } from './taskClassification';

export interface QCGradeMeta {
  id: QCGrade;
  labelEn: string;
  labelAr: string;
  descEn: string;
  descAr: string;
  weight: number;
  badgeClasses: string;
  cardActiveClasses: string;
  dotClass: string;
}

export const QC_GRADES: Record<QCGrade, QCGradeMeta> = {
  green: {
    id: 'green',
    labelEn: 'Green (Clean)',
    labelAr: 'أخضر (بدون أخطاء)',
    descEn: 'No mistakes — task executed properly',
    descAr: 'لا يوجد أي خطأ — تم التنفيذ بشكل ممتاز',
    weight: 100,
    badgeClasses:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70',
    cardActiveClasses:
      'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950 dark:bg-emerald-950/50 dark:border-emerald-500 dark:text-emerald-100',
    dotClass: 'bg-emerald-500',
  },
  yellow: {
    id: 'yellow',
    labelEn: 'Yellow (Minor Issue)',
    labelAr: 'أصفر (خطأ بسيط)',
    descEn: 'Minor mistake or non-critical issue',
    descAr: 'خطأ بسيط أو ملاحظة غير جسيمة',
    weight: 60,
    badgeClasses:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70',
    cardActiveClasses:
      'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 text-amber-950 dark:bg-amber-950/50 dark:border-amber-500 dark:text-amber-100',
    dotClass: 'bg-amber-500',
  },
  red: {
    id: 'red',
    labelEn: 'Red (Critical Issue)',
    labelAr: 'أحمر (مشكلة كبيرة)',
    descEn: 'Severe error or major operational problem',
    descAr: 'مشكلة كبيرة أو خطأ جسيم أثر على الخدمة',
    weight: 0,
    badgeClasses:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/70',
    cardActiveClasses:
      'bg-red-50 border-red-500 ring-2 ring-red-500/20 text-red-950 dark:bg-red-950/50 dark:border-red-500 dark:text-red-100',
    dotClass: 'bg-red-600',
  },
};

export interface QCErrorTagMeta {
  id: QCErrorTagId;
  labelEn: string;
  labelAr: string;
  descEn: string;
  descAr: string;
}

export const QC_ERROR_TAGS: QCErrorTagMeta[] = [
  {
    id: 'late_start',
    labelEn: 'Late Start',
    labelAr: 'تأخير في بداية المهمة',
    descEn: 'Officer started the task later than scheduled time',
    descAr: 'بدأ الموظف المهمة متأخراً عن الموعد المحدد',
  },
  {
    id: 'excessive_duration',
    labelEn: 'Took Too Long',
    labelAr: 'استغرق وقتاً أطول من اللازم',
    descEn: 'Task duration exceeded normal expected time',
    descAr: 'استغرقت المهمة وقتاً أطول من الوقت الطبيعي',
  },
  {
    id: 'execution_delay',
    labelEn: 'Execution Delay',
    labelAr: 'تأخير في التنفيذ نفسه',
    descEn: 'Delays occurred while executing the task steps',
    descAr: 'حدوث تأخير أثناء خطوات تنفيذ المهمة نفسها',
  },
  {
    id: 'invalid_photos',
    labelEn: 'Improper Photos',
    labelAr: 'الصور المرفقة غير مظبوطة',
    descEn: 'Uploaded proof photos are unclear, wrong, or incomplete',
    descAr: 'صور الإثبات المرفقة غير واضحة أو غير صحيحة أو ناقصة',
  },
  {
    id: 'late_student_contact',
    labelEn: 'Late Student Contact',
    labelAr: 'تأخير في التواصل مع الطالب',
    descEn: 'Contacted the student late or delayed reply in chat',
    descAr: 'تأخر الموظف في التواصل أو الرد على الطالب',
  },
  {
    id: 'poor_communication',
    labelEn: 'Poor Communication',
    labelAr: 'تواصل غير مناسب',
    descEn: 'Unprofessional or weak communication quality with student',
    descAr: 'أسلوب التواصل مع الطالب غير مناسب أو سيء',
  },
  {
    id: 'missing_info',
    labelEn: 'Missing Information',
    labelAr: 'معلومات ناقصة',
    descEn: 'Incomplete logistic report or missing required details',
    descAr: 'تقرير الموظف ناقص أو توجد بيانات مهمة غير مذكورة',
  },
  {
    id: 'other',
    labelEn: 'Other Issue',
    labelAr: 'مشكلة أخرى',
    descEn: 'Other quality issue specified in comments or custom tags',
    descAr: 'خطأ آخر موضح في التعليقات أو التاجات المخصصة',
  },
];

export function getQCErrorTagLabel(tagId: QCErrorTagId, lang: Language = 'en'): string {
  const found = QC_ERROR_TAGS.find((t) => t.id === tagId);
  if (!found) return tagId;
  return lang === 'ar' ? found.labelAr : found.labelEn;
}

export function getQCGradeLabel(grade: QCGrade, lang: Language = 'en'): string {
  const meta = QC_GRADES[grade];
  return lang === 'ar' ? meta.labelAr : meta.labelEn;
}

export function getEffectiveTaskDate(task: Task): string {
  if (task.taskDate) return task.taskDate;
  const iso = task.completedAt || task.startedAt || task.createdAt;
  if (!iso) return '';
  try {
    return format(new Date(iso), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

export function doesTaskBelongToDate(task: Task, dateStr: string): boolean {
  if (task.taskDate === dateStr) return true;
  if (!task.taskDate && task.createdAt) {
    try {
      if (format(new Date(task.createdAt), 'yyyy-MM-dd') === dateStr) return true;
    } catch {
      // ignore
    }
  }
  if (task.startedAt) {
    try {
      if (format(new Date(task.startedAt), 'yyyy-MM-dd') === dateStr) return true;
    } catch {
      // ignore
    }
  }
  if (task.completedAt) {
    try {
      if (format(new Date(task.completedAt), 'yyyy-MM-dd') === dateStr) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export interface OfficerQCStats {
  officerId: string;
  totalTasks: number;
  completedTasks: number;
  totalReviewed: number;
  unreviewedCompleted: number;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  qualityScore: number | null; // 0-100 derived from green(100)/yellow(60)/red(0)
  avgInternalScore: number | null; // 1-5 from review.internalScore
  urgentCallsCount: number;
  unresolvedUrgentCallsCount: number;
  tagCounts: { tagId: QCErrorTagId; count: number }[];
  customTagCounts: { tag: string; count: number }[];
}

export function computeOfficerQCStats(
  officerId: string,
  tasks: Task[],
  qcReviews: QCTaskReview[]
): OfficerQCStats {
  const officerTasks = tasks.filter((t) => t.assigneeId === officerId);
  const officerTaskIds = new Set(officerTasks.map((t) => t.id));
  const reviewMap = new Map<string, QCTaskReview>();
  qcReviews.forEach((r) => {
    if (r.officerId === officerId || officerTaskIds.has(r.taskId)) {
      reviewMap.set(r.taskId, r);
    }
  });

  const reviews = Array.from(reviewMap.values());
  const completedTasks = officerTasks.filter((t) => normalizeTaskStatus(t) === 'completed');
  const unreviewedCompleted = completedTasks.filter((t) => !reviewMap.has(t.id)).length;

  let greenCount = 0;
  let yellowCount = 0;
  let redCount = 0;
  let weightSum = 0;
  let internalScoreSum = 0;
  let internalScoreCount = 0;
  let urgentCallsCount = 0;
  let unresolvedUrgentCallsCount = 0;

  const tagMap = new Map<QCErrorTagId, number>();
  const customTagMap = new Map<string, number>();

  reviews.forEach((r) => {
    if (r.grade === 'green') {
      greenCount++;
      weightSum += QC_GRADES.green.weight;
    } else if (r.grade === 'yellow') {
      yellowCount++;
      weightSum += QC_GRADES.yellow.weight;
    } else if (r.grade === 'red') {
      redCount++;
      weightSum += QC_GRADES.red.weight;
    }

    if (typeof r.internalScore === 'number' && r.internalScore >= 1 && r.internalScore <= 5) {
      internalScoreSum += r.internalScore;
      internalScoreCount++;
    }

    if (r.needsUrgentCall) {
      urgentCallsCount++;
      if (!r.urgentCallResolved) unresolvedUrgentCallsCount++;
    }

    (r.errorTags || []).forEach((tagId) => {
      tagMap.set(tagId, (tagMap.get(tagId) || 0) + 1);
    });

    (r.customTags || []).forEach((ct) => {
      const clean = ct.trim();
      if (clean) customTagMap.set(clean, (customTagMap.get(clean) || 0) + 1);
    });
  });

  const totalReviewed = reviews.length;
  const qualityScore = totalReviewed > 0 ? Math.round(weightSum / totalReviewed) : null;
  const avgInternalScore =
    internalScoreCount > 0 ? Number((internalScoreSum / internalScoreCount).toFixed(1)) : null;

  const tagCounts = Array.from(tagMap.entries())
    .map(([tagId, count]) => ({ tagId, count }))
    .sort((a, b) => b.count - a.count);

  const customTagCounts = Array.from(customTagMap.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return {
    officerId,
    totalTasks: officerTasks.length,
    completedTasks: completedTasks.length,
    totalReviewed,
    unreviewedCompleted,
    greenCount,
    yellowCount,
    redCount,
    qualityScore,
    avgInternalScore,
    urgentCallsCount,
    unresolvedUrgentCallsCount,
    tagCounts,
    customTagCounts,
  };
}

export interface DailyQCStats {
  dateStr: string;
  dayTasks: Task[];
  reviewedCount: number;
  unreviewedCount: number;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  urgentCallCount: number;
  unresolvedUrgentCallCount: number;
  tagCounts: { tagId: QCErrorTagId; count: number }[];
}

export function computeDailyQCStats(
  dateStr: string,
  tasks: Task[],
  qcReviews: QCTaskReview[]
): DailyQCStats {
  const dayTasks = tasks.filter((t) => doesTaskBelongToDate(t, dateStr));
  const reviewMap = new Map(qcReviews.map((r) => [r.taskId, r]));

  let reviewedCount = 0;
  let unreviewedCount = 0;
  let greenCount = 0;
  let yellowCount = 0;
  let redCount = 0;
  let urgentCallCount = 0;
  let unresolvedUrgentCallCount = 0;
  const tagMap = new Map<QCErrorTagId, number>();

  dayTasks.forEach((t) => {
    const rev = reviewMap.get(t.id);
    if (!rev) {
      unreviewedCount++;
      return;
    }
    reviewedCount++;
    if (rev.grade === 'green') greenCount++;
    else if (rev.grade === 'yellow') yellowCount++;
    else if (rev.grade === 'red') redCount++;

    if (rev.needsUrgentCall) {
      urgentCallCount++;
      if (!rev.urgentCallResolved) unresolvedUrgentCallCount++;
    }

    (rev.errorTags || []).forEach((tagId) => {
      tagMap.set(tagId, (tagMap.get(tagId) || 0) + 1);
    });
  });

  const tagCounts = Array.from(tagMap.entries())
    .map(([tagId, count]) => ({ tagId, count }))
    .sort((a, b) => b.count - a.count);

  return {
    dateStr,
    dayTasks,
    reviewedCount,
    unreviewedCount,
    greenCount,
    yellowCount,
    redCount,
    urgentCallCount,
    unresolvedUrgentCallCount,
    tagCounts,
  };
}
