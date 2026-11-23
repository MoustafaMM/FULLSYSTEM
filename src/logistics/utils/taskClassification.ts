import { Language, Student, Task, TaskPreset, User } from '../types';

export type TaskCategory = 'student_preset' | 'student_custom' | 'non_student';
export type TaskScheduleBucket = 'overdue' | 'today' | 'upcoming' | 'unscheduled' | 'past';
export type TaskStatusBucket = Task['status'];

export interface TaskAnalyticsGroup {
  key: string;
  label: string;
  category: TaskCategory;
}

export interface PartitionedTasks {
  byStatus: {
    in_progress: Task[];
    pending: Task[];
    completed: Task[];
    cancelled: Task[];
  };
  openBySchedule: {
    overdue: Task[];
    today: Task[];
    upcoming: Task[];
    unscheduled: Task[];
  };
  byCategory: {
    student_preset: Task[];
    student_custom: Task[];
    non_student: Task[];
  };
}

/**
 * Formats a Date into a local calendar YYYY-MM-DD string (avoiding UTC day-shift bugs).
 */
export function getLocalDateStr(date: Date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * True only when the task references a real SOP preset template (not omitted or legacy 'custom').
 */
export function hasPresetTemplate(task: Partial<Task>): boolean {
  const presetId = task.presetId?.trim();
  return Boolean(presetId && presetId !== 'custom');
}

/**
 * Detects historical documents written by AssignTaskModal where a preset-based non-student
 * task had its `nonStudentTitle` copied into `customTitle`.
 */
export function isLegacyCopiedNonStudentCustomTitle(task: Partial<Task>): boolean {
  if (!task.isNonStudentTask || !hasPresetTemplate(task)) return false;
  const custom = task.customTitle?.trim();
  const nonStudent = task.nonStudentTitle?.trim();
  return Boolean(custom && nonStudent && custom === nonStudent);
}

/**
 * Classifies a task along the Category axis:
 * - 'non_student': non-student operational task
 * - 'student_preset': student task anchored to an SOP preset
 * - 'student_custom': ad-hoc student task (no preset template or legacy presetId === 'custom')
 */
export function getTaskCategory(task: Partial<Task>): TaskCategory {
  if (task.isNonStudentTask) return 'non_student';
  return hasPresetTemplate(task) ? 'student_preset' : 'student_custom';
}

/**
 * True for any custom-created task lacking an SOP preset template (includes legacy presetId === 'custom').
 */
export function isCustomTask(task: Partial<Task>): boolean {
  return !hasPresetTemplate(task);
}

/**
 * True specifically for student tasks that have no SOP preset template.
 */
export function isStudentCustomTask(task: Partial<Task>): boolean {
  return !task.isNonStudentTask && !hasPresetTemplate(task);
}

/**
 * Coerces a string, epoch number, Date, or Firestore-Timestamp-like value into a valid
 * date/ISO string if parseable, otherwise returns undefined.
 */
export function coerceValidIsoTimestamp(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const ms = new Date(trimmed).getTime();
    return Number.isNaN(ms) ? undefined : trimmed;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (value && typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * True only when the task carries a valid, parseable `completedAt` completion timestamp.
 */
export function hasValidCompletedAt(task: Partial<Task> | undefined | null): boolean {
  return Boolean(task && coerceValidIsoTimestamp((task as { completedAt?: unknown }).completedAt));
}

/**
 * Resolves the canonical Task['status'] ('pending' | 'in_progress' | 'completed' | 'cancelled').
 * Enforces the invariant that any non-cancelled task carrying a valid `completedAt` timestamp
 * is treated as 'completed' (preventing legacy 'delayed' docs or stale open writes from
 * reopening completed work into Overdue), while respecting intentional Admin reopens that clear `completedAt`.
 */
export function normalizeTaskStatus(
  task: (Partial<Task> & { status?: unknown }) | undefined | null
): Task['status'] {
  if (!task) return 'pending';
  const raw = typeof task.status === 'string' ? task.status.trim().toLowerCase() : '';

  if (raw === 'cancelled' || raw === 'canceled') return 'cancelled';
  if (raw === 'completed') return 'completed';

  if (hasValidCompletedAt(task)) {
    return 'completed';
  }

  if (raw === 'pending' || raw === 'in_progress') {
    return raw;
  }

  // Legacy/non-canonical statuses (e.g., 'delayed', 'done', 'finished', empty, uppercase variants)
  if (
    raw === 'done' ||
    raw === 'finished' ||
    task.feedbackSubmitted === true ||
    Boolean(task.feedback)
  ) {
    return 'completed';
  }

  if (
    raw === 'inprogress' ||
    raw === 'in-progress' ||
    raw === 'in progress' ||
    raw === 'active' ||
    Boolean(coerceValidIsoTimestamp((task as { startedAt?: unknown }).startedAt))
  ) {
    return 'in_progress';
  }

  return 'pending';
}

/**
 * Normalizes a Firestore task document on load so legacy statuses (e.g. 'delayed'),
 * casing drift, Firestore Timestamp objects, and completed tasks with stale status fields
 * cannot leak back into open or overdue queues.
 */
export function normalizeLoadedTask<T extends Partial<Task>>(
  rawTask: T
): T & { status: Task['status'] } {
  const createdAt = coerceValidIsoTimestamp((rawTask as { createdAt?: unknown }).createdAt);
  const startedAt = coerceValidIsoTimestamp((rawTask as { startedAt?: unknown }).startedAt);
  const completedAt = coerceValidIsoTimestamp((rawTask as { completedAt?: unknown }).completedAt);

  const normalizedTimestamps: Partial<Task> = {};
  if (createdAt !== undefined && typeof rawTask.createdAt !== 'string') {
    normalizedTimestamps.createdAt = createdAt;
  }
  if (startedAt !== undefined && typeof rawTask.startedAt !== 'string') {
    normalizedTimestamps.startedAt = startedAt;
  }
  if (completedAt !== undefined && typeof rawTask.completedAt !== 'string') {
    normalizedTimestamps.completedAt = completedAt;
  }

  const merged = {
    ...rawTask,
    ...normalizedTimestamps,
  };

  return {
    ...merged,
    status: normalizeTaskStatus(merged),
  };
}

/**
 * True only for active/queued open tasks ('pending' or 'in_progress') without a completion timestamp.
 */
export function isOpenTask(task: Partial<Task>): boolean {
  const status = normalizeTaskStatus(task);
  return !hasValidCompletedAt(task) && (status === 'pending' || status === 'in_progress');
}

/**
 * True only when a task is completed ('completed'), began via Start Task (`startedAt`),
 * finished with a valid `completedAt` timestamp, and `completedAt > startedAt`.
 * Pending, in-progress, cancelled, or missing-timestamp tasks must never accrue overtime.
 */
export function isTaskEligibleForOvertime(task: Partial<Task>): boolean {
  const status = normalizeTaskStatus(task);
  if (status !== 'completed') return false;
  const startedIso = coerceValidIsoTimestamp((task as { startedAt?: unknown }).startedAt);
  const completedIso = coerceValidIsoTimestamp((task as { completedAt?: unknown }).completedAt);
  if (!startedIso || !completedIso) return false;
  return new Date(completedIso).getTime() > new Date(startedIso).getTime();
}

/**
 * True when an open task (`pending` or `in_progress`) has a scheduled `taskDate` strictly before `todayStr`.
 */
export function isTaskOverdue(task: Partial<Task>, todayStr: string = getLocalDateStr()): boolean {
  const dateStr = task.taskDate?.trim();
  if (!dateStr) return false;
  return isOpenTask(task) && dateStr < todayStr;
}

/**
 * Classifies a task along the Schedule Window axis relative to `todayStr` ("YYYY-MM-DD").
 */
export function getTaskScheduleBucket(
  task: Partial<Task>,
  todayStr: string = getLocalDateStr()
): TaskScheduleBucket {
  const dateStr = task.taskDate?.trim();
  if (!dateStr) return 'unscheduled';
  if (dateStr === todayStr) return 'today';
  if (dateStr > todayStr) return 'upcoming';
  return isOpenTask(task) ? 'overdue' : 'past';
}

/**
 * Resolves the clean standalone display title for single-line contexts
 * (overtime ledger, wallet expenses, delete confirmation, feedback, notifications).
 */
export function getTaskDisplayTitle(
  task: Partial<Task>,
  presets: TaskPreset[] = [],
  language: Language = 'en'
): string {
  const preset = hasPresetTemplate(task) ? presets.find(p => p.id === task.presetId) : undefined;
  const legacyCopy = isLegacyCopiedNonStudentCustomTitle(task);
  const cleanCustomEn = legacyCopy ? undefined : task.customTitle?.trim();
  const cleanCustomAr = legacyCopy ? undefined : task.customTitleAr?.trim();
  const cleanNonStudent = task.nonStudentTitle?.trim();
  const presetTitle = preset
    ? (language === 'ar' ? (preset.nameAr || preset.nameEn) : (preset.nameEn || preset.nameAr))
    : undefined;

  if (task.isNonStudentTask) {
    if (language === 'ar') {
      return cleanCustomAr || cleanNonStudent || cleanCustomEn || presetTitle || 'مهمة غير طلابية';
    }
    return cleanNonStudent || cleanCustomEn || presetTitle || 'Non-Student Task';
  }

  if (language === 'ar') {
    return cleanCustomAr || cleanCustomEn || presetTitle || cleanNonStudent || 'خدمة لوجستية';
  }
  return cleanCustomEn || presetTitle || cleanNonStudent || 'Logistics Service';
}

/**
 * Resolves the service / SOP template label without duplicating `nonStudentTitle`
 * on cards and modals where the subject/beneficiary line is already rendered separately.
 */
export function getTaskServiceLabel(
  task: Partial<Task>,
  presets: TaskPreset[] = [],
  language: Language = 'en'
): string {
  const preset = hasPresetTemplate(task) ? presets.find(p => p.id === task.presetId) : undefined;
  const legacyCopy = isLegacyCopiedNonStudentCustomTitle(task);
  const cleanCustomEn = legacyCopy ? undefined : task.customTitle?.trim();
  const cleanCustomAr = legacyCopy ? undefined : task.customTitleAr?.trim();
  const cleanNonStudent = task.nonStudentTitle?.trim();
  const presetTitle = preset
    ? (language === 'ar' ? (preset.nameAr || preset.nameEn) : (preset.nameEn || preset.nameAr))
    : undefined;

  if (task.isNonStudentTask) {
    if (presetTitle) return presetTitle;
    if (language === 'ar' && cleanCustomAr && cleanCustomAr !== cleanNonStudent) return cleanCustomAr;
    if (cleanCustomEn && cleanCustomEn !== cleanNonStudent) return cleanCustomEn;
    return language === 'ar' ? 'مهمة تشغيلية عامة' : 'General Non-Student Operation';
  }

  if (language === 'ar') {
    return cleanCustomAr || cleanCustomEn || presetTitle || 'مهمة مخصصة';
  }
  return cleanCustomEn || presetTitle || 'Custom Task';
}

/**
 * Resolves the subject / beneficiary label for a task card or detail header.
 */
export function getTaskSubjectName(
  task: Partial<Task>,
  students: Student[] = [],
  language: Language = 'en'
): string {
  if (task.isNonStudentTask) {
    return task.nonStudentTitle?.trim() || (language === 'ar' ? 'مهمة غير طلابية' : 'Non-Student Task');
  }
  const student = task.studentId ? students.find(s => s.id === task.studentId) : undefined;
  if (student?.fullName) return student.fullName;
  return language === 'ar' ? 'طالب غير معروف' : 'Unknown Student';
}

/**
 * Returns a collision-free grouping key and label for Analytics & Staff History breakdowns
 * so distinct custom tasks, non-student tasks, and SOP presets never silently merge.
 */
export function getTaskAnalyticsGroup(
  task: Partial<Task>,
  presets: TaskPreset[] = [],
  language: Language = 'en'
): TaskAnalyticsGroup {
  const category = getTaskCategory(task);
  const preset = hasPresetTemplate(task) ? presets.find(p => p.id === task.presetId) : undefined;
  const presetTitle = preset
    ? (language === 'ar' ? (preset.nameAr || preset.nameEn) : (preset.nameEn || preset.nameAr))
    : undefined;

  if (category === 'student_preset') {
    const label = presetTitle || task.customTitle?.trim() || (language === 'ar' ? 'خدمة قياسية' : 'Standard SOP');
    return {
      key: `student_preset:${task.presetId}`,
      label,
      category,
    };
  }

  if (category === 'non_student') {
    if (preset && task.presetId) {
      const nonStudentSuffix = language === 'ar' ? 'غير طلابية' : 'Non-Student';
      return {
        key: `non_student_preset:${task.presetId}`,
        label: `${presetTitle} (${nonStudentSuffix})`,
        category,
      };
    }
    const rawLabel =
      (isLegacyCopiedNonStudentCustomTitle(task) ? undefined : (language === 'ar' ? task.customTitleAr?.trim() : task.customTitle?.trim())) ||
      task.nonStudentTitle?.trim() ||
      (language === 'ar' ? 'مهمة غير طلابية' : 'Non-Student Task');
    return {
      key: `non_student_custom:${rawLabel.toLowerCase()}`,
      label: rawLabel,
      category,
    };
  }

  const customLabel =
    (language === 'ar' ? (task.customTitleAr?.trim() || task.customTitle?.trim()) : task.customTitle?.trim()) ||
    (language === 'ar' ? 'مهمة مخصصة' : 'Custom Student Task');
  return {
    key: `student_custom:${customLabel.toLowerCase()}`,
    label: customLabel,
    category,
  };
}

/**
 * Builds a comprehensive lowercase search haystack covering student, non-student beneficiary,
 * SOP preset, custom title, assignee, hotel, flight number, notes, and coordinator notes.
 */
export function getTaskSearchableText(
  task: Partial<Task>,
  presets: TaskPreset[] = [],
  students: Student[] = [],
  users: User[] = []
): string {
  const student = task.studentId ? students.find(s => s.id === task.studentId) : undefined;
  const preset = hasPresetTemplate(task) ? presets.find(p => p.id === task.presetId) : undefined;
  const assignee = task.assigneeId ? users.find(u => u.id === task.assigneeId) : undefined;

  return [
    task.id,
    task.nonStudentTitle,
    task.nonStudentContact,
    task.customTitle,
    task.customTitleAr,
    task.hotel,
    task.flightNumber,
    task.notes,
    task.coordinatorNote1,
    task.coordinatorNote2,
    task.studentEmail,
    student?.fullName,
    student?.passportNumber,
    student?.email,
    student?.university,
    preset?.nameEn,
    preset?.nameAr,
    assignee?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Matches a task against both category/preset filters:
 * - 'all'
 * - 'custom' (any task without a real SOP preset, including legacy presetId === 'custom')
 * - 'student_preset' / 'student_custom' / 'non_student'
 * - specific presetId
 */
export function matchesTaskTypeFilter(task: Partial<Task>, filterValue: string): boolean {
  if (!filterValue || filterValue === 'all') return true;
  if (filterValue === 'custom') return isCustomTask(task);
  if (filterValue === 'student_preset' || filterValue === 'student_custom' || filterValue === 'non_student') {
    return getTaskCategory(task) === filterValue;
  }
  return hasPresetTemplate(task) && task.presetId === filterValue;
}

/**
 * Partitions tasks simultaneously by Status, Open Schedule Window, and Category.
 */
export function partitionTasks(
  tasks: Task[],
  todayStr: string = getLocalDateStr()
): PartitionedTasks {
  const result: PartitionedTasks = {
    byStatus: {
      in_progress: [],
      pending: [],
      completed: [],
      cancelled: [],
    },
    openBySchedule: {
      overdue: [],
      today: [],
      upcoming: [],
      unscheduled: [],
    },
    byCategory: {
      student_preset: [],
      student_custom: [],
      non_student: [],
    },
  };

  for (const task of tasks) {
    const status = normalizeTaskStatus(task);
    if (status === 'in_progress') result.byStatus.in_progress.push(task);
    else if (status === 'pending') result.byStatus.pending.push(task);
    else if (status === 'completed') result.byStatus.completed.push(task);
    else if (status === 'cancelled') result.byStatus.cancelled.push(task);

    if (isOpenTask(task)) {
      const sched = getTaskScheduleBucket(task, todayStr);
      if (sched === 'overdue') result.openBySchedule.overdue.push(task);
      else if (sched === 'today') result.openBySchedule.today.push(task);
      else if (sched === 'upcoming') result.openBySchedule.upcoming.push(task);
      else result.openBySchedule.unscheduled.push(task);
    }

    const cat = getTaskCategory(task);
    result.byCategory[cat].push(task);
  }

  return result;
}

/**
 * Canonical status palette across the entire app:
 * - in_progress: blue
 * - pending: amber
 * - completed: emerald
 * - cancelled: rose
 */
export function getTaskStatusBadgeClasses(
  status: Task['status'],
  variant: 'light' | 'dark' = 'light'
): string {
  if (variant === 'dark') {
    switch (status) {
      case 'in_progress':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'pending':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'completed':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'cancelled':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  }

  switch (status) {
    case 'in_progress':
      return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
    case 'pending':
      return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800';
    case 'cancelled':
      return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  }
}

export function getTaskStatusAccentClass(status: Task['status']): string {
  switch (status) {
    case 'in_progress':
      return 'bg-blue-500';
    case 'pending':
      return 'bg-amber-500';
    case 'completed':
      return 'bg-emerald-500';
    case 'cancelled':
      return 'bg-rose-500';
    default:
      return 'bg-slate-400';
  }
}
