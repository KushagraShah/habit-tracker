import type { Habit, HabitLog, DayScore } from '../types';
import { isHabitScheduledOnDate } from '../lib/habits';
import { formatDateOnly, startOfLocalDay, parseDateOnly } from './date';

/**
 * Day scoring rules:
 * - before_habits: date is before signup or before any habit start date
 * - future: date is after today
 * - no_habits: no due habits on that date (inside active period)
 * - fail: any due habit is failed OR unlogged (for past/current days)
 * - partial: no fails, at least one partial
 * - success: all due habits successful
 */
export function computeDayScore(
  habits: Habit[],
  logs: HabitLog[],
  date: Date,
  today: Date,
  signupDate?: Date | null
): DayScore {
  const day = startOfLocalDay(date);
  const todayOnly = startOfLocalDay(today);

  if (day > todayOnly) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 0, status: 'future' };
  }

  if (signupDate && day < startOfLocalDay(signupDate)) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 0, status: 'before_habits' };
  }

  const earliestStart = habits.length > 0
    ? startOfLocalDay(new Date(Math.min(...habits.map((h) => parseDateOnly(h.start_date).getTime()))))
    : null;

  if (earliestStart && day < earliestStart) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 0, status: 'before_habits' };
  }

  const dueHabits = habits.filter((h) => isHabitScheduledOnDate(h, day));

  if (dueHabits.length === 0) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 100, status: 'no_habits' };
  }

  const dayStr = formatDateOnly(day);

  let achieved = 0;
  let anyFail = false;
  let anyPartial = false;

  for (const habit of dueHabits) {
    const log = logs.find((l) => l.habit_id === habit.id && l.log_date === dayStr);

    // past/current due habit with no entry = miss
    if (!log) {
      anyFail = true;
      continue;
    }

    if (log.status === 'success') achieved += 1;
    else if (log.status === 'partial') {
      achieved += 0.5;
      anyPartial = true;
    } else {
      anyFail = true;
    }
  }

  const maxScore = dueHabits.length;
  const percent = maxScore > 0 ? (achieved / maxScore) * 100 : 100;

  let status: DayScore['status'];
  if (anyFail) status = 'fail';
  else if (anyPartial) status = 'partial';
  else status = 'success';

  return {
    total: dueHabits.length,
    achieved,
    maxScore,
    percent,
    status,
  };
}

export function isDayPastToday(day: Date, today: Date): boolean {
  return startOfLocalDay(day) < startOfLocalDay(today);
}

export function isDayFuture(day: Date, today: Date): boolean {
  return startOfLocalDay(day) > startOfLocalDay(today);
}

export function isDayToday(day: Date, today: Date): boolean {
  return startOfLocalDay(day).getTime() === startOfLocalDay(today).getTime();
}