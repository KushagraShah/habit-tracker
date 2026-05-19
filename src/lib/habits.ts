import type { HabitCreateInput, HabitUpdateInput, RecurrenceDay } from '../types';
import { supabase } from './supabase';
import type { Habit, HabitLog, StreakInfo } from '../types';
import { parseDateOnly, startOfLocalDay, todayLocal } from '../utils/date';
import {
  getHabitStreaks,
  getWeeklyAggregate,
  getWeeklyTrendData,
  isHabitPausedOnDate as scoringIsHabitPausedOnDate,
  isHabitScheduledOnDate as scoringIsHabitScheduledOnDate,
} from '../utils/scoring';

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
  return scoringIsHabitPausedOnDate(habit, date);
}

export function isHabitInDateRange(habit: Habit, date: Date): boolean {
  const day = startOfLocalDay(date);
  const start = parseDateOnly(habit.start_date);
  const end = parseDateOnly(habit.end_date);
  return day >= start && day <= end;
}

export function isHabitScheduledOnDate(habit: Habit, date: Date): boolean {
  return scoringIsHabitScheduledOnDate(habit, date);
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
  return getHabitStreaks(habit, logs, today);
}

/**
 * Compute weekly summary for habits
 */
export function computeWeeklySummary(
  habits: Habit[],
  logs: HabitLog[],
  weekStart: Date,
  _weekEnd: Date,
): { successCount: number; partialCount: number; missCount: number; totalDue: number; scorePercent: number } {
  void _weekEnd;
  const week = getWeeklyAggregate(habits, logs, weekStart, todayLocal());
  return {
    successCount: week.doneCount,
    partialCount: week.partialCount,
    missCount: week.missedCount,
    totalDue: week.dueUnits,
    scorePercent: week.scorePercent,
  };
}

/**
 * Compute weekly scores for trend chart
 */
export function computeWeeklyScores(
  habits: Habit[],
  logs: HabitLog[],
  weeks: Date[],
): { weekStart: Date; score: number | null; dueUnits: number }[] {
  return getWeeklyTrendData(habits, logs, weeks);
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