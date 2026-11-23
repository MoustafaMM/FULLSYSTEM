import { MediaItem, SubTask } from '../types';
import { TaskCategory } from './taskClassification';

/** Fixed Malaysia Time offset (UTC+08:00; Malaysia observes no DST). */
export const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Standard non-overtime window applies on weekdays (Mon–Fri) from 09:00 to 17:00 MYT. */
export const REGULAR_WORK_START_HOUR = 9;
export const REGULAR_WORK_END_HOUR = 17;

const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export interface MalaysiaDateParts {
  year: number;
  month: number; // 0..11
  day: number; // 1..31
  dayOfWeek: number; // 0=Sun..6=Sat
  hours: number; // 0..23
  minutes: number; // 0..59
  seconds: number; // 0..59
  ms: number; // 0..999
}

export interface WorkOvertimeSlice {
  sliceId: string;
  sourceType: 'task' | 'manual';
  sourceId: string;
  userId: string;
  userName: string;
  userRole: string;
  dateStr: string; // YYYY-MM-DD in Malaysia Time (UTC+08:00)
  dayOfWeek: number; // 0..6 in MYT (0 = Sunday, 6 = Saturday)
  dayNameFull: string;
  dayNameShort: string;
  isWeekend: boolean; // Saturday (6) or Sunday (0)
  hasStandardHours: boolean; // True on Weekdays Monday (1) through Friday (5)
  dayType: 'weekday' | 'weekend';
  referenceTitle: string;
  referenceDetail?: string;
  actualStart: Date;
  actualEnd: Date;
  startTimeFormatted: string; // HH:mm (MYT)
  endTimeFormatted: string; // HH:mm or 24:00 (MYT)
  startMinutesInDay: number; // 0..1440 in MYT
  endMinutesInDay: number; // 0..1440 in MYT
  totalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  weekdayOvertimeMinutes: number;
  weekendOvertimeMinutes: number;
  notes?: string;
  manualLogId?: string;
  presetId?: string;
  status?: string;
  isNonStudentTask?: boolean;
  taskCategory?: TaskCategory;
  studentId?: string;
  studentName?: string;
  studentPassport?: string;
  studentPhone?: string;
  studentUniversity?: string;
  studentPackage?: string;
  nonStudentTitle?: string;
  nonStudentContact?: string;
  hotel?: string;
  subTasks?: SubTask[];
  feedbackRating?: number;
  feedbackComment?: string;
  taskStartedAt?: string;
  taskCompletedAt?: string;
  studentCommunicationMedia?: MediaItem[];
}

export interface SliceIntervalMeta {
  sourceType: 'task' | 'manual';
  sourceId: string;
  userId: string;
  userName: string;
  userRole: string;
  referenceTitle: string;
  referenceDetail?: string;
  notes?: string;
  manualLogId?: string;
  presetId?: string;
  status?: string;
  isNonStudentTask?: boolean;
  taskCategory?: TaskCategory;
  studentId?: string;
  studentName?: string;
  studentPassport?: string;
  studentPhone?: string;
  studentUniversity?: string;
  studentPackage?: string;
  nonStudentTitle?: string;
  nonStudentContact?: string;
  hotel?: string;
  subTasks?: SubTask[];
  feedbackRating?: number;
  feedbackComment?: string;
  taskStartedAt?: string;
  taskCompletedAt?: string;
  studentCommunicationMedia?: MediaItem[];
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Extracts wall-clock date/time components in Malaysia Time (UTC+08:00),
 * completely independent of the host browser's local timezone.
 */
export function getMalaysiaDateParts(date: Date | number): MalaysiaDateParts {
  const utcMs = typeof date === 'number' ? date : date.getTime();
  const shifted = new Date(utcMs + MYT_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    seconds: shifted.getUTCSeconds(),
    ms: shifted.getUTCMilliseconds(),
  };
}

/**
 * Converts Malaysia wall-clock date/time parts (UTC+08:00) into an absolute UTC Date.
 */
export function malaysiaWallToUtcDate(
  year: number,
  monthIndex: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0
): Date {
  return new Date(Date.UTC(year, monthIndex, day, hours, minutes, seconds, ms) - MYT_OFFSET_MS);
}

/**
 * Formats a Date into YYYY-MM-DD in Malaysia Time (UTC+08:00).
 */
export function getMalaysiaDateStr(date: Date = new Date()): string {
  const p = getMalaysiaDateParts(date);
  return `${p.year}-${pad2(p.month + 1)}-${pad2(p.day)}`;
}

/**
 * Parses a "YYYY-MM-DD" date string and "HH:mm" (or "HH:mm:ss") time string strictly as Malaysia Time (UTC+08:00).
 */
export function parseMalaysiaDateTime(dateStr: string, timeStr: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr.trim());
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const monthIndex = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const seconds = timeMatch[3] ? Number(timeMatch[3]) : 0;

  if (
    monthIndex < 0 || monthIndex > 11 ||
    day < 1 || day > 31 ||
    hours < 0 || hours > 23 ||
    minutes < 0 || minutes > 59 ||
    seconds < 0 || seconds > 59
  ) {
    return null;
  }

  const d = malaysiaWallToUtcDate(year, monthIndex, day, hours, minutes, seconds, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parses an ISO string (respecting explicit Z/+/- offset, or treating offset-less ISO datetimes as MYT UTC+08:00).
 */
export function parseIsoOrMalaysiaDateTime(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const normalized = hasExplicitZone ? trimmed : `${trimmed}+08:00`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Formats an ISO string or Date as "HH:mm" in Malaysia Time (UTC+08:00).
 */
export function formatMalaysiaTimeHHmm(input?: string | Date): string {
  if (!input) return '--:--';
  const d = typeof input === 'string' ? parseIsoOrMalaysiaDateTime(input) : input;
  if (!d || Number.isNaN(d.getTime())) return '--:--';
  const p = getMalaysiaDateParts(d);
  return `${pad2(p.hours)}:${pad2(p.minutes)}`;
}

/**
 * Formats an ISO string or Date as "YYYY-MM-DD HH:mm" (or "MMM dd, yyyy • HH:mm") in Malaysia Time (UTC+08:00).
 */
export function formatMalaysiaDateTimeDisplay(input?: string | Date): string {
  if (!input) return '-';
  const d = typeof input === 'string' ? parseIsoOrMalaysiaDateTime(input) : input;
  if (!d || Number.isNaN(d.getTime())) return String(input);
  const p = getMalaysiaDateParts(d);
  return `${MONTH_NAMES_SHORT[p.month]} ${pad2(p.day)}, ${p.year} • ${pad2(p.hours)}:${pad2(p.minutes)} MYT`;
}

/**
 * Formats a Date as "YYYY-MM-DD HH:mm:ss" in Malaysia Time (UTC+08:00).
 */
export function formatMalaysiaTimestamp(date: Date = new Date()): string {
  const p = getMalaysiaDateParts(date);
  return `${p.year}-${pad2(p.month + 1)}-${pad2(p.day)} ${pad2(p.hours)}:${pad2(p.minutes)}:${pad2(p.seconds)}`;
}

/**
 * Formats a Date as "YYYYMMDD_HHmm" in Malaysia Time (UTC+08:00) for filenames.
 */
export function formatMalaysiaFilenameStamp(date: Date = new Date()): string {
  const p = getMalaysiaDateParts(date);
  return `${p.year}${pad2(p.month + 1)}${pad2(p.day)}_${pad2(p.hours)}${pad2(p.minutes)}`;
}

/**
 * Computes YYYY-MM-DD filter bounds for date presets in Malaysia Time (UTC+08:00).
 */
export function getMalaysiaDateRangePreset(
  preset: 'all' | 'this_month' | 'last_month' | 'this_week' | 'custom',
  customStartDate = '',
  customEndDate = '',
  now: Date = new Date()
): { filterStart: string; filterEnd: string } {
  const today = getMalaysiaDateParts(now);

  switch (preset) {
    case 'this_month': {
      const start = malaysiaWallToUtcDate(today.year, today.month, 1);
      const end = malaysiaWallToUtcDate(today.year, today.month + 1, 0);
      return {
        filterStart: getMalaysiaDateStr(start),
        filterEnd: getMalaysiaDateStr(end),
      };
    }
    case 'last_month': {
      const start = malaysiaWallToUtcDate(today.year, today.month - 1, 1);
      const end = malaysiaWallToUtcDate(today.year, today.month, 0);
      return {
        filterStart: getMalaysiaDateStr(start),
        filterEnd: getMalaysiaDateStr(end),
      };
    }
    case 'this_week': {
      // Monday-based week in MYT
      const offsetFromMonday = (today.dayOfWeek + 6) % 7;
      const monday = malaysiaWallToUtcDate(today.year, today.month, today.day - offsetFromMonday);
      const sunday = malaysiaWallToUtcDate(today.year, today.month, today.day - offsetFromMonday + 6);
      return {
        filterStart: getMalaysiaDateStr(monday),
        filterEnd: getMalaysiaDateStr(sunday),
      };
    }
    case 'custom':
      return {
        filterStart: customStartDate,
        filterEnd: customEndDate,
      };
    case 'all':
    default:
      return { filterStart: '', filterEnd: '' };
  }
}

/**
 * Format minutes into clean human-readable duration e.g. "14 hrs 30 mins"
 */
export const formatDurationDisplay = (totalMinutes: number): string => {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hrs = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hrs === 0 && mins === 0) return '0 mins';
  if (hrs === 0) return `${mins} mins`;
  if (mins === 0) return `${hrs} hrs`;
  return `${hrs} hrs ${mins} mins`;
};

/**
 * Human-readable classification label for a slice's day type.
 */
export function getSliceDayTypeLabel(slice: Pick<WorkOvertimeSlice, 'isWeekend'>): string {
  if (slice.isWeekend) return 'Weekend Holiday (100% OT)';
  return 'Weekday (Mon–Fri)';
}

/**
 * Slice an arbitrary [startDate, endDate] work interval by Malaysia Time (UTC+08:00) calendar day
 * and calculate regular vs overtime minutes per policy:
 * - Weekdays (Mon–Fri): 09:00 to 17:00 (5:00 PM) MYT are standard non-overtime regular hours (0 OT).
 *   Work before 09:00 AM or after 17:00 (5:00 PM) counts as Weekday Overtime.
 * - Weekend Holiday (Sat & Sun): 100% of hours worked count as Weekend Overtime.
 */
export function sliceWorkInterval(
  startDate: Date,
  endDate: Date,
  meta: SliceIntervalMeta
): WorkOvertimeSlice[] {
  const utcStartMs = startDate.getTime();
  const utcEndMs = endDate.getTime();
  if (Number.isNaN(utcStartMs) || Number.isNaN(utcEndMs) || utcEndMs <= utcStartMs) {
    return [];
  }

  const slices: WorkOvertimeSlice[] = [];
  let cursorUtcMs = utcStartMs;

  while (cursorUtcMs < utcEndMs) {
    const startParts = getMalaysiaDateParts(cursorUtcMs);
    const dayStartUtcMs = malaysiaWallToUtcDate(startParts.year, startParts.month, startParts.day, 0, 0, 0, 0).getTime();
    const nextDayStartUtcMs = malaysiaWallToUtcDate(startParts.year, startParts.month, startParts.day + 1, 0, 0, 0, 0).getTime();

    const sliceStartUtcMs = cursorUtcMs;
    const sliceEndUtcMs = Math.min(utcEndMs, nextDayStartUtcMs);
    const totalMinutes = Math.max(0, (sliceEndUtcMs - sliceStartUtcMs) / (1000 * 60));

    const dayOfWeek = startParts.dayOfWeek;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday (0) or Saturday (6)
    const hasStandardHours = !isWeekend; // Weekdays: Monday (1) through Friday (5)

    let regularMinutes = 0;
    let overtimeMinutes = 0;
    let weekdayOvertimeMinutes = 0;
    let weekendOvertimeMinutes = 0;

    if (isWeekend) {
      regularMinutes = 0;
      overtimeMinutes = totalMinutes;
      weekendOvertimeMinutes = totalMinutes;
    } else {
      const windowStartUtcMs = malaysiaWallToUtcDate(
        startParts.year,
        startParts.month,
        startParts.day,
        REGULAR_WORK_START_HOUR,
        0,
        0,
        0
      ).getTime();
      const windowEndUtcMs = malaysiaWallToUtcDate(
        startParts.year,
        startParts.month,
        startParts.day,
        REGULAR_WORK_END_HOUR,
        0,
        0,
        0
      ).getTime();

      const overlapStart = Math.max(sliceStartUtcMs, windowStartUtcMs);
      const overlapEnd = Math.min(sliceEndUtcMs, windowEndUtcMs);
      if (overlapEnd > overlapStart) {
        regularMinutes = (overlapEnd - overlapStart) / (1000 * 60);
      }
      overtimeMinutes = Math.max(0, totalMinutes - regularMinutes);
      weekdayOvertimeMinutes = overtimeMinutes;
    }

    const dateStr = `${startParts.year}-${pad2(startParts.month + 1)}-${pad2(startParts.day)}`;
    const startH = pad2(startParts.hours);
    const startM = pad2(startParts.minutes);

    const endsAtMidnight = sliceEndUtcMs === nextDayStartUtcMs;
    const endParts = getMalaysiaDateParts(sliceEndUtcMs);
    const endTimeFormatted = endsAtMidnight ? '24:00' : `${pad2(endParts.hours)}:${pad2(endParts.minutes)}`;

    const startMinutesInDay = Math.max(0, Math.min(1440, (sliceStartUtcMs - dayStartUtcMs) / (1000 * 60)));
    const endMinutesInDay = Math.max(0, Math.min(1440, (sliceEndUtcMs - dayStartUtcMs) / (1000 * 60)));

    slices.push({
      sliceId: `${meta.sourceId}_${dateStr}_${startH}${startM}`,
      sourceType: meta.sourceType,
      sourceId: meta.sourceId,
      userId: meta.userId,
      userName: meta.userName,
      userRole: meta.userRole,
      dateStr,
      dayOfWeek,
      dayNameFull: DAY_NAMES_FULL[dayOfWeek],
      dayNameShort: DAY_NAMES_SHORT[dayOfWeek],
      isWeekend,
      hasStandardHours,
      dayType: isWeekend ? 'weekend' : 'weekday',
      referenceTitle: meta.referenceTitle,
      referenceDetail: meta.referenceDetail,
      actualStart: new Date(sliceStartUtcMs),
      actualEnd: new Date(sliceEndUtcMs),
      startTimeFormatted: `${startH}:${startM}`,
      endTimeFormatted,
      startMinutesInDay,
      endMinutesInDay,
      totalMinutes,
      regularMinutes,
      overtimeMinutes,
      weekdayOvertimeMinutes,
      weekendOvertimeMinutes,
      notes: meta.notes,
      manualLogId: meta.manualLogId,
      presetId: meta.presetId,
      status: meta.status,
      isNonStudentTask: meta.isNonStudentTask,
      taskCategory: meta.taskCategory,
      studentId: meta.studentId,
      studentName: meta.studentName,
      studentPassport: meta.studentPassport,
      studentPhone: meta.studentPhone,
      studentUniversity: meta.studentUniversity,
      studentPackage: meta.studentPackage,
      nonStudentTitle: meta.nonStudentTitle,
      nonStudentContact: meta.nonStudentContact,
      hotel: meta.hotel,
      subTasks: meta.subTasks,
      feedbackRating: meta.feedbackRating,
      feedbackComment: meta.feedbackComment,
      taskStartedAt: meta.taskStartedAt,
      taskCompletedAt: meta.taskCompletedAt,
      studentCommunicationMedia: meta.studentCommunicationMedia,
    });

    cursorUtcMs = nextDayStartUtcMs;
  }

  return slices;
}
