import type { Habit, HabitLog, DayScore } from '../types';
import { isHabitDueOnDate } from '../lib/habits';

/**
 * Scoring heuristic:
 * - success = 1 point
 * - partial = 0.5 points
 * - fail = 0 points
 * - unlogged (past, due) = 0 points (treated as fail)
 * - unlogged (future) = not counted
 *
 * Day status:
 * - success: all due habits logged as success (100%)
 * - partial: at least one partial and no fails (>= 50%)
 * - fail: any single habit is 'fail' or unlogged on a past due date
 * - none: no habits due or all future
 */
export function computeDayScore(
  habits: Habit[],
  logs: HabitLog[],
  date: Date,
  today: Date
): DayScore {
  const dueHabits = habits.filter((h) => isHabitDueOnDate(h, date));
  if (dueHabits.length === 0) {
    return { total: 0, achieved: 0, maxScore: 0, percent: 0, status: 'none' };
  }

  const dateStr = date.toISOString().slice(0, 10);
  const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let maxScore = dueHabits.length; // each habit max 1 point
  let achieved = 0;

  for (const habit of dueHabits) {
    const log = logs.find(
      (l) => l.habit_id === habit.id && l.log_date === dateStr
    );
    if (!log) {
      // No log: if past, treat as fail (0); if future, don't count
      if (!isPast) {
        maxScore -= 1; // don't count future unlogged habits
      }
      // else: past unlogged = 0 points (fail), maxScore stays
      continue;
    }
    if (log.status === 'success') achieved += 1;
    else if (log.status === 'partial') achieved += 0.5;
    // fail = 0
  }

  const maxScoreAdjusted = Math.max(maxScore, 1); // avoid division by zero
  const percent = (achieved / maxScoreAdjusted) * 100;

  let status: DayScore['status'];
  if (maxScore === 0) {
    status = 'none';
  } else {
    const anyFail = dueHabits.some((h) => {
      const log = logs.find(
        (l) => l.habit_id === h.id && l.log_date === dateStr
      );
      return (log && log.status === 'fail') || (!log && isPast);
    });
    const anyPartial = dueHabits.some((h) => {
      const log = logs.find(
        (l) => l.habit_id === h.id && l.log_date === dateStr
      );
      return log?.status === 'partial';
    });
    const allLogged = dueHabits.every((h) =>
      logs.some((l) => l.habit_id === h.id && l.log_date === dateStr)
    );

    if (anyFail) {
      status = 'fail';
    } else if (percent >= 100) {
      status = 'success';
    } else if (anyPartial || !allLogged) {
      status = 'partial';
    } else {
      status = 'success';
    }
  }

  return { total: dueHabits.length, achieved, maxScore, percent, status };
}

export function computeStreak(
  habits: Habit[],
  logs: HabitLog[],
  today: Date
): number {
  let streak = 0;
  const current = new Date(today);

  for (let i = 0; i < 365; i++) {
    const score = computeDayScore(habits, logs, current, today);
    if (score.status === 'none') {
      // No habits due that day - skip it
      current.setDate(current.getDate() - 1);
      continue;
    }
    if (score.status === 'fail') break;
    streak++;
    current.setDate(current.getDate() - 1);
  }

  return streak;
}