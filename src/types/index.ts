export type SchedulingType = 'fixed_weekdays' | 'flexible_weekly';

export interface Habit {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  emoji: string;
  recurrence: RecurrenceDay[];
  scheduling_type: SchedulingType;
  weekly_target: number | null;
  success_label: string | null;
  partial_label: string | null;
  fail_label: string | null;
  start_date: string;
  end_date: string;
  pause_periods: PausePeriod[] | null;
  pause_until: string | null;
  sort_order: number;
  order_index: number;
  eligible_weekdays: number[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type RecurrenceDay =
  | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type HabitStatus = 'success' | 'partial' | 'fail';

export interface PausePeriod {
  start: string;
  end?: string | null;
}

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

export type HabitCreateInput = Omit<Habit, 'id' | 'created_at' | 'updated_at'>;

export type HabitUpdateInput = Partial<Omit<Habit, 'id' | 'created_at' | 'user_id'>>;

export const DAYS_OF_WEEK: RecurrenceDay[] = [
  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
];

export interface DayScore {
  total: number;
  achieved: number;
  maxScore: number;
  percent: number;
  status: 'success' | 'partial' | 'fail' | 'none' | 'no_habits' | 'before_habits' | 'future';
}

export type Theme = 'light' | 'dark';

export const EMOJIS = [
  '💪', '🏃', '📚', '🎯', '🧘', '🎨', '✍️', '🏋️',
  '🚴', '🧠', '🌱', '💧', '🥗', '😴', '☀️', '🎵',
  '📝', '🧹', '💻', '📖', '🎮', '🧭', '🎭', '🌍',
  '🐶', '🐱', '🌸', '🍳', '🎧', '📷', '✈️', '🏡',
];

export interface StreakInfo {
  successStreak: number;
  consistencyStreak: number;
}

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  successCount: number;
  partialCount: number;
  missCount: number;
  totalDue: number;
  scorePercent: number;
}

export type DayState =
  | 'due_missed'
  | 'due_done'
  | 'due_partial'
  | 'not_due'
  | 'future'
  | 'before_start'
  | 'after_end'
  | 'paused'
  | 'rest';