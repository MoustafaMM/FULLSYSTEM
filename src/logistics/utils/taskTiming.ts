import { Task } from '../types';
import { normalizeTaskStatus } from './taskClassification';

export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
export const SCHEDULED_GRACE_PERIOD_HOURS = 2;
export const SCHEDULED_GRACE_PERIOD_MS = SCHEDULED_GRACE_PERIOD_HOURS * 60 * 60 * 1000;

export type TaskDaySortOrder = 'chronological' | 'reverse_chronological' | 'recent_activity';

export interface ParsedTimeParts {
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Parses a time string ("HH:mm", "H:mm", "HH:mm:ss", or "h:mm AM/PM") into 24-hour parts.
 */
export function parseTaskTimeParts(taskTime?: string): ParsedTimeParts | null {
  if (!taskTime) return null;
  const trimmed = taskTime.trim();
  if (!trimmed) return null;

  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i.exec(trimmed);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  const meridiem = match[4]?.toUpperCase();

  if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) return null;
  if (minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
  } else if (hours < 0 || hours > 23) {
    return null;
  }

  return { hours, minutes, seconds };
}

/**
 * Parses an ISO timestamp string into epoch milliseconds, or null if missing/invalid.
 */
function parseIsoTimestampMs(iso?: string): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Formats an ISO timestamp string into a local calendar date ("YYYY-MM-DD").
 */
export function getLocalDateStrFromIso(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const year = String(d.getFullYear());
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses a "YYYY-MM-DD" date string and local time parts into epoch milliseconds.
 */
function buildLocalDateTimeMs(dateStr: string, hours: number, minutes: number, seconds: number = 0): number | null {
  const dateParts = dateStr.split('-').map(Number);
  if (dateParts.length !== 3 || dateParts.some(Number.isNaN)) return null;
  const [year, month, day] = dateParts;
  const d = new Date(year, month - 1, day, hours, minutes, seconds, 0);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Safely parses taskDate (YYYY-MM-DD) and taskTime (HH:mm) into epoch milliseconds in local time.
 * If taskTime is missing, defaults to 18:00 (end of workday) on taskDate.
 */
export function getTaskScheduledMs(taskDate?: string, taskTime?: string): number | null {
  if (!taskDate) return null;
  const timeParts = parseTaskTimeParts(taskTime);
  const hours = timeParts ? timeParts.hours : 18;
  const minutes = timeParts ? timeParts.minutes : 0;
  const seconds = timeParts ? timeParts.seconds : 0;
  return buildLocalDateTimeMs(taskDate, hours, minutes, seconds);
}

export interface TaskDayChronologicalKey {
  hasExplicitTime: boolean;
  timeMs: number;
  fallbackMs: number;
  createdMs: number;
}

export interface TaskChronologicalKey {
  hasExplicitDate: boolean;
  dateMs: number;
  hasExplicitTime: boolean;
  timeMs: number;
  fallbackMs: number;
  createdMs: number;
}

/**
 * Derives the chronological sort key for a task displayed under a specific day ("YYYY-MM-DD").
 *
 * Priority for explicit time on that day:
 * 1. Scheduled taskTime on that date (or when taskDate is unset)
 * 2. Execution startedAt on that date (or carried over from an earlier date)
 * 3. Execution completedAt on that date
 * 4. Scheduled taskTime on another date (e.g. overdue carried-over task)
 *
 * Tasks without an explicit scheduled time or execution timestamp
 * are grouped after timed tasks and ordered chronologically by creation time.
 */
export function getTaskDayChronologicalKey(task: Task, dateStr: string): TaskDayChronologicalKey {
  const createdMs = parseIsoTimestampMs(task.createdAt) ?? 0;
  const startedMs = parseIsoTimestampMs(task.startedAt);
  const completedMs = parseIsoTimestampMs(task.completedAt);
  const fallbackMs = startedMs ?? completedMs ?? createdMs;

  const dayStartMs = buildLocalDateTimeMs(dateStr, 0, 0, 0);
  const trimmedDate = task.taskDate?.trim();
  const timeParts = parseTaskTimeParts(task.taskTime);

  // 1. Explicit scheduled taskTime for this day (or unscheduled date with explicit time)
  if ((!trimmedDate || trimmedDate === dateStr) && timeParts) {
    const scheduledMs = buildLocalDateTimeMs(dateStr, timeParts.hours, timeParts.minutes, timeParts.seconds);
    if (scheduledMs !== null) {
      return {
        hasExplicitTime: true,
        timeMs: scheduledMs,
        fallbackMs,
        createdMs,
      };
    }
  }

  // 2. Started on this day (or carried over in-progress from an earlier day)
  if (startedMs !== null) {
    const startedDateStr = getLocalDateStrFromIso(task.startedAt);
    if (startedDateStr === dateStr || (dayStartMs !== null && startedMs < dayStartMs)) {
      return {
        hasExplicitTime: true,
        timeMs: startedMs,
        fallbackMs,
        createdMs,
      };
    }
  }

  // 3. Completed on this day
  if (completedMs !== null) {
    const completedDateStr = getLocalDateStrFromIso(task.completedAt);
    if (completedDateStr === dateStr) {
      return {
        hasExplicitTime: true,
        timeMs: completedMs,
        fallbackMs,
        createdMs,
      };
    }
  }

  // 4. Explicit scheduled taskDate + taskTime from another day (e.g. overdue carried-over pending task)
  if (trimmedDate && timeParts) {
    const scheduledMs = buildLocalDateTimeMs(trimmedDate, timeParts.hours, timeParts.minutes, timeParts.seconds);
    if (scheduledMs !== null) {
      return {
        hasExplicitTime: true,
        timeMs: scheduledMs,
        fallbackMs,
        createdMs,
      };
    }
  }

  // 5. Untimed pending/unexecuted task on this day
  return {
    hasExplicitTime: false,
    timeMs: createdMs,
    fallbackMs,
    createdMs,
  };
}

/**
 * Derives a multi-day chronological sort key (earliest date and earliest time first).
 */
export function getTaskChronologicalKey(task: Task, referenceDateStr?: string): TaskChronologicalKey {
  const createdMs = parseIsoTimestampMs(task.createdAt) ?? 0;
  const startedMs = parseIsoTimestampMs(task.startedAt);
  const completedMs = parseIsoTimestampMs(task.completedAt);
  const fallbackMs = startedMs ?? completedMs ?? createdMs;

  const trimmedDate = task.taskDate?.trim();
  const dateMs = trimmedDate ? buildLocalDateTimeMs(trimmedDate, 0, 0, 0) : null;
  const timeParts = parseTaskTimeParts(task.taskTime);

  if (dateMs !== null && trimmedDate) {
    if (timeParts) {
      const scheduledMs = buildLocalDateTimeMs(trimmedDate, timeParts.hours, timeParts.minutes, timeParts.seconds);
      if (scheduledMs !== null) {
        return {
          hasExplicitDate: true,
          dateMs,
          hasExplicitTime: true,
          timeMs: scheduledMs,
          fallbackMs,
          createdMs,
        };
      }
    }

    if (startedMs !== null && getLocalDateStrFromIso(task.startedAt) === trimmedDate) {
      return {
        hasExplicitDate: true,
        dateMs,
        hasExplicitTime: true,
        timeMs: startedMs,
        fallbackMs,
        createdMs,
      };
    }

    if (completedMs !== null && getLocalDateStrFromIso(task.completedAt) === trimmedDate) {
      return {
        hasExplicitDate: true,
        dateMs,
        hasExplicitTime: true,
        timeMs: completedMs,
        fallbackMs,
        createdMs,
      };
    }

    return {
      hasExplicitDate: true,
      dateMs,
      hasExplicitTime: false,
      timeMs: fallbackMs,
      fallbackMs,
      createdMs,
    };
  }

  // Unscheduled task (no valid taskDate)
  if (timeParts) {
    const anchorDate = referenceDateStr || getLocalDateStrFromIso(task.createdAt) || '1970-01-01';
    const scheduledMs = buildLocalDateTimeMs(anchorDate, timeParts.hours, timeParts.minutes, timeParts.seconds);
    if (scheduledMs !== null) {
      return {
        hasExplicitDate: false,
        dateMs: 0,
        hasExplicitTime: true,
        timeMs: scheduledMs,
        fallbackMs,
        createdMs,
      };
    }
  }

  if (startedMs !== null) {
    return {
      hasExplicitDate: false,
      dateMs: 0,
      hasExplicitTime: true,
      timeMs: startedMs,
      fallbackMs,
      createdMs,
    };
  }

  if (completedMs !== null) {
    return {
      hasExplicitDate: false,
      dateMs: 0,
      hasExplicitTime: true,
      timeMs: completedMs,
      fallbackMs,
      createdMs,
    };
  }

  return {
    hasExplicitDate: false,
    dateMs: 0,
    hasExplicitTime: false,
    timeMs: createdMs,
    fallbackMs,
    createdMs,
  };
}

/**
 * Comparator for sorting tasks chronologically across days (earliest first, then later).
 */
export function compareTasksChronologically(a: Task, b: Task, referenceDateStr?: string): number {
  const keyA = getTaskChronologicalKey(a, referenceDateStr);
  const keyB = getTaskChronologicalKey(b, referenceDateStr);

  if (keyA.hasExplicitDate !== keyB.hasExplicitDate) {
    return keyA.hasExplicitDate ? -1 : 1;
  }

  if (keyA.hasExplicitDate && keyA.dateMs !== keyB.dateMs) {
    return keyA.dateMs - keyB.dateMs;
  }

  if (keyA.hasExplicitTime !== keyB.hasExplicitTime) {
    return keyA.hasExplicitTime ? -1 : 1;
  }

  if (keyA.timeMs !== keyB.timeMs) {
    return keyA.timeMs - keyB.timeMs;
  }

  if (keyA.fallbackMs !== keyB.fallbackMs) {
    return keyA.fallbackMs - keyB.fallbackMs;
  }

  if (keyA.createdMs !== keyB.createdMs) {
    return keyA.createdMs - keyB.createdMs;
  }

  return (a.id || '').localeCompare(b.id || '');
}

/**
 * Returns a new array of tasks sorted chronologically (earliest first, then later).
 */
export function sortTasksChronologically(tasks: Task[], referenceDateStr?: string): Task[] {
  return [...tasks].sort((a, b) => compareTasksChronologically(a, b, referenceDateStr));
}

/**
 * Comparator for sorting tasks within a single day view.
 */
export function compareTasksForDay(
  a: Task,
  b: Task,
  dateStr: string,
  sortOrder: TaskDaySortOrder = 'chronological'
): number {
  if (sortOrder === 'recent_activity') {
    const actA = parseIsoTimestampMs(a.completedAt) ?? parseIsoTimestampMs(a.startedAt) ?? parseIsoTimestampMs(a.createdAt) ?? 0;
    const actB = parseIsoTimestampMs(b.completedAt) ?? parseIsoTimestampMs(b.startedAt) ?? parseIsoTimestampMs(b.createdAt) ?? 0;
    if (actA !== actB) return actB - actA;
    return (a.id || '').localeCompare(b.id || '');
  }

  const keyA = getTaskDayChronologicalKey(a, dateStr);
  const keyB = getTaskDayChronologicalKey(b, dateStr);

  // Timed / executed tasks always precede untimed unstarted tasks
  if (keyA.hasExplicitTime !== keyB.hasExplicitTime) {
    return keyA.hasExplicitTime ? -1 : 1;
  }

  const direction = sortOrder === 'reverse_chronological' ? -1 : 1;

  if (keyA.timeMs !== keyB.timeMs) {
    return (keyA.timeMs - keyB.timeMs) * direction;
  }

  if (keyA.fallbackMs !== keyB.fallbackMs) {
    return (keyA.fallbackMs - keyB.fallbackMs) * direction;
  }

  if (keyA.createdMs !== keyB.createdMs) {
    return (keyA.createdMs - keyB.createdMs) * direction;
  }

  return (a.id || '').localeCompare(b.id || '') * direction;
}

/**
 * Returns a new sorted array of tasks for a given day ("YYYY-MM-DD").
 * Defaults to chronological order (earliest first).
 */
export function sortTasksForDay(
  tasks: Task[],
  dateStr: string,
  sortOrder: TaskDaySortOrder = 'chronological'
): Task[] {
  return [...tasks].sort((a, b) => compareTasksForDay(a, b, dateStr, sortOrder));
}

/**
 * Evaluates whether a task has breached its SLA or scheduled time and should be marked as delayed.
 * Delay status has been cancelled across the system; always returns false.
 */
export function isTaskDelayed(_task: Task, _nowMs: number = Date.now()): boolean {
  return false;
}

export interface TaskSlaInfo {
  isOverdue: boolean;
  text: string;
  state: 'normal' | 'warning' | 'completed';
}

/**
 * Calculates display text and state for task SLA badges and timing pills.
 */
export function getTaskSlaInfo(task: Task, nowMs: number = Date.now()): TaskSlaInfo {
  const status = normalizeTaskStatus(task);

  // A. Completed Tasks
  if (status === 'completed') {
    const startIso = task.startedAt || task.createdAt;
    if (!startIso) {
      return { isOverdue: false, text: 'Completed', state: 'completed' };
    }

    const startMs = new Date(startIso).getTime();
    const endMs = task.completedAt ? new Date(task.completedAt).getTime() : nowMs;
    const elapsedMs = Math.max(0, endMs - startMs);
    const diffMins = Math.floor(elapsedMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    return {
      isOverdue: false,
      text: `Completed (${durationStr})`,
      state: 'completed'
    };
  }

  // B. In-Progress Tasks
  if (status === 'in_progress') {
    const startIso = task.startedAt || task.createdAt;
    if (!startIso) {
      return { isOverdue: false, text: 'In Progress', state: 'normal' };
    }

    const startMs = new Date(startIso).getTime();
    const elapsedMs = Math.max(0, nowMs - startMs);
    const diffMins = Math.floor(elapsedMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    return {
      isOverdue: false,
      text: `Active (${durationStr})`,
      state: 'normal'
    };
  }

  // C. Cancelled Tasks
  if (status === 'cancelled') {
    return {
      isOverdue: false,
      text: 'Cancelled',
      state: 'normal'
    };
  }

  // D. Pending Tasks
  if (task.taskDate) {
    const timeLabel = task.taskTime ? task.taskTime : 'Scheduled';
    return {
      isOverdue: false,
      text: `${timeLabel}`,
      state: 'normal'
    };
  }

  return {
    isOverdue: false,
    text: 'Pending',
    state: 'normal'
  };
}
