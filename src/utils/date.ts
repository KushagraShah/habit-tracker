import { format, parseISO } from 'date-fns';

export const DATE_ONLY_FORMAT = 'yyyy-MM-dd';

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function todayLocal(): Date {
  return startOfLocalDay(new Date());
}

export function formatDateOnly(date: Date): string {
  return format(startOfLocalDay(date), DATE_ONLY_FORMAT);
}

export function parseDateOnly(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return startOfLocalDay(parseISO(date));
  return new Date(year, month - 1, day);
}

export function compareDateOnly(a: Date, b: Date): number {
  return startOfLocalDay(a).getTime() - startOfLocalDay(b).getTime();
}

export function isBeforeDateOnly(a: Date, b: Date): boolean {
  return compareDateOnly(a, b) < 0;
}

export function isAfterDateOnly(a: Date, b: Date): boolean {
  return compareDateOnly(a, b) > 0;
}
