import type { Habit, HabitLog, DayScore } from '../types';
import { isHabitDueOnDate } from '../lib/habits';

function getDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Scoring:
 * - Each habit has a start_date and end_date defining its active period
 * - 'before_habits': all habits haven't started yet (before earliest start_date)
 * - 'future': date is beyond today (no scoring)
 * - 'no_habits': no habits due on this date (gap day)
 * - Dates in active period: only scored if logged
 * - Streak: consecutive days without fail (skips gap days)
 */
export function computeDayScore(
  habits: Habit[],
  logs: HabitLog[],
  date: Date,
  today: Date,
  signupDate?: Date | null
): DayScore {
  const dateOnly = getDateOnly(date);
  const todayOnly = getDateOnly(today);

  // Before signup — ignore
  if (signupDate && dateOnly < getDateOnly(signupDate)) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 100, status: 'before_habits' };
  }

  // Filter habits that are active on this date (within start-end range + day of week)
  const activeHabits = habits.filter((h) => {
    const start = getDateOnly(new Date(h.start_date));
    const end = getDateOnly(new Date(h.end_date));
    if (dateOnly < start || dateOnly > end) return false;
    return isHabitDueOnDate(h, date);
  });

  // Future dates (beyond today) — show as gray
  if (dateOnly > todayOnly) {
    if (activeHabits.length === 0) return { total: 0, achieved: 0, maxScore: 0, percent: 0, status: 'future' };
    // Show as future even if habits exist
    return { total: 0, achieved: 0, maxScore: 0, percent: 0, status: 'future' };
  }

  // If no active habits due on this date (gap day)
  if (activeHabits.length === 0) {
    // Check if date is within any habit's start-end range at all
    const anyHabitActive = habits.some((h) => {
      const start = getDateOnly(new Date(h.start_date));
      const end = getDateOnly(new Date(h.end_date));
      return dateOnly >= start && dateOnly <= end;
    });
    if (!anyHabitActive) {
      // Date is before any habit started — only return no_habits if we haven't passed today
      const earliestStart = habits.length > 0
        ? getDateOnly(new Date(Math.min(...habits.map((h) => new Date(h.start_date).getTime()))))
        : null;
      if (earliestStart && dateOnly < earliestStart) {
        return { total: 0, achieved: 0, maxScore: 0, percent: 100, status: 'before_habits' };
      }
    }
    return { total: 0, achieved: 0, maxScore: 0, percent: 100, status: 'no_habits' };
  }

  const dateStr = date.toISOString().slice(0, 10);

  let maxScore = 0;
  let achieved = 0;
  let anyFail = false;
  let anyPartial = false;
  let anyLogs = false;

  for (const habit of activeHabits) {
    const log = logs.find(
      (l) => l.habit_id === habit.id && l.log_date === dateStr
    );

    if (log) {
      anyLogs = true;
      maxScore += 1;
      if (log.status === 'success') achieved += 1;
      else if (log.status === 'partial') { achieved += 0.5; anyPartial = true; }
      else anyFail = true;
    }
    // Unlogged past days: we only show no_habits for them (handled below)
  }

  // Nothing logged at all — gap day in active period
  if (!anyLogs) {
    return { total: activeHabits.length, achieved: 0, maxScore: 0, percent: 0, status: 'no_habits' };
  }

  const percent = (achieved / maxScore) * 100;

  let status: DayScore['status'];
  if (anyFail) status = 'fail';
  else if (anyPartial) status = 'partial';
  else if (percent >= 100) status = 'success';
  else status = 'partial';

  return { total: activeHabits.length, achieved, maxScore, percent, status };
}

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
    if (score.status === 'no_habits' || score.status === 'future' || score.status === 'none') {
      current.setDate(current.getDate() - 1);
      continue;
    }
    if (score.status === 'fail') break;
    streak++;
    current.setDate(current.getDate() - 1);
  }

  return streak;
}