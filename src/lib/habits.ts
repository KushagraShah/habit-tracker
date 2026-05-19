import type { HabitCreateInput, HabitUpdateInput, RecurrenceDay } from '../types';
import { supabase } from './supabase';
import type { Habit, HabitLog, StreakInfo } from '../types';
import { formatDateOnly, parseDateOnly, startOfLocalDay, getWeekEnd, todayLocal } from '../utils/date';
import { eachDayOfInterval } from 'date-fns';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function isHabitDueOnDate(habit: Habit, date: Date): boolean {
  if (habit.scheduling_type === 'flexible_weekly') {
    // Flexible weekly habits are due every day (user chooses which days to log)
    return true;
  }
  const dayName = DAY_NAMES[date.getDay()] as RecurrenceDay;
  return habit.recurrence.includes(dayName);
}

export function isHabitPausedOnDate(habit: Habit, date: Date): boolean {
  const day = startOfLocalDay(date);
  // Check explicit pause periods
  const inPausePeriod = (habit.pause_periods ?? []).some((period) => {
    const start = parseDateOnly(period.start);
    const end = period.end ? parseDateOnly(period.end) : null;
    return day >= start && (!end || day <= end);
  });
  if (inPausePeriod) return true;

  // Check pause_until
  if (habit.pause_until) {
    const untilDate = parseDateOnly(habit.pause_until);
    if (day <= untilDate) return true;
  }

  return false;
}

export function isHabitInDateRange(habit: Habit, date: Date): boolean {
  const day = startOfLocalDay(date);
  const start = parseDateOnly(habit.start_date);
  const end = parseDateOnly(habit.end_date);
  return day >= start && day <= end;
}

export function isHabitScheduledOnDate(habit: Habit, date: Date): boolean {
  if (!isHabitInDateRange(habit, date)) return false;
  if (!habit.is_active) return false;
  if (isHabitPausedOnDate(habit, date)) return false;
  return isHabitDueOnDate(habit, date);
}

export function getHabitDayState(habit: Habit, date: Date, log?: HabitLog, today: Date = todayLocal()): string {
  const day = startOfLocalDay(date);
  const todayStart = startOfLocalDay(today);

  if (day > todayStart) return 'future';
  if (day < parseDateOnly(habit.start_date)) return 'before_start';
  if (day > parseDateOnly(habit.end_date)) return 'after_end';

  if (isHabitPausedOnDate(habit, day)) return 'paused';

  const isDue = isHabitDueOnDate(habit, day);
  const isFlexibleWeekly = habit.scheduling_type === 'flexible_weekly';

  if (!isDue && !isFlexibleWeekly) return 'rest';

  if (log) {
    if (log.status === 'success') return 'due_done';
    if (log.status === 'partial') return 'due_partial';
  }

  // Past due day with no log
  if (day < todayStart) {
    if (isFlexibleWeekly) {
      // For flexible weekly, don't mark individual days as missed during the week
      // The week-level evaluation handles misses
      return 'rest';
    }
    return 'due_missed';
  }

  // Current day, due but not logged yet
  return 'rest';
}

/**
 * Compute streaks for a single habit
 */
export function computeHabitStreaks(
  habit: Habit,
  logs: HabitLog[],
  today: Date = todayLocal(),
): StreakInfo {
  let successStreak = 0;
  let consistencyStreak = 0;
  let successBroken = false;
  let consistencyBroken = false;

  const current = startOfLocalDay(today);

  // Start from yesterday. Today shouldn't affect streaks since the day isn't over.
  for (let i = 1; i < 366; i++) {
    const day = new Date(current);
    day.setDate(day.getDate() - i);

    // Check if habit is in date range
    if (day < parseDateOnly(habit.start_date)) break;
    if (day > parseDateOnly(habit.end_date)) continue;

    // Check if paused on this day
    if (isHabitPausedOnDate(habit, day)) continue;

    // For fixed weekdays: skip non-due days
    if (habit.scheduling_type === 'fixed_weekdays' && !isHabitDueOnDate(habit, day)) continue;

    // For flexible weekly: all days are potentially due, but we evaluate at week level
    // For simplicity, treat any day as a potential day for flexible weekly habits
    // The user logs on days they do the habit

    const dateStr = formatDateOnly(day);
    const log = logs.find(l => l.habit_id === habit.id && l.log_date === dateStr);

    if (!log) {
      // For flexible weekly: no log on a day doesn't break streak since evaluation is at week level
      if (habit.scheduling_type === 'flexible_weekly') continue;

      // No log = not done. For streak purposes, this is a break for success streak.
      // For consistency streak, also a break.
      if (!successBroken) {
        successBroken = true;
      }
      if (!consistencyBroken) {
        consistencyBroken = true;
      }
      continue;
    }

    if (log.status === 'success') {
      if (!successBroken) successStreak++;
      if (!consistencyBroken) consistencyStreak++;
    } else if (log.status === 'partial') {
      if (!successBroken) {
        successBroken = true; // Partial breaks success streak
      }
      if (!consistencyBroken) consistencyStreak++; // Partial counts for consistency
    } else {
      // fail
      if (!successBroken) successBroken = true;
      if (!consistencyBroken) consistencyBroken = true;
    }
  }

  return { successStreak, consistencyStreak };
}

/**
 * Compute weekly summary for habits
 */
export function computeWeeklySummary(
  habits: Habit[],
  logs: HabitLog[],
  weekStart: Date,
  weekEnd: Date,
): { successCount: number; partialCount: number; missCount: number; totalDue: number; scorePercent: number } {
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  let successCount = 0;
  let partialCount = 0;
  let missCount = 0;
  let totalDue = 0;
  let totalScore = 0;

  for (const day of weekDays) {
    const dayStr = formatDateOnly(day);

    for (const habit of habits) {
      if (!isHabitInDateRange(habit, day)) continue;
      if (isHabitPausedOnDate(habit, day)) continue;
      if (!habit.is_active) continue;

      if (habit.scheduling_type === 'fixed_weekdays') {
        if (!isHabitDueOnDate(habit, day)) continue;
      }

      // For flexible weekly, all days are potential due days
      // But we only count days where there's a log, or past days
      if (habit.scheduling_type === 'flexible_weekly') {
        // For flexible weekly, we evaluate at week level, not per day
        // Skip day-level counting here; handle below
        continue;
      }

      totalDue++;
      const log = logs.find(l => l.habit_id === habit.id && l.log_date === dayStr);

      if (!log) {
        if (startOfLocalDay(day) < startOfLocalDay(new Date())) {
          missCount++;
          // No score contribution
        }
        // Future/current unlogged days don't count as misses
      } else if (log.status === 'success') {
        successCount++;
        totalScore += 1;
      } else if (log.status === 'partial') {
        partialCount++;
        totalScore += 0.5;
      } else {
        missCount++;
      }
    }
  }

  // Handle flexible weekly habits at week level
  for (const habit of habits) {
    if (habit.scheduling_type !== 'flexible_weekly') continue;
    if (!isHabitInDateRange(habit, weekStart)) continue;
    if (!habit.is_active) continue;

    const target = habit.weekly_target || 1;

    // Count logs for this habit in this week
    const weekLogs = logs.filter(
      l => l.habit_id === habit.id &&
        l.log_date >= formatDateOnly(weekStart) &&
        l.log_date <= formatDateOnly(weekEnd)
    );

    const successLogs = weekLogs.filter(l => l.status === 'success').length;
    const partialLogs = weekLogs.filter(l => l.status === 'partial').length;

    const totalLogScore = successLogs + (partialLogs * 0.5);

    // If the week is over, count missed target slots
    const weekEndDay = startOfLocalDay(weekEnd);
    const isWeekOver = weekEndDay < startOfLocalDay(new Date());

    if (isWeekOver || totalLogScore >= target) {
      totalDue += target;

      const effectiveScore = Math.min(totalLogScore, target);
      totalScore += effectiveScore;

      if (totalLogScore < target) {
        missCount += (target - totalLogScore);
        // Adjust success/partial counts
      }

      successCount += successLogs;
      partialCount += partialLogs;
    } else {
      // Week not over yet, only count what's been done
      totalDue += target;
      totalScore += totalLogScore;
      successCount += successLogs;
      partialCount += partialLogs;
    }
  }

  const scorePercent = totalDue > 0 ? Math.round((totalScore / totalDue) * 100) : 100;

  return { successCount, partialCount, missCount: Math.round(missCount), totalDue, scorePercent };
}

/**
 * Compute weekly scores for trend chart
 */
export function computeWeeklyScores(
  habits: Habit[],
  logs: HabitLog[],
  weeks: Date[],
): { weekStart: Date; score: number }[] {
  return weeks.map(weekStart => {
    const weekEnd = getWeekEnd(weekStart);
    const summary = computeWeeklySummary(habits, logs, weekStart, weekEnd);
    return { weekStart, score: summary.scorePercent };
  });
}

export async function fetchHabits(userId: string): Promise<Habit[]> {
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export async function createHabit(
  habit: HabitCreateInput
): Promise<Habit> {
  const { data, error } = await supabase
    .from('habits')
    .insert(habit)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateHabit(
  id: string,
  updates: HabitUpdateInput
): Promise<Habit> {
  const { data, error } = await supabase
    .from('habits')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHabit(id: string): Promise<void> {
  const { error } = await supabase.from('habits').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchLogs(
  userId: string,
  startDate: string,
  endDate: string
): Promise<HabitLog[]> {
  const { data, error } = await supabase
    .from('habit_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('log_date', startDate)
    .lte('log_date', endDate);
  if (error) throw error;
  return data ?? [];
}

export async function upsertLog(
  habitId: string,
  userId: string,
  logDate: string,
  status: 'success' | 'partial' | 'fail'
): Promise<HabitLog> {
  const { data, error } = await supabase
    .from('habit_logs')
    .upsert(
      {
        habit_id: habitId,
        user_id: userId,
        log_date: logDate,
        status,
      },
      {
        onConflict: 'habit_id, log_date',
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLog(id: string): Promise<void> {
  const { error } = await supabase.from('habit_logs').delete().eq('id', id);
  if (error) throw error;
}