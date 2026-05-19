import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';

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

export function compareDateOnly(a: Date, b: Date): boolean {
  return formatDateOnly(a) === formatDateOnly(b);
}

export function isBeforeDateOnly(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() < startOfLocalDay(b).getTime();
}

export function isAfterDateOnly(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() > startOfLocalDay(b).getTime();
}

export function isSameOrBefore(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() <= startOfLocalDay(b).getTime();
}

export function isSameOrAfter(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() >= startOfLocalDay(b).getTime();
}

export function getWeekStart(date: Date): Date {
  return startOfWeek(startOfLocalDay(date), { weekStartsOn: 1 });
}

export function getWeekEnd(date: Date): Date {
  return endOfWeek(startOfLocalDay(date), { weekStartsOn: 1 });
}

export function formatWeekRange(weekStart: Date): string {
  const weekEnd = getWeekEnd(weekStart);
  return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;
}

export function getWeeksBack(date: Date, count: number): Date[] {
  const weeks: Date[] = [];
  let current = getWeekStart(date);
  for (let i = 0; i < count; i++) {
    weeks.unshift(current);
    current = subWeeks(current, 1);
  }
  return weeks;
}