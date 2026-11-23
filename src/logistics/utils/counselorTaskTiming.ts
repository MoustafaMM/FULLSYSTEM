import type { CounselorTask, CounselorTaskProgress, Language } from '../types';

/**
 * True when an individual counselor progress entry represents completed work
 * (either explicit 'completed' status or a valid completedAt timestamp).
 */
export function isCounselorProgressCompleted(progress?: CounselorTaskProgress): boolean {
  if (!progress) return false;
  if (progress.status === 'completed') return true;
  if (progress.completedAt) {
    const ms = new Date(progress.completedAt).getTime();
    if (!Number.isNaN(ms)) return true;
  }
  return false;
}

/**
 * True when all assigned counselors have acknowledged (for notices) or completed (for action tasks).
 */
export function isCounselorTaskCompletedForManager(task: CounselorTask): boolean {
  const assignedIds = Array.isArray(task.assignedCounselorIds) ? task.assignedCounselorIds : [];
  if (assignedIds.length === 0) return false;
  if (task.mode === 'notice') {
    const ackMap = task.acknowledgments || {};
    return assignedIds.every((cid) => Boolean(ackMap[cid]));
  }
  const progressMap = task.progressByCounselor || {};
  return assignedIds.every((cid) => isCounselorProgressCompleted(progressMap[cid]));
}

/**
 * True only when the counselor has NOT yet acknowledged a notice or NOT yet completed an action task
 * and the deadline has elapsed. Already-acknowledged notices and completed tasks are NEVER overdue.
 */
export function isCounselorTaskOverdueForCounselor(
  task: CounselorTask,
  counselorId: string,
  nowMs: number = Date.now()
): boolean {
  if (!task.deadlineAt) return false;
  const deadlineMs = new Date(task.deadlineAt).getTime();
  if (Number.isNaN(deadlineMs) || nowMs <= deadlineMs) return false;
  if (task.mode === 'notice') {
    return !task.acknowledgments?.[counselorId];
  }
  return !isCounselorProgressCompleted(task.progressByCounselor?.[counselorId]);
}

export type CounselorCountdownState =
  | 'none'
  | 'normal'
  | 'warning'
  | 'critical'
  | 'overdue'
  | 'completed_on_time'
  | 'completed_late';

export interface CounselorTaskCountdownInfo {
  state: CounselorCountdownState;
  remainingMs: number;
  label: string;
  isOverdue: boolean;
}

export interface CounselorTaskMetrics {
  totalAssigned: number;
  ackedCount: number;
  unackedCount: number;
  completedCount: number;
  inProgressCount: number;
  pendingCount: number;
  unackedIds: string[];
  incompleteIds: string[];
  ackRate: number;
  completionRate: number;
  isOverdueForManager: boolean;
  hasLateCompletion: boolean;
}

const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const TWO_HOURS_MS = 2 * ONE_HOUR_MS;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

/**
 * Combines a YYYY-MM-DD date string and optional HH:mm time string (in browser local time)
 * into a UTC ISO-8601 timestamp. Defaults time to 17:00 if date is provided without time.
 */
export function combineDeadlineIso(dateStr?: string, timeStr?: string): string | undefined {
  const cleanDate = dateStr?.trim();
  if (!cleanDate) return undefined;

  const dateParts = cleanDate.split('-').map(Number);
  if (dateParts.length !== 3 || dateParts.some(Number.isNaN)) return undefined;

  const [year, month, day] = dateParts;
  let hours = 17;
  let minutes = 0;

  const cleanTime = timeStr?.trim();
  if (cleanTime && cleanTime.includes(':')) {
    const [hStr, mStr] = cleanTime.split(':');
    const h = Number(hStr);
    const m = Number(mStr);
    if (!Number.isNaN(h) && h >= 0 && h <= 23) hours = h;
    if (!Number.isNaN(m) && m >= 0 && m <= 59) minutes = m;
  }

  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(localDate.getTime())) return undefined;
  return localDate.toISOString();
}

/**
 * Extracts YYYY-MM-DD and HH:mm in local time from an ISO-8601 deadline timestamp.
 */
export function splitDeadlineIso(deadlineAt?: string): { date: string; time: string } {
  if (!deadlineAt) return { date: '', time: '17:00' };
  const d = new Date(deadlineAt);
  if (Number.isNaN(d.getTime())) return { date: '', time: '17:00' };

  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { date, time };
}

/**
 * Formats an absolute millisecond duration into compact remaining/elapsed segments.
 */
export function formatDurationCompact(absMs: number, includeSeconds = false, language: Language = 'en'): string {
  const totalSec = Math.max(0, Math.floor(absMs / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (language === 'ar') {
    if (days > 0) return `${days} ي ${hours} س`;
    if (hours > 0) return `${hours} س ${minutes} د`;
    if (includeSeconds) return `${minutes} د ${seconds} ث`;
    return `${Math.max(1, minutes)} د`;
  }

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (includeSeconds) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${Math.max(1, minutes)}m`;
}

/**
 * Evaluates live countdown state, urgency color tier, and localized label for a task deadline.
 */
export function getCounselorTaskCountdown(options: {
  deadlineAt?: string;
  nowMs?: number;
  isCompleted?: boolean;
  completedAt?: string;
  language?: Language;
}): CounselorTaskCountdownInfo {
  const {
    deadlineAt,
    nowMs = Date.now(),
    isCompleted = false,
    completedAt,
    language = 'en',
  } = options;

  if (!deadlineAt) {
    if (isCompleted) {
      return {
        state: 'completed_on_time',
        remainingMs: 0,
        label: language === 'ar' ? 'مكتملة' : 'Completed',
        isOverdue: false,
      };
    }
    return {
      state: 'none',
      remainingMs: 0,
      label: language === 'ar' ? 'بدون موعد نهائي' : 'No deadline',
      isOverdue: false,
    };
  }

  const deadlineMs = new Date(deadlineAt).getTime();
  if (Number.isNaN(deadlineMs)) {
    return {
      state: 'none',
      remainingMs: 0,
      label: language === 'ar' ? 'بدون موعد نهائي' : 'No deadline',
      isOverdue: false,
    };
  }

  if (isCompleted) {
    const doneMs = completedAt ? new Date(completedAt).getTime() : nowMs;
    const delta = deadlineMs - (Number.isNaN(doneMs) ? nowMs : doneMs);
    if (delta < 0) {
      const lateStr = formatDurationCompact(Math.abs(delta), false, language);
      return {
        state: 'completed_late',
        remainingMs: delta,
        label: language === 'ar' ? `منجزة متأخراً (${lateStr})` : `Done late (+${lateStr})`,
        isOverdue: true,
      };
    }
    return {
      state: 'completed_on_time',
      remainingMs: delta,
      label: language === 'ar' ? 'منجزة في الوقت' : 'Done on time',
      isOverdue: false,
    };
  }

  const remainingMs = deadlineMs - nowMs;

  if (remainingMs < 0) {
    const overdueStr = formatDurationCompact(Math.abs(remainingMs), false, language);
    return {
      state: 'overdue',
      remainingMs,
      label: language === 'ar' ? `متأخر بـ ${overdueStr}` : `Overdue by ${overdueStr}`,
      isOverdue: true,
    };
  }

  if (remainingMs < TWO_HOURS_MS) {
    const showSeconds = remainingMs < ONE_HOUR_MS;
    const remStr = formatDurationCompact(remainingMs, showSeconds, language);
    return {
      state: 'critical',
      remainingMs,
      label: language === 'ar' ? `متبقي ${remStr}` : `${remStr} left`,
      isOverdue: false,
    };
  }

  if (remainingMs < TWENTY_FOUR_HOURS_MS) {
    const remStr = formatDurationCompact(remainingMs, false, language);
    return {
      state: 'warning',
      remainingMs,
      label: language === 'ar' ? `متبقي ${remStr}` : `${remStr} left`,
      isOverdue: false,
    };
  }

  const remStr = formatDurationCompact(remainingMs, false, language);
  return {
    state: 'normal',
    remainingMs,
    label: language === 'ar' ? `متبقي ${remStr}` : `${remStr} left`,
    isOverdue: false,
  };
}

/**
 * Computes per-task acknowledgment, completion, and overdue metrics across assigned counselors.
 */
export function getCounselorTaskMetrics(task: CounselorTask, nowMs: number = Date.now()): CounselorTaskMetrics {
  const assignedIds = Array.isArray(task.assignedCounselorIds) ? task.assignedCounselorIds : [];
  const ackMap = task.acknowledgments || {};
  const progressMap = task.progressByCounselor || {};

  const unackedIds: string[] = [];
  const incompleteIds: string[] = [];

  let ackedCount = 0;
  let completedCount = 0;
  let inProgressCount = 0;
  let pendingCount = 0;
  let hasLateCompletion = false;

  for (const cid of assignedIds) {
    if (ackMap[cid]) {
      ackedCount++;
    } else {
      unackedIds.push(cid);
    }

    const prog = progressMap[cid];
    if (isCounselorProgressCompleted(prog)) {
      completedCount++;
      if (prog?.completedLate) hasLateCompletion = true;
    } else {
      incompleteIds.push(cid);
      if (prog?.status === 'in_progress') {
        inProgressCount++;
      } else {
        pendingCount++;
      }
    }
  }

  const totalAssigned = assignedIds.length;
  const unackedCount = unackedIds.length;
  const ackRate = totalAssigned > 0 ? Math.round((ackedCount / totalAssigned) * 100) : 0;
  const completionRate = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0;

  let isOverdueForManager = false;
  if (task.deadlineAt) {
    const deadlineMs = new Date(task.deadlineAt).getTime();
    if (!Number.isNaN(deadlineMs) && nowMs > deadlineMs) {
      if (task.mode === 'notice') {
        isOverdueForManager = unackedCount > 0;
      } else {
        isOverdueForManager = incompleteIds.length > 0;
      }
    }
  }

  return {
    totalAssigned,
    ackedCount,
    unackedCount,
    completedCount,
    inProgressCount,
    pendingCount,
    unackedIds,
    incompleteIds,
    ackRate,
    completionRate,
    isOverdueForManager,
    hasLateCompletion,
  };
}
