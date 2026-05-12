import type { HabitCreateInput, HabitUpdateInput, RecurrenceDay } from '../types';
import { supabase } from './supabase';
import type { Habit, HabitLog } from '../types';
import { parseDateOnly, startOfLocalDay } from '../utils/date';

export function isHabitDueOnDate(habit: Habit, date: Date): boolean {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = dayNames[date.getDay()] as RecurrenceDay;
  return habit.recurrence.includes(dayName);
}

export function isHabitPausedOnDate(habit: Habit, date: Date): boolean {
  const day = startOfLocalDay(date);
  return (habit.pause_periods ?? []).some((period) => {
    const start = parseDateOnly(period.start);
    const end = period.end ? parseDateOnly(period.end) : null;
    return day >= start && (!end || day <= end);
  });
}

export function isHabitScheduledOnDate(habit: Habit, date: Date): boolean {
  const day = startOfLocalDay(date);
  const start = parseDateOnly(habit.start_date);
  const end = parseDateOnly(habit.end_date);
  return day >= start && day <= end && isHabitDueOnDate(habit, day) && !isHabitPausedOnDate(habit, day);
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