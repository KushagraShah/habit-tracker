import type { HabitCreateInput, HabitUpdateInput } from '../types';
import { supabase } from './supabase';
import type { Habit, HabitLog, StreakInfo } from '../types';
import { todayLocal } from '../utils/date';
import {
  getHabitStreaks,
  isHabitScheduledOnDate as scoringIsHabitScheduledOnDate,
} from '../utils/scoring';

export function isHabitScheduledOnDate(habit: Habit, date: Date): boolean {
  return scoringIsHabitScheduledOnDate(habit, date);
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

export async function fetchAllLogs(userId: string): Promise<HabitLog[]> {
  const { data, error } = await supabase
    .from('habit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('log_date', { ascending: true });
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