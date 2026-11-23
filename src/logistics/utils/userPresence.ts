import { Role, User } from '../types';
import { formatDateDDMMYYYY } from './dateFormat';

export const PRESENCE_ONLINE_THRESHOLD_MS = 10 * 60 * 1000;
export const DEFAULT_INACTIVE_DAYS = 7;

export type UserActivityStatus = 'online' | 'active' | 'inactive' | 'never';

export type UserActivityFilter = 'all' | 'not_using' | 'never' | 'inactive' | 'active' | 'online';

export type UserActivitySort = 'inactive_first' | 'recent_first' | 'name';

export interface UserActivitySummary {
  total: number;
  online: number;
  active: number;
  inactive: number;
  never: number;
  notUsing: number;
}

function parseValidTimestampMs(value?: string | null): number | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Resolves the user's most recent website appearance timestamp (ISO-8601).
 * Picks the newer valid timestamp between `lastSeenAt` and legacy `lastLocation.timestamp`
 * so field officers with existing location telemetry also show accurate activity.
 */
export function getUserLastAppearance(
  user: Pick<User, 'lastSeenAt' | 'lastLocation'>
): string | null {
  const seenMs = parseValidTimestampMs(user.lastSeenAt);
  const locationMs = parseValidTimestampMs(user.lastLocation?.timestamp);

  if (seenMs === null && locationMs === null) {
    return null;
  }
  if (seenMs !== null && (locationMs === null || seenMs >= locationMs)) {
    return new Date(seenMs).toISOString();
  }
  return new Date(locationMs as number).toISOString();
}

/**
 * Classifies a user's website usage status relative to `nowMs` and `inactiveDays`.
 */
export function getUserActivityStatus(
  user: Pick<User, 'lastSeenAt' | 'lastLocation'>,
  nowMs: number = Date.now(),
  inactiveDays: number = DEFAULT_INACTIVE_DAYS
): UserActivityStatus {
  const lastAppearance = getUserLastAppearance(user);
  if (!lastAppearance) {
    return 'never';
  }

  const lastMs = Date.parse(lastAppearance);
  const elapsedMs = Math.max(0, nowMs - lastMs);

  if (elapsedMs <= PRESENCE_ONLINE_THRESHOLD_MS) {
    return 'online';
  }

  const safeInactiveDays = Math.max(1, inactiveDays);
  if (elapsedMs >= safeInactiveDays * 24 * 60 * 60 * 1000) {
    return 'inactive';
  }

  return 'active';
}

/**
 * Returns true when a user either has never appeared on the website or has been
 * inactive for at least `inactiveDays` days.
 */
export function isUserNotUsingWebsite(
  user: Pick<User, 'lastSeenAt' | 'lastLocation'>,
  nowMs: number = Date.now(),
  inactiveDays: number = DEFAULT_INACTIVE_DAYS
): boolean {
  const status = getUserActivityStatus(user, nowMs, inactiveDays);
  return status === 'never' || status === 'inactive';
}

/**
 * Formats an appearance timestamp into a concise, human-readable relative label.
 */
export function formatLastAppearanceRelative(
  isoTimestamp: string | null,
  isArabic: boolean = false,
  nowMs: number = Date.now()
): string {
  const tsMs = parseValidTimestampMs(isoTimestamp);
  if (tsMs === null) {
    return isArabic ? 'لم يظهر أبداً' : 'Never appeared';
  }

  const diffMs = Math.max(0, nowMs - tsMs);
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (minutes < 2) {
    return isArabic ? 'الآن' : 'Just now';
  }
  if (minutes < 60) {
    return isArabic ? `منذ ${minutes} دقيقة` : `${minutes}m ago`;
  }
  if (hours < 24) {
    if (isArabic) {
      return hours === 1 ? 'منذ ساعة' : `منذ ${hours} ساعة`;
    }
    return hours === 1 ? '1h ago' : `${hours}h ago`;
  }
  if (days === 1) {
    return isArabic ? 'أمس' : 'Yesterday';
  }
  if (days < 30) {
    return isArabic ? `منذ ${days} يوم` : `${days}d ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    if (isArabic) {
      return months === 1 ? 'منذ شهر' : `منذ ${months} شهر`;
    }
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }

  const years = Math.floor(days / 365);
  if (isArabic) {
    return years === 1 ? 'منذ سنة' : `منذ ${years} سنة`;
  }
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/**
 * Formats an appearance timestamp as "dd/mm/yyyy HH:mm" in local time.
 */
export function formatLastAppearanceExact(isoTimestamp: string | null): string {
  const tsMs = parseValidTimestampMs(isoTimestamp);
  if (tsMs === null) return '';

  const date = new Date(tsMs);
  const datePart = formatDateDDMMYYYY(date);
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${datePart} ${hours}:${mins}`;
}

/**
 * Aggregates counts of users by website activity status.
 */
export function getUserActivitySummary(
  users: ReadonlyArray<Pick<User, 'lastSeenAt' | 'lastLocation'>>,
  nowMs: number = Date.now(),
  inactiveDays: number = DEFAULT_INACTIVE_DAYS
): UserActivitySummary {
  let online = 0;
  let active = 0;
  let inactive = 0;
  let never = 0;

  for (const user of users) {
    const status = getUserActivityStatus(user, nowMs, inactiveDays);
    if (status === 'online') online += 1;
    else if (status === 'active') active += 1;
    else if (status === 'inactive') inactive += 1;
    else never += 1;
  }

  return {
    total: users.length,
    online,
    active: active + online,
    inactive,
    never,
    notUsing: inactive + never,
  };
}

export interface FilterUsersOptions {
  activityFilter?: UserActivityFilter;
  roleFilter?: 'all' | Role;
  searchTerm?: string;
  sortBy?: UserActivitySort;
  nowMs?: number;
  inactiveDays?: number;
}

/**
 * Filters and sorts staff users by activity status, role, search term, and sort mode.
 */
export function filterAndSortUsersByActivity<T extends User>(
  users: ReadonlyArray<T>,
  options: FilterUsersOptions = {}
): T[] {
  const {
    activityFilter = 'all',
    roleFilter = 'all',
    searchTerm = '',
    sortBy = 'inactive_first',
    nowMs = Date.now(),
    inactiveDays = DEFAULT_INACTIVE_DAYS,
  } = options;

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filtered = users.filter((user) => {
    if (roleFilter !== 'all' && user.role !== roleFilter) {
      return false;
    }

    if (normalizedSearch) {
      const nameMatch = user.name.toLowerCase().includes(normalizedSearch);
      const usernameMatch = (user.username || '').toLowerCase().includes(normalizedSearch);
      if (!nameMatch && !usernameMatch) {
        return false;
      }
    }

    const status = getUserActivityStatus(user, nowMs, inactiveDays);
    switch (activityFilter) {
      case 'not_using':
        return status === 'never' || status === 'inactive';
      case 'never':
        return status === 'never';
      case 'inactive':
        return status === 'inactive';
      case 'active':
        return status === 'active' || status === 'online';
      case 'online':
        return status === 'online';
      case 'all':
      default:
        return true;
    }
  });

  return [...filtered].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }

    const aLast = getUserLastAppearance(a);
    const bLast = getUserLastAppearance(b);
    const aMs = aLast ? Date.parse(aLast) : null;
    const bMs = bLast ? Date.parse(bLast) : null;

    if (sortBy === 'recent_first') {
      if (aMs === null && bMs === null) return a.name.localeCompare(b.name);
      if (aMs === null) return 1;
      if (bMs === null) return -1;
      if (bMs !== aMs) return bMs - aMs;
      return a.name.localeCompare(b.name);
    }

    // Default: 'inactive_first' -> never appeared first, then oldest seen, then newest
    if (aMs === null && bMs === null) return a.name.localeCompare(b.name);
    if (aMs === null) return -1;
    if (bMs === null) return 1;
    if (aMs !== bMs) return aMs - bMs;
    return a.name.localeCompare(b.name);
  });
}
