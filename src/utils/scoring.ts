import { addWeeks, eachDayOfInterval, subDays, subWeeks } from 'date-fns';
import type {
  DayStatus,
  DaySummary,
  Habit,
  HabitDayState,
  HabitLog,
  HabitStats,
  HabitStatus,
  StreakInfo,
} from '../types';
import { RECURRENCE_BY_WEEKDAY } from '../types';
import {
  formatDateOnly,
  getWeekEnd,
  getWeekStart,
  parseDateOnly,
  startOfLocalDay,
  todayLocal,
} from './date';

/** How far back streaks and per-habit windows scan. */
const STREAK_LOOKBACK_DAYS = 400;
const STRIP_DAYS = 7;

export function statusPoints(status: HabitStatus): number {
  if (status === 'success') return 1;
  if (status === 'partial') return 0.5;
  return 0;
}

type LogMap = Map<string, HabitLog>;

function toLogMap(logs: HabitLog[]): LogMap {
  const map: LogMap = new Map();
  for (const log of logs) map.set(`${log.habit_id}:${log.log_date}`, log);
  return map;
}

function getLog(logMap: LogMap, habitId: string, date: Date): HabitLog | undefined {
  return logMap.get(`${habitId}:${formatDateOnly(date)}`);
}

function isOpenEndedPause(habit: Habit): boolean {
  return (habit.pause_periods ?? []).some((period) => !period.end);
}

/** True while the date falls inside a pause window (timed pauses included). */
export function isHabitPausedOnDate(habit: Habit, date: Date): boolean {
  const day = startOfLocalDay(date);
  for (const period of habit.pause_periods ?? []) {
    const start = parseDateOnly(period.start);
    const end = period.end ? parseDateOnly(period.end) : null;
    if (day >= start && (!end || day <= end)) return true;
  }
  if (habit.pause_until) return day <= parseDateOnly(habit.pause_until);
  return false;
}

export function isHabitActiveOnDate(habit: Habit, date: Date): boolean {
  const day = startOfLocalDay(date);
  if (day < parseDateOnly(habit.start_date)) return false;
  if (day > parseDateOnly(habit.end_date)) return false;
  if (isHabitPausedOnDate(habit, day)) return false;
  // "Pause indefinitely" records an open-ended pause period, which is the only
  // pause that needs the manual flag. A timed pause ("pause until 12 Oct")
  // therefore auto-resumes once its end date has passed.
  if (!habit.is_active && isOpenEndedPause(habit)) return false;
  return true;
}

/** end_date already passed: the habit will never be due again until extended. */
export function isHabitEnded(habit: Habit, today: Date = todayLocal()): boolean {
  return startOfLocalDay(today) > parseDateOnly(habit.end_date);
}

function isFixedDueOnDate(habit: Habit, date: Date): boolean {
  const dayName = RECURRENCE_BY_WEEKDAY[startOfLocalDay(date).getDay()];
  return habit.recurrence.includes(dayName);
}

export function isHabitScheduledOnDate(habit: Habit, date: Date): boolean {
  if (!isHabitActiveOnDate(habit, date)) return false;
  if (habit.scheduling_type === 'flexible_weekly') {
    if (habit.eligible_weekdays && habit.eligible_weekdays.length > 0) {
      return habit.eligible_weekdays.includes(startOfLocalDay(date).getDay());
    }
    return true;
  }
  return isFixedDueOnDate(habit, date);
}

function isFixedDueAndActive(habit: Habit, date: Date): boolean {
  return isHabitActiveOnDate(habit, date) && isFixedDueOnDate(habit, date);
}

export function getFlexibleTarget(habit: Habit): number {
  return Math.max(1, Math.min(7, habit.weekly_target ?? 1));
}

function countEligibleDays(habit: Habit, days: Date[]): number {
  return days.filter((day) => isHabitScheduledOnDate(habit, day)).length;
}

function getFlexibleTargetFullWeek(habit: Habit, weekStart: Date): number {
  const days = eachDayOfInterval({ start: weekStart, end: getWeekEnd(weekStart) });
  return Math.min(getFlexibleTarget(habit), countEligibleDays(habit, days));
}

/**
 * Points earned inside one week (capped by the caller against the target).
 * Kept separate from getHabitStats so the streak walk and the stats walk do not
 * call each other.
 */
function getFlexibleWeekPoints(habit: Habit, logs: HabitLog[], weekStart: Date, today: Date): number {
  const weekEnd = startOfLocalDay(getWeekEnd(weekStart));
  const todayStart = startOfLocalDay(today);
  const cutoff = weekEnd > todayStart ? todayStart : weekEnd;
  let points = 0;
  for (const log of logs) {
    if (log.habit_id !== habit.id) continue;
    const day = parseDateOnly(log.log_date);
    if (startOfLocalDay(day) < weekStart || startOfLocalDay(day) > cutoff) continue;
    if (!isHabitScheduledOnDate(habit, day)) continue;
    points += statusPoints(log.status);
  }
  return points;
}

export function getHabitDayState(
  habit: Habit,
  log: HabitLog | undefined,
  date: Date,
  today: Date = todayLocal(),
): HabitDayState {
  const day = startOfLocalDay(date);
  if (day > startOfLocalDay(today)) return 'not_due';
  if (!isHabitScheduledOnDate(habit, day)) return 'not_due';
  if (!log) {
    // A flexible habit is never "expected" on a specific day; only a missing
    // fixed-weekday habit counts as not logged.
    return habit.scheduling_type === 'flexible_weekly' ? 'not_due' : 'not_logged';
  }
  return log.status;
}

function emptySummary(status: DayStatus, headline: string, detail: string): DaySummary {
  return {
    status,
    due: 0,
    done: 0,
    partial: 0,
    failed: 0,
    skipped: 0,
    notLogged: 0,
    flexLogged: 0,
    flexDone: 0,
    points: 0,
    qualityPercent: 0,
    loggingPercent: 0,
    headline,
    detail,
  };
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The one place a day's numbers are computed. "Not logged" is tracked
 * separately from "missed" so forgetting to open the app does not read as
 * failure. The daily percentage only covers fixed-weekday habits: flexible
 * ("N times per week") habits are progress toward a weekly target and are
 * reported separately, never mixed into a daily fraction.
 */
export function describeDay(
  habits: Habit[],
  logs: HabitLog[],
  day: Date,
  today: Date = todayLocal(),
  signupDate: Date | null = null,
): DaySummary {
  const date = startOfLocalDay(day);
  const todayStart = startOfLocalDay(today);

  if (date > todayStart) {
    return emptySummary('future', 'Future date', 'Logging opens on the day itself');
  }
  if (signupDate && date < startOfLocalDay(signupDate)) {
    return emptySummary('before_habits', 'Before you started', 'No habits existed on this date');
  }

  const logMap = toLogMap(logs);
  let due = 0;
  let done = 0;
  let partial = 0;
  let failed = 0;
  let skipped = 0;
  let flexLogged = 0;
  let flexDone = 0;

  for (const habit of habits) {
    if (habit.scheduling_type === 'flexible_weekly') {
      if (!isHabitScheduledOnDate(habit, date)) continue;
      const log = getLog(logMap, habit.id, date);
      if (!log) continue;
      flexLogged += 1;
      if (log.status === 'success') flexDone += 1;
      continue;
    }

    if (!isFixedDueAndActive(habit, date)) continue;
    due += 1;

    const log = getLog(logMap, habit.id, date);
    if (!log) continue;
    if (log.status === 'success') done += 1;
    else if (log.status === 'partial') partial += 1;
    else if (log.status === 'skipped') skipped += 1;
    else failed += 1;
  }

  const notLogged = due - done - partial - failed - skipped;
  const points = done + partial * 0.5;
  const engaged = done + partial + failed;
  const closed = engaged + skipped;
  const qualityPercent = engaged > 0 ? Math.round((points / engaged) * 100) : 0;
  const loggingPercent = due > 0 ? Math.round((closed / due) * 100) : 0;

  let status: DayStatus;
  if (due === 0) status = 'no_habits';
  else if (closed === 0) status = 'unlogged';
  else if (closed < due) status = 'partial';
  else if (done + partial === 0) status = 'skipped';
  else status = 'complete';

  const parts: string[] = [];
  if (done > 0) parts.push(`${done} done`);
  if (partial > 0) parts.push(`${partial} partial`);
  if (failed > 0) parts.push(`${failed} missed`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (notLogged > 0) parts.push(`${notLogged} not logged`);

  const headline =
    due === 0
      ? flexLogged > 0
        ? pluralize(flexLogged, 'flexible log')
        : 'Nothing due'
      : `${done + partial} of ${due} logged`;

  return {
    status,
    due,
    done,
    partial,
    failed,
    skipped,
    notLogged,
    flexLogged,
    flexDone,
    points,
    qualityPercent,
    loggingPercent,
    headline,
    detail: parts.join(' · '),
  };
}

export interface WeekAggregate {
  weekStart: string;
  weekEnd: string;
  isCurrentWeek: boolean;
  /** fixed habit-days due so far + flexible targets reachable so far */
  due: number;
  logged: number;
  done: number;
  partial: number;
  failed: number;
  skipped: number;
  notLogged: number;
  points: number;
  /** points / (done + partial + failed) */
  qualityPercent: number;
  /** logged / due */
  loggingPercent: number;
  /** fixed-weekday habits only, for the "x of y logged" line */
  fixedDue: number;
  fixedLogged: number;
  fixedNotLogged: number;
  flexTargetToDate: number;
  flexPoints: number;
  flexLogged: number;
  perHabit: HabitStats[];
}

export interface MonthAggregate {
  due: number;
  logged: number;
  done: number;
  partial: number;
  failed: number;
  skipped: number;
  notLogged: number;
  points: number;
  qualityPercent: number;
  loggingPercent: number;
  /** days where every due habit was closed out */
  daysFullyLogged: number;
}

/**
 * Per-habit numbers for any window: powers the 7-day strips, the at-risk list
 * and the habit cards. Flexible habits only count the weekly target that is
 * actually reachable, so "4x per week" on Monday morning is not 0/4.
 */
export function getHabitStats(
  habit: Habit,
  logs: HabitLog[],
  from: Date,
  to: Date,
  today: Date = todayLocal(),
): HabitStats {
  const start = startOfLocalDay(from);
  const end = startOfLocalDay(to);
  const todayStart = startOfLocalDay(today);
  const logMap = toLogMap(logs);
  const days = eachDayOfInterval({ start, end });
  const isFlexible = habit.scheduling_type === 'flexible_weekly';

  let due = 0;
  let done = 0;
  let partial = 0;
  let failed = 0;
  let skipped = 0;

  for (const day of days) {
    if (day > todayStart) continue;
    if (!isHabitActiveOnDate(habit, day)) continue;

    if (isFlexible) {
      if (!isHabitScheduledOnDate(habit, day)) continue;
      const log = getLog(logMap, habit.id, day);
      if (!log) continue;
      if (log.status === 'success') done += 1;
      else if (log.status === 'partial') partial += 1;
      else if (log.status === 'skipped') skipped += 1;
      else failed += 1;
      continue;
    }

    if (!isFixedDueOnDate(habit, day)) continue;
    due += 1;

    const log = getLog(logMap, habit.id, day);
    if (!log) continue;
    if (log.status === 'success') done += 1;
    else if (log.status === 'partial') partial += 1;
    else if (log.status === 'skipped') skipped += 1;
    else failed += 1;
  }

  if (isFlexible) {
    let weekStart = getWeekStart(start);
    const lastWeekStart = startOfLocalDay(getWeekStart(end));
    while (startOfLocalDay(weekStart) <= lastWeekStart) {
      const weekEnd = getWeekEnd(weekStart);
      const sliceStart = weekStart < start ? start : weekStart;
      const sliceEnd = weekEnd > end ? end : weekEnd;
      const cutoff = sliceEnd > todayStart ? todayStart : sliceEnd;
      if (cutoff >= sliceStart) {
        const sliceDays = eachDayOfInterval({ start: sliceStart, end: cutoff });
        due += Math.min(getFlexibleTarget(habit), countEligibleDays(habit, sliceDays));
      }
      weekStart = addWeeks(weekStart, 1);
    }
  }

  const engaged = done + partial + failed;
  const logged = engaged + skipped;
  const notLogged = Math.max(0, due - logged);
  const points = done + partial * 0.5;

  const stripStart = subDays(end, STRIP_DAYS - 1);
  const last7 = eachDayOfInterval({ start: stripStart, end }).map((day) => ({
    date: formatDateOnly(day),
    state: getHabitDayState(habit, getLog(logMap, habit.id, day), day, today),
  }));

  const streaks = getHabitStreaks(habit, logs, today);

  return {
    habitId: habit.id,
    title: habit.title,
    emoji: habit.emoji || '📋',
    isFlexible,
    due,
    logged,
    done,
    partial,
    failed,
    skipped,
    notLogged,
    points,
    qualityPercent: engaged > 0 ? Math.round((points / engaged) * 100) : 0,
    loggingPercent: due > 0 ? Math.round((logged / due) * 100) : 0,
    successStreak: streaks.successStreak,
    consistencyStreak: streaks.consistencyStreak,
    last7,
  };
}

export function getWeekAggregate(
  habits: Habit[],
  logs: HabitLog[],
  weekStart: Date,
  today: Date = todayLocal(),
): WeekAggregate {
  const weekEnd = getWeekEnd(weekStart);
  const perHabit = habits.map((habit) => getHabitStats(habit, logs, weekStart, weekEnd, today));

  let due = 0;
  let done = 0;
  let partial = 0;
  let failed = 0;
  let skipped = 0;
  let flexTargetToDate = 0;
  let flexPoints = 0;
  let flexLogged = 0;
  let fixedDue = 0;
  let fixedLogged = 0;

  for (const stats of perHabit) {
    due += stats.due;
    done += stats.done;
    partial += stats.partial;
    failed += stats.failed;
    skipped += stats.skipped;
    if (stats.isFlexible) {
      flexTargetToDate += stats.due;
      flexPoints += Math.min(stats.points, stats.due);
      flexLogged += stats.logged;
    } else {
      fixedDue += stats.due;
      fixedLogged += stats.logged;
    }
  }

  const logged = done + partial + failed + skipped;
  const engaged = done + partial + failed;
  const points = done + partial * 0.5;

  return {
    weekStart: formatDateOnly(weekStart),
    weekEnd: formatDateOnly(weekEnd),
    isCurrentWeek: formatDateOnly(getWeekStart(today)) === formatDateOnly(weekStart),
    due,
    logged,
    done,
    partial,
    failed,
    skipped,
    notLogged: Math.max(0, due - logged),
    points,
    qualityPercent: engaged > 0 ? Math.round((points / engaged) * 100) : 0,
    loggingPercent: due > 0 ? Math.round((logged / due) * 100) : 0,
    fixedDue,
    fixedLogged,
    fixedNotLogged: Math.max(0, fixedDue - fixedLogged),
    flexTargetToDate,
    flexPoints,
    flexLogged,
    perHabit,
  };
}

export function getMonthAggregate(
  habits: Habit[],
  logs: HabitLog[],
  monthStart: Date,
  monthEnd: Date,
  today: Date = todayLocal(),
  signupDate: Date | null = null,
): MonthAggregate {
  const todayStart = startOfLocalDay(today);
  const days = eachDayOfInterval({
    start: startOfLocalDay(monthStart),
    end: startOfLocalDay(monthEnd),
  });

  let due = 0;
  let done = 0;
  let partial = 0;
  let failed = 0;
  let skipped = 0;
  let notLogged = 0;
  let points = 0;
  let daysFullyLogged = 0;

  for (const day of days) {
    const summary = describeDay(habits, logs, day, today, signupDate);
    if (summary.status === 'future' || summary.status === 'before_habits') continue;
    if (summary.status === 'complete') daysFullyLogged += 1;
    due += summary.due;
    done += summary.done;
    partial += summary.partial;
    failed += summary.failed;
    skipped += summary.skipped;
    notLogged += summary.notLogged;
    points += summary.points;
  }

  const flexEnd = startOfLocalDay(monthEnd) > todayStart ? todayStart : startOfLocalDay(monthEnd);
  for (const habit of habits) {
    if (habit.scheduling_type !== 'flexible_weekly') continue;
    const stats = getHabitStats(habit, logs, startOfLocalDay(monthStart), flexEnd, today);
    due += stats.due;
    done += stats.done;
    partial += stats.partial;
    failed += stats.failed;
    skipped += stats.skipped;
    notLogged += stats.notLogged;
    points += Math.min(stats.points, stats.due);
  }

  const logged = done + partial + failed + skipped;
  const engaged = done + partial + failed;

  return {
    due,
    logged,
    done,
    partial,
    failed,
    skipped,
    notLogged,
    points,
    qualityPercent: engaged > 0 ? Math.round((points / engaged) * 100) : 0,
    loggingPercent: due > 0 ? Math.round((logged / due) * 100) : 0,
    daysFullyLogged,
  };
}

export function getWeeklyTrendData(
  habits: Habit[],
  logs: HabitLog[],
  weekStarts: Date[],
  today: Date = todayLocal(),
): {
  weekStart: Date;
  score: number | null;
  loggingPercent: number;
  dueUnits: number;
  isCurrentWeek: boolean;
}[] {
  return weekStarts.map((weekStart) => {
    const week = getWeekAggregate(habits, logs, weekStart, today);
    return {
      weekStart,
      score: week.due > 0 ? week.qualityPercent : null,
      loggingPercent: week.loggingPercent,
      dueUnits: week.due,
      isCurrentWeek: week.isCurrentWeek,
    };
  });
}

export function getHabitStreaks(
  habit: Habit,
  logs: HabitLog[],
  today: Date = todayLocal(),
): StreakInfo {
  const todayStart = startOfLocalDay(today);

  if (habit.scheduling_type === 'flexible_weekly') {
    let successStreak = 0;
    let consistencyStreak = 0;
    let successBroken = false;
    let consistencyBroken = false;
    const currentWeekStart = getWeekStart(today);

    for (let i = 1; i <= 52; i++) {
      const weekStart = subWeeks(currentWeekStart, i);
      if (startOfLocalDay(weekStart) < parseDateOnly(habit.start_date)) break;
      const target = getFlexibleTargetFullWeek(habit, weekStart);
      if (target === 0) continue;

      const points = Math.min(getFlexibleWeekPoints(habit, logs, weekStart, today), target);

      if (!successBroken) {
        if (points >= target) successStreak += 1;
        else successBroken = true;
      }
      if (!consistencyBroken) {
        if (points > 0) consistencyStreak += 1;
        else consistencyBroken = true;
      }
      if (successBroken && consistencyBroken) break;
    }

    return { successStreak, consistencyStreak };
  }

  const logMap = toLogMap(logs);
  let successStreak = 0;
  let consistencyStreak = 0;
  let successBroken = false;
  let consistencyBroken = false;

  for (let i = 1; i <= STREAK_LOOKBACK_DAYS; i++) {
    const day = subDays(todayStart, i);
    if (day < parseDateOnly(habit.start_date)) break;
    if (!isHabitActiveOnDate(habit, day)) continue;
    if (!isFixedDueOnDate(habit, day)) continue;

    const log = getLog(logMap, habit.id, day);
    if (!log) {
      successBroken = true;
      consistencyBroken = true;
    } else if (log.status === 'success') {
      if (!successBroken) successStreak += 1;
      if (!consistencyBroken) consistencyStreak += 1;
    } else if (log.status === 'partial') {
      successBroken = true;
      if (!consistencyBroken) consistencyStreak += 1;
    } else if (log.status === 'skipped') {
      // Deliberately skipped: not a success, but not a lapse in engagement.
      successBroken = true;
    } else {
      successBroken = true;
      consistencyBroken = true;
    }

    if (successBroken && consistencyBroken) break;
  }

  return { successStreak, consistencyStreak };
}
