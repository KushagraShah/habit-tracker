import type { Habit, HabitLog, DayScore } from '../types';
import { isHabitDueOnDate } from '../lib/habits';

function getDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

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
  const day = getDateOnly(date);
  const todayOnly = getDateOnly(today);

  if (day > todayOnly) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 0, status: 'future' };
  }

  if (signupDate && day < getDateOnly(signupDate)) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 0, status: 'before_habits' };
  }

  const earliestStart = habits.length > 0
    ? getDateOnly(new Date(Math.min(...habits.map((h) => new Date(h.start_date).getTime()))))
    : null;

  if (earliestStart && day < earliestStart) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 0, status: 'before_habits' };
  }

  const dueHabits = habits.filter((h) => {
    const start = getDateOnly(new Date(h.start_date));
    const end = getDateOnly(new Date(h.end_date));
    return day >= start && day <= end && isHabitDueOnDate(h, day);
  });

  if (dueHabits.length === 0) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 100, status: 'no_habits' };
  }

  const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;

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
  const percent = (achieved / maxScore) * 100;

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

/**
 * Streak logic:
 * - starts from today, goes backwards
 * - fail breaks streak
 * - success/partial/no_habits all continue streak
 * - before_habits stops evaluation
 */
export function computeStreak(
  habits: Habit[],
  logs: HabitLog[],
  today: Date,
  signupDate?: Date | null
): number {
  let streak = 0;
  const current = getDateOnly(today);

  for (let i = 0; i < 365; i++) {
    const score = computeDayScore(habits, logs, current, today, signupDate);
    if (score.status === 'before_habits') break;
    if (score.status === 'future' || score.status === 'none') {
      current.setDate(current.getDate() - 1);
      continue;
    }
    if (score.status === 'fail') break;

    // success / partial / no_habits -> keep streak alive
    streak++;
    current.setDate(current.getDate() - 1);
  }

  return streak;
}