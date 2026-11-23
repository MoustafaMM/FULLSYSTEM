import { Timestamp } from 'firebase/firestore';

export function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function fmtDate(v: unknown, withTime = false): string {
  const d = toDate(v);
  if (!d) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export const fmtMoney = (n: number) =>
  'RM ' + Math.round(n || 0).toLocaleString('en-MY');

export const isOverdue = (v: unknown) => {
  const d = toDate(v);
  return !!d && d.getTime() < Date.now();
};
