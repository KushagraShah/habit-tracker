import type { Habit, HabitLog, DayScore } from '../types';
import { isHabitDueOnDate } from '../lib/habits';

/**
 * Scoring:
 * - success = 1 point
 * - partial = 0.5 points
 * - fail = 0 points
 * - unlogged past due = treated as fail (if date >= signupDate)
 * - future dates = ignored
 * - dates before signup = treated as 'none' (no habits yet)
 *
 * Day status:
 * - 'success': all logged habits are success, none missing
 * - 'partial': at least one partial, no fails
 * - 'fail': any single habit is 'fail' or unlogged past due
 * - 'none': no habits due, or all future, or before signup
 */
export function computeDayScore(
  habits: Habit[],
  logs: HabitLog[],
  date: Date,
  today: Date,
  signupDate?: Date | null
): DayScore {
  // Dates before user signed up - ignore entirely
  if (signupDate && date < new Date(signupDate.getFullYear(), signupDate.getMonth(), signupDate.getDate())) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 100, status: 'success' };
  }

  const dueHabits = habits.filter((h) => isHabitDueOnDate(h, date));
  if (dueHabits.length === 0) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 100, status: 'success' };
  }

  const dateStr = date.toISOString().slice(0, 10);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const isPast = date < todayStart;
  const isFuture = date > todayStart;

  let maxScore = 0;
  let achieved = 0;
  let anyFail = false;
  let anyPartial = false;
  let allLogged = true;

  for (const habit of dueHabits) {
    const log = logs.find(
      (l) => l.habit_id === habit.id && l.log_date === dateStr
    );

    if (isFuture) {
      // Future days: only count if logged
      if (log) {
        maxScore += 1;
        achieved += log.status === 'success' ? 1 : log.status === 'partial' ? 0.5 : 0;
        if (log.status === 'fail') anyFail = true;
        if (log.status === 'partial') anyPartial = true;
      }
      // else: skip future unlogged
      continue;
    }

    // Past or today
    if (!log) {
      allLogged = false;
      if (isPast) {
        anyFail = true; // unlogged past = fail
      }
      maxScore += 1; // still counts toward max
      continue;
    }

    maxScore += 1;
    if (log.status === 'success') {
      achieved += 1;
    } else if (log.status === 'partial') {
      achieved += 0.5;
      anyPartial = true;
    } else {
      // fail
      anyFail = true;
    }
  }

  if (maxScore === 0) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 100, status: 'success' };
  }

  const percent = (achieved / maxScore) * 100;

  let status: DayScore['status'];
  if (anyFail) {
    status = 'fail';
  } else if (percent >= 100 && allLogged) {
    status = 'success';
  } else if (anyPartial || !allLogged) {
    status = 'partial';
  } else {
    status = 'success';
  }

  return { total: dueHabits.length, achieved, maxScore, percent, status };
}

export function computeStreak(
  habits: Habit[],
  logs: HabitLog[],
  today: Date,
  signupDate?: Date | null
): number {
  let streak = 0;
  const current = new Date(today);

  for (let i = 0; i < 365; i++) {
    const score = computeDayScore(habits, logs, current, today, signupDate);
    // Before signup: stop the streak (we reached the beginning)
    if (signupDate && current < new Date(signupDate.getFullYear(), signupDate.getMonth(), signupDate.getDate())) {
      break;
    }
    if (score.status === 'none') {
      // No habits due that day - skip it (go further back)
      current.setDate(current.getDate() - 1);
      continue;
    }
    if (score.status === 'fail') break;
    streak++;
    current.setDate(current.getDate() - 1);
  }

  return streak;
}