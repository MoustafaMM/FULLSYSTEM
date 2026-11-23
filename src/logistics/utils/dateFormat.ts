/**
 * Formats a date string (YYYY-MM-DD or ISO-8601 timestamp) or Date object
 * into a strict, device- and locale-independent "dd/mm/yyyy" string.
 *
 * Calendar date strings ("YYYY-MM-DD") are parsed directly without UTC-to-local
 * timezone shifting so they never roll back a day on devices west of UTC.
 */
export function formatDateDDMMYYYY(value?: string | Date | null): string {
  if (!value) return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';

    // Exact YYYY-MM-DD calendar date string (e.g. task.taskDate)
    const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (isoDateMatch) {
      const [, year, month, day] = isoDateMatch;
      return `${day}/${month}/${year}`;
    }

    // Already formatted as dd/mm/yyyy
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      return trimmed;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}
