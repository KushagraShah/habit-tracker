export interface Habit {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  recurrence: RecurrenceDay[];
  success_criteria: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type RecurrenceDay =
  | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type HabitStatus = 'success' | 'partial' | 'fail';

export interface HabitLog {
  id: string;
  habit_id: string;
  user_id: string;
  log_date: string;
  status: HabitStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface HabitWithLog extends Habit {
  todayLog?: HabitLog | null;
}

export const DAYS_OF_WEEK: RecurrenceDay[] = [
  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
];

export const STATUS_LABELS: Record<HabitStatus, string> = {
  success: '✅ Done',
  partial: '🟡 Partial',
  fail: '❌ Missed',
};