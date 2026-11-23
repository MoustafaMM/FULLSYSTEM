// The original Logistics sidebar layout is replaced by the Express Tracker shell (src/components/Layout.tsx).
// Only the shared class-name helper is kept here because many Logistics components import it.
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
