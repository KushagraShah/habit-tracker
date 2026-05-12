import type { Habit, HabitLog, DayScore } from '../types';
import { isHabitDueOnDate } from '../lib/habits';

function getDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Scoring rules:
 * - success = 1pt, partial = 0.5pt, fail = 0pt
 * - A habit only "exists" for scoring from its created_at date onward
 * - Unlogged past dates are NOT auto-failed — we only score what was logged
 * - Future dates are ignored entirely
 * - Day status:
 *   'no_habits': day has no habits due (or all habits didn't exist yet) — shown as neutral/green
 *   'success': all due-and-existing habits were logged as success
 *   'partial': mix of success/partial (or some unlogged past)
 *   'fail': any logged as fail
 *   'none': fallback for empty
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
  const signupOnly = signupDate ? getDateOnly(signupDate) : null;

  // Before signup — ignore
  if (signupOnly && dateOnly < signupOnly) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 100, status: 'no_habits' };
  }

  // Filter habits that existed on this date
  const activeHabits = habits.filter((h) => {
    const habitCreated = getDateOnly(new Date(h.created_at));
    // Habit counts for this date if: the date is >= habit creation date
    // AND the habit is due on this date
    return dateOnly >= habitCreated && isHabitDueOnDate(h, date);
  });

  if (activeHabits.length === 0) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 100, status: 'no_habits' };
  }

  const dateStr = date.toISOString().slice(0, 10);
  const isFuture = dateOnly > todayOnly;

  let maxScore = 0;
  let achieved = 0;
  let anyFail = false;
  let anyPartial = false;
  let anyLogs = false;

  for (const habit of activeHabits) {
    const log = logs.find(
      (l) => l.habit_id === habit.id && l.log_date === dateStr
    );

    // Future days: only count what's logged
    if (isFuture) {
      if (log) {
        maxScore += 1;
        anyLogs = true;
        if (log.status === 'success') achieved += 1;
        else if (log.status === 'partial') { achieved += 0.5; anyPartial = true; }
        else anyFail = true;
      }
      continue;
    }

    // Past or today
    if (log) {
      anyLogs = true;
      maxScore += 1;
      if (log.status === 'success') achieved += 1;
      else if (log.status === 'partial') { achieved += 0.5; anyPartial = true; }
      else anyFail = true;
    }
    // Unlogged past days are NOT counted at all — we don't know the user's intent
  }

  // If nothing was logged at all and this is past/today, treat as 'no_habits' effectively
  if (!anyLogs && !isFuture) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 100, status: 'no_habits' };
  }

  // If nothing counted at all
  if (maxScore === 0) {
    return { total: activeHabits.length, achieved: 0, maxScore: 0, percent: 100, status: 'no_habits' };
  }

  const percent = (achieved / maxScore) * 100;

  let status: DayScore['status'];
  if (anyFail) {
    status = 'fail';
  } else if (anyPartial) {
    status = 'partial';
  } else if (percent >= 100 && anyLogs) {
    status = 'success';
  } else if (!anyLogs) {
    status = 'no_habits';
  } else {
    status = 'partial';
  }

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
    if (signupDate && current < getDateOnly(signupDate)) break;
    if (score.status === 'no_habits' || score.status === 'none') {
      current.setDate(current.getDate() - 1);
      continue;
    }
    if (score.status === 'fail') break;
    streak++;
    current.setDate(current.getDate() - 1);
  }

  return streak;
}