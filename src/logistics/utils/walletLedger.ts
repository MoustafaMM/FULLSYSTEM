import { format } from 'date-fns';

export type LedgerEntryType = 'topup' | 'expense';

export interface BaseLedgerEntry {
  type: LedgerEntryType;
  id: string;
  userId: string;
  amount: number;
  timestamp: string;
  createdAt: string;
}

export interface AccountingLedgerRow<T extends BaseLedgerEntry = BaseLedgerEntry> {
  item: T;
  debit: number | null;
  credit: number | null;
  balance: number;
}

export interface AccountingLedgerResult<T extends BaseLedgerEntry = BaseLedgerEntry> {
  rows: AccountingLedgerRow<T>[];
  openingBalance: number;
  hasOpeningBalanceRow: boolean;
  totalDebit: number;
  totalCredit: number;
  netChange: number;
  endingBalance: number;
}

/**
 * Rounds a number safely to 2 decimal places without -0 or floating-point drift.
 */
export function round2(val: number): number {
  const num = Number(val) || 0;
  const rounded = Math.round((num + (num >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Formats a numeric value with thousands separators and 2 decimal places (e.g. "51,026.00").
 */
export function formatAccountingNumber(val: number): string {
  const safe = round2(val);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

/**
 * Formats an ISO timestamp into YYYY-MM-DD in UTC+8 (Asia/Kuala_Lumpur) for accurate date-range filtering.
 */
export function toDateKeyUTC8(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    try {
      return format(new Date(isoString), 'yyyy-MM-dd');
    } catch {
      return '';
    }
  }
}

/**
 * Formats an ISO timestamp into "YYYY-MM-DD HH:mm:ss" in UTC+8 (Asia/Kuala_Lumpur).
 */
export function formatDateTimeUTC8(isoString?: string): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (type: string) => parts.find(p => p.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
  } catch {
    return isoString;
  }
}

/**
 * Formats a date as "Month D, YYYY" in UTC+8 (e.g. "November 9, 2026").
 */
export function formatAsOfDateUTC8(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kuala_Lumpur',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  } catch {
    return format(date, 'MMMM d, yyyy');
  }
}

/**
 * Sorts ledger items in deterministic chronological ascending order (oldest -> newest).
 */
export function sortEntriesAscending<T extends BaseLedgerEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const tA = new Date(a.timestamp || a.createdAt).getTime();
    const tB = new Date(b.timestamp || b.createdAt).getTime();
    const safeA = Number.isNaN(tA) ? 0 : tA;
    const safeB = Number.isNaN(tB) ? 0 : tB;
    if (safeA !== safeB) return safeA - safeB;
    if (a.type !== b.type) return a.type === 'topup' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export interface BuildAccountingLedgerOptions<T extends BaseLedgerEntry> {
  entries: T[];
  officerId?: string;
  fromDate?: string;
  toDate?: string;
  /**
   * True when a sub-filter that excludes specific transaction types, categories,
   * amounts, or search queries is active. When false, opening balance before
   * `fromDate` is carried forward so the running balance matches the true wallet balance.
   */
  hasSubLedgerFilter?: boolean;
  matchesSubFilters?: (item: T) => boolean;
}

/**
 * Builds an accounting ledger with:
 * - Top-Up -> Debit column (increases running Balance)
 * - Expense -> Credit column (decreases running Balance)
 * - Running Balance column (chronological oldest -> newest)
 * - Total Debit, Total Credit, and Ending Balance
 */
export function buildAccountingLedger<T extends BaseLedgerEntry>({
  entries,
  officerId = 'all',
  fromDate = '',
  toDate = '',
  hasSubLedgerFilter = false,
  matchesSubFilters,
}: BuildAccountingLedgerOptions<T>): AccountingLedgerResult<T> {
  const officerScoped = officerId !== 'all'
    ? entries.filter(item => item.userId === officerId)
    : entries;

  const sortedAsc = sortEntriesAscending(officerScoped);

  let openingBalance = 0;
  const periodEntries: T[] = [];

  for (const item of sortedAsc) {
    const dateKey = toDateKeyUTC8(item.timestamp || item.createdAt);
    const amount = round2(Number(item.amount) || 0);

    if (fromDate) {
      if (!dateKey) continue;
      if (dateKey < fromDate) {
        if (!hasSubLedgerFilter) {
          openingBalance = round2(
            openingBalance + (item.type === 'topup' ? amount : -amount)
          );
        }
        continue;
      }
    }

    if (toDate) {
      if (!dateKey || dateKey > toDate) continue;
    }

    if (hasSubLedgerFilter && matchesSubFilters && !matchesSubFilters(item)) {
      continue;
    }

    periodEntries.push(item);
  }

  let runningBalance = round2(openingBalance);
  let totalDebit = 0;
  let totalCredit = 0;

  const rows: AccountingLedgerRow<T>[] = periodEntries.map(item => {
    const amount = round2(Number(item.amount) || 0);
    if (item.type === 'topup') {
      totalDebit = round2(totalDebit + amount);
      runningBalance = round2(runningBalance + amount);
      return {
        item,
        debit: amount,
        credit: null,
        balance: runningBalance,
      };
    } else {
      totalCredit = round2(totalCredit + amount);
      runningBalance = round2(runningBalance - amount);
      return {
        item,
        debit: null,
        credit: amount,
        balance: runningBalance,
      };
    }
  });

  const netChange = round2(totalDebit - totalCredit);
  const endingBalance = round2(openingBalance + netChange);
  const hasOpeningBalanceRow = Boolean(!hasSubLedgerFilter && fromDate && openingBalance !== 0);

  return {
    rows,
    openingBalance,
    hasOpeningBalanceRow,
    totalDebit,
    totalCredit,
    netChange,
    endingBalance,
  };
}
