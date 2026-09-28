import type {
  Habit,
  HabitCreateInput,
  HabitLog,
  HabitStatus,
  HabitUpdateInput,
  StreakInfo,
} from '../types';
import { supabase } from './supabase';
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
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
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

/**
 * Move a habit one slot up (-1) or down (+1).
 *
 * Primary path is the atomic `move_habit` RPC (one transaction, renumbers the
 * whole list). If that function has not been deployed yet, we fall back to a
 * two-pass client renumber. The temporary indexes are above the current maximum
 * so each write remains valid even when the unique ordering constraint exists.
 */
export async function moveHabit(
  userId: string,
  habitId: string,
  direction: -1 | 1,
): Promise<void> {
  const { error } = await supabase.rpc('move_habit', {
    p_habit_id: habitId,
    p_direction: direction,
  });
  if (!error) return;

  const habits = await fetchHabits(userId);
  const index = habits.findIndex((habit) => habit.id === habitId);
  if (index === -1) throw error;

  const target = index + direction;
  if (target < 0 || target >= habits.length) return;

  const reordered = [...habits];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(target, 0, moved);

  const maxOrderIndex = Math.max(...habits.map((habit) => habit.order_index ?? 0));
  const temporaryStart = maxOrderIndex + habits.length + 1;

  // Avoid transient duplicate slots. Updating directly to 0..n-1 can collide
  // with an item that has not been moved yet, because each client request is a
  // separate database transaction.
  for (let i = 0; i < reordered.length; i += 1) {
    const { error: temporaryUpdateError } = await supabase
      .from('habits')
      .update({ order_index: temporaryStart + i })
      .eq('id', reordered[i].id)
      .eq('user_id', userId);
    if (temporaryUpdateError) throw temporaryUpdateError;
  }

  for (let i = 0; i < reordered.length; i += 1) {
    const { error: updateError } = await supabase
      .from('habits')
      .update({ order_index: i })
      .eq('id', reordered[i].id)
      .eq('user_id', userId);
    if (updateError) throw updateError;
  }
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

/** Supabase returns at most 1000 rows per request, so long windows are paged. */
const LOG_PAGE_SIZE = 1000;

export async function fetchLogs(
  userId: string,
  startDate: string,
  endDate: string
): Promise<HabitLog[]> {
  const rows: HabitLog[] = [];
  for (let offset = 0; ; offset += LOG_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('habit_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('log_date', startDate)
      .lte('log_date', endDate)
      .order('log_date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + LOG_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < LOG_PAGE_SIZE) break;
  }
  return rows;
}

export async function fetchAllLogs(userId: string): Promise<HabitLog[]> {
  const rows: HabitLog[] = [];
  for (let offset = 0; ; offset += LOG_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('habit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('log_date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + LOG_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < LOG_PAGE_SIZE) break;
  }
  return rows;
}

export async function upsertLog(
  habitId: string,
  userId: string,
  logDate: string,
  status: HabitStatus,
  note?: string | null,
): Promise<HabitLog> {
  const { data, error } = await supabase
    .from('habit_logs')
    .upsert(
      {
        habit_id: habitId,
        user_id: userId,
        log_date: logDate,
        status,
        ...(note === undefined ? {} : { note: note?.trim() ? note.trim() : null }),
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

export interface LogWrite {
  habit_id: string;
  user_id: string;
  log_date: string;
  status: HabitStatus;
}

/** Batch write, used by "mark all remaining as done". */
export async function upsertLogs(entries: LogWrite[]): Promise<HabitLog[]> {
  if (entries.length === 0) return [];
  const { data, error } = await supabase
    .from('habit_logs')
    .upsert(entries, { onConflict: 'habit_id, log_date', ignoreDuplicates: false })
    .select();
  if (error) throw error;
  return data ?? [];
}

export async function updateLogNote(logId: string, note: string | null): Promise<HabitLog> {
  const { data, error } = await supabase
    .from('habit_logs')
    .update({ note: note?.trim() ? note.trim() : null })
    .eq('id', logId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLog(id: string): Promise<void> {
  const { error } = await supabase.from('habit_logs').delete().eq('id', id);
  if (error) throw error;
}