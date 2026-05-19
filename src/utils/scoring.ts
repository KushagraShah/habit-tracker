import { eachDayOfInterval } from 'date-fns';
import type { DayScore, Habit, HabitLog, HabitStatus, StreakInfo } from '../types';
import { formatDateOnly, getWeekEnd, getWeekStart, parseDateOnly, startOfLocalDay, todayLocal } from './date';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

type LogMap = Map<string, HabitLog>;

export interface WeeklyAggregate {
  points: number;
  dueUnits: number;
  scorePercent: number;
  doneCount: number;
  partialCount: number;
  missedCount: number;
  remainingTarget: number;
}

export interface MonthlyAggregate {
  points: number;
  dueUnits: number;
  scorePercent: number;
  doneCount: number;
  partialCount: number;
  missedCount: number;
}

export interface DailyAggregate {
  status: 'future' | 'fail' | 'partial' | 'success' | 'no_habits' | 'before_habits';
  doneCount: number;
  partialCount: number;
  missedCount: number;
  points: number;
  dueUnits: number;
  scorePercent: number;
}

function statusPoints(status: HabitStatus): number {
  if (status === 'success') return 1;
  if (status === 'partial') return 0.5;
  return 0;
}

function toLogMap(logs: HabitLog[]): LogMap {
  const map = new Map<string, HabitLog>();
  for (const log of logs) {
    map.set(`${log.habit_id}:${log.log_date}`, log);
  }
  return map;
}

function getLog(logMap: LogMap, habitId: string, date: Date): HabitLog | undefined {
  return logMap.get(`${habitId}:${formatDateOnly(date)}`);
}

export function isHabitPausedOnDate(habit: Habit, date: Date): boolean {
  const day = startOfLocalDay(date);
  for (const period of habit.pause_periods ?? []) {
    const start = parseDateOnly(period.start);
    const end = period.end ? parseDateOnly(period.end) : null;
    if (day >= start && (!end || day <= end)) return true;
  }
  if (habit.pause_until) {
    return day <= parseDateOnly(habit.pause_until);
  }
  return false;
}

export function isHabitActiveOnDate(habit: Habit, date: Date): boolean {
  const day = startOfLocalDay(date);
  if (!habit.is_active) return false;
  if (day < parseDateOnly(habit.start_date)) return false;
  if (day > parseDateOnly(habit.end_date)) return false;
  if (isHabitPausedOnDate(habit, day)) return false;
  return true;
}

function isFixedDueOnDate(habit: Habit, date: Date): boolean {
  const dayName = DAY_NAMES[startOfLocalDay(date).getDay()];
  return habit.recurrence.includes(dayName as never);
}

export function isHabitScheduledOnDate(habit: Habit, date: Date): boolean {
  if (!isHabitActiveOnDate(habit, date)) return false;
  if (habit.scheduling_type === 'flexible_weekly') return true;
  return isFixedDueOnDate(habit, date);
}

function isWeekInHabitRange(habit: Habit, weekStart: Date, weekEnd: Date): boolean {
  const start = parseDateOnly(habit.start_date);
  const end = parseDateOnly(habit.end_date);
  return !(weekEnd < start || weekStart > end);
}

function getFlexibleTarget(habit: Habit): number {
  return Math.max(1, Math.min(7, habit.weekly_target ?? 1));
}

function getFlexibleWeeklyScore(
  habit: Habit,
  logs: HabitLog[],
  weekStart: Date,
): WeeklyAggregate {
  const weekEnd = getWeekEnd(weekStart);
  const target = getFlexibleTarget(habit);

  if (!habit.is_active) {
    return { points: 0, dueUnits: 0, scorePercent: 0, doneCount: 0, partialCount: 0, missedCount: 0, remainingTarget: 0 };
  }

  if (!isWeekInHabitRange(habit, weekStart, weekEnd)) {
    return { points: 0, dueUnits: 0, scorePercent: 0, doneCount: 0, partialCount: 0, missedCount: 0, remainingTarget: 0 };
  }

  const weekLogs = logs.filter((l) => {
    if (l.habit_id !== habit.id) return false;
    const day = parseDateOnly(l.log_date);
    return day >= weekStart && day <= weekEnd && isHabitActiveOnDate(habit, day);
  });

  const doneCount = weekLogs.filter((l) => l.status === 'success').length;
  const partialCount = weekLogs.filter((l) => l.status === 'partial').length;
  const missedCount = weekLogs.filter((l) => l.status === 'fail').length;

  const rawPoints = weekLogs.reduce((sum, l) => sum + statusPoints(l.status), 0);
  const points = Math.min(rawPoints, target);
  const dueUnits = target;
  const scorePercent = dueUnits > 0 ? Math.round((points / dueUnits) * 100) : 0;
  const remainingTarget = Math.max(0, target - rawPoints);

  return { points, dueUnits, scorePercent, doneCount, partialCount, missedCount, remainingTarget };
}

function getFlexibleWeeklyScoreForMonth(
  habit: Habit,
  logs: HabitLog[],
  weekStart: Date,
): WeeklyAggregate {
  return getFlexibleWeeklyScore(habit, logs, weekStart);
}

function getFixedDueEntryScore(
  log: HabitLog | undefined,
  day: Date,
  today: Date,
): { points: number; dueUnits: number; done: number; partial: number; missed: number } {
  const dayStart = startOfLocalDay(day);
  const todayStart = startOfLocalDay(today);
  const isFuture = dayStart > todayStart;
  if (isFuture) return { points: 0, dueUnits: 0, done: 0, partial: 0, missed: 0 };

  if (!log) {
    return { points: 0, dueUnits: 1, done: 0, partial: 0, missed: 1 };
  }

  if (log.status === 'success') return { points: 1, dueUnits: 1, done: 1, partial: 0, missed: 0 };
  if (log.status === 'partial') return { points: 0.5, dueUnits: 1, done: 0, partial: 1, missed: 0 };
  return { points: 0, dueUnits: 1, done: 0, partial: 0, missed: 1 };
}

export function getWeeklyAggregate(
  habits: Habit[],
  logs: HabitLog[],
  weekStart: Date,
  today: Date = todayLocal(),
): WeeklyAggregate {
  const weekEnd = getWeekEnd(weekStart);
  const logMap = toLogMap(logs);
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  let points = 0;
  let dueUnits = 0;
  let doneCount = 0;
  let partialCount = 0;
  let missedCount = 0;
  let remainingTarget = 0;

  for (const habit of habits) {
    if (habit.scheduling_type === 'flexible_weekly') {
      const flex = getFlexibleWeeklyScore(habit, logs, weekStart);
      points += flex.points;
      dueUnits += flex.dueUnits;
      doneCount += flex.doneCount;
      partialCount += flex.partialCount;
      missedCount += flex.missedCount; // explicit misses only
      remainingTarget += flex.remainingTarget;
      continue;
    }

    for (const day of weekDays) {
      if (!isHabitActiveOnDate(habit, day)) continue;
      if (!isFixedDueOnDate(habit, day)) continue;
      const log = getLog(logMap, habit.id, day);
      const score = getFixedDueEntryScore(log, day, today);
      points += score.points;
      dueUnits += score.dueUnits;
      doneCount += score.done;
      partialCount += score.partial;
      missedCount += score.missed;
    }
  }

  const scorePercent = dueUnits > 0 ? Math.round((points / dueUnits) * 100) : 0;
  return { points, dueUnits, scorePercent, doneCount, partialCount, missedCount, remainingTarget };
}

export function getDailyAggregate(
  habits: Habit[],
  logs: HabitLog[],
  day: Date,
  today: Date = todayLocal(),
  signupDate?: Date | null,
): DailyAggregate {
  const current = startOfLocalDay(day);
  const todayStart = startOfLocalDay(today);

  if (current > todayStart) {
    return { status: 'future', doneCount: 0, partialCount: 0, missedCount: 0, points: 0, dueUnits: 0, scorePercent: 0 };
  }

  if (signupDate && current < startOfLocalDay(signupDate)) {
    return { status: 'before_habits', doneCount: 0, partialCount: 0, missedCount: 0, points: 0, dueUnits: 0, scorePercent: 0 };
  }

  const logMap = toLogMap(logs);
  let points = 0;
  let dueUnits = 0;
  let doneCount = 0;
  let partialCount = 0;
  let missedCount = 0;

  for (const habit of habits) {
    if (habit.scheduling_type === 'flexible_weekly') {
      // flexible contributes only if there is an explicit log on this date
      if (!isHabitActiveOnDate(habit, current)) continue;
      const log = getLog(logMap, habit.id, current);
      if (!log) continue;
      dueUnits += 1;
      points += statusPoints(log.status);
      if (log.status === 'success') doneCount += 1;
      else if (log.status === 'partial') partialCount += 1;
      else missedCount += 1;
      continue;
    }

    if (!isHabitActiveOnDate(habit, current)) continue;
    if (!isFixedDueOnDate(habit, current)) continue;
    const log = getLog(logMap, habit.id, current);
    const score = getFixedDueEntryScore(log, current, todayStart);
    points += score.points;
    dueUnits += score.dueUnits;
    doneCount += score.done;
    partialCount += score.partial;
    missedCount += score.missed;
  }

  if (dueUnits === 0) {
    return { status: 'no_habits', doneCount: 0, partialCount: 0, missedCount: 0, points: 0, dueUnits: 0, scorePercent: 0 };
  }

  let status: DailyAggregate['status'] = 'success';
  if (missedCount > 0) status = 'fail';
  else if (partialCount > 0) status = 'partial';

  return {
    status,
    doneCount,
    partialCount,
    missedCount,
    points,
    dueUnits,
    scorePercent: Math.round((points / dueUnits) * 100),
  };
}

export function getWeeklyTrendData(
  habits: Habit[],
  logs: HabitLog[],
  weekStarts: Date[],
  today: Date = todayLocal(),
): { weekStart: Date; score: number | null; dueUnits: number }[] {
  return weekStarts.map((weekStart) => {
    const week = getWeeklyAggregate(habits, logs, weekStart, today);
    if (week.dueUnits === 0) {
      return { weekStart, score: null, dueUnits: 0 };
    }
    return { weekStart, score: week.scorePercent, dueUnits: week.dueUnits };
  });
}

export function getMonthlyAggregate(
  habits: Habit[],
  logs: HabitLog[],
  monthStart: Date,
  monthEnd: Date,
  today: Date = todayLocal(),
): MonthlyAggregate {
  const logMap = toLogMap(logs);
  let points = 0;
  let dueUnits = 0;
  let doneCount = 0;
  let partialCount = 0;
  let missedCount = 0;

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Fixed weekday habits: day-level due entries in month
  for (const habit of habits) {
    if (habit.scheduling_type !== 'fixed_weekdays') continue;
    for (const day of days) {
      if (!isHabitActiveOnDate(habit, day)) continue;
      if (!isFixedDueOnDate(habit, day)) continue;
      const log = getLog(logMap, habit.id, day);
      const score = getFixedDueEntryScore(log, day, today);
      points += score.points;
      dueUnits += score.dueUnits;
      doneCount += score.done;
      partialCount += score.partial;
      missedCount += score.missed;
    }
  }

  // Flexible weekly habits: denominator by week-start-in-month rule
  const weekStartsInMonth: Date[] = [];
  for (const day of days) {
    const ws = getWeekStart(day);
    const key = formatDateOnly(ws);
    if (!weekStartsInMonth.some((d) => formatDateOnly(d) === key) && ws >= monthStart && ws <= monthEnd) {
      weekStartsInMonth.push(ws);
    }
  }

  for (const habit of habits) {
    if (habit.scheduling_type !== 'flexible_weekly') continue;

    // entry counts (tracked logs this month)
    for (const day of days) {
      if (!isHabitActiveOnDate(habit, day)) continue;
      const log = getLog(logMap, habit.id, day);
      if (!log) continue;
      if (log.status === 'success') doneCount++;
      else if (log.status === 'partial') partialCount++;
      else missedCount++;
    }

    // denominator/points by week targets
    for (const weekStart of weekStartsInMonth) {
      const week = getFlexibleWeeklyScoreForMonth(habit, logs, weekStart);
      points += week.points;
      dueUnits += week.dueUnits;
    }
  }

  return {
    points,
    dueUnits,
    scorePercent: dueUnits > 0 ? Math.round((points / dueUnits) * 100) : 0,
    doneCount,
    partialCount,
    missedCount,
  };
}

export function computeDayScore(
  habits: Habit[],
  logs: HabitLog[],
  date: Date,
  today: Date,
  signupDate?: Date | null,
): DayScore {
  const day = getDailyAggregate(habits, logs, date, today, signupDate);
  return {
    total: day.dueUnits,
    achieved: day.points,
    maxScore: day.dueUnits,
    percent: day.scorePercent,
    status: day.status,
  };
}

export function getHabitStreaks(
  habit: Habit,
  logs: HabitLog[],
  today: Date = todayLocal(),
): StreakInfo {
  if (habit.scheduling_type === 'flexible_weekly') {
    // Week-level streaks for flexible weekly habits
    let successStreak = 0;
    let consistencyStreak = 0;
    let successBroken = false;
    let consistencyBroken = false;

    const currentWeekStart = getWeekStart(today);
    for (let i = 0; i < 52; i++) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const isCurrentWeek = formatDateOnly(weekStart) === formatDateOnly(currentWeekStart);
      const week = getFlexibleWeeklyScore(habit, logs, weekStart);

      if (week.dueUnits === 0) continue;

      if (isCurrentWeek) {
        if (!successBroken && week.scorePercent === 100) successStreak++;
        if (!consistencyBroken && week.points > 0) consistencyStreak++;
        continue;
      }

      if (!successBroken) {
        if (week.scorePercent === 100) successStreak++;
        else successBroken = true;
      }

      if (!consistencyBroken) {
        if (week.points > 0) consistencyStreak++;
        else consistencyBroken = true;
      }
    }

    return { successStreak, consistencyStreak };
  }

  // Fixed weekday: due-day streaks
  let successStreak = 0;
  let consistencyStreak = 0;
  let successBroken = false;
  let consistencyBroken = false;
  const logMap = toLogMap(logs);
  const current = startOfLocalDay(today);

  for (let i = 1; i < 366; i++) {
    const day = new Date(current);
    day.setDate(day.getDate() - i);

    if (!isHabitActiveOnDate(habit, day)) {
      const d = startOfLocalDay(day);
      if (d < parseDateOnly(habit.start_date)) break;
      continue;
    }
    if (!isFixedDueOnDate(habit, day)) continue;

    const log = getLog(logMap, habit.id, day);

    if (!log) {
      if (!successBroken) successBroken = true;
      if (!consistencyBroken) consistencyBroken = true;
      continue;
    }

    if (log.status === 'success') {
      if (!successBroken) successStreak++;
      if (!consistencyBroken) consistencyStreak++;
    } else if (log.status === 'partial') {
      if (!successBroken) successBroken = true;
      if (!consistencyBroken) consistencyStreak++;
    } else {
      if (!successBroken) successBroken = true;
      if (!consistencyBroken) consistencyBroken = true;
    }
  }

  return { successStreak, consistencyStreak };
}