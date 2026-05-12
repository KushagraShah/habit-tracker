export interface Habit {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  emoji: string;
  recurrence: RecurrenceDay[];
  success_label: string | null;
  partial_label: string | null;
  fail_label: string | null;
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

export const DAYS_OF_WEEK: RecurrenceDay[] = [
  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
];

export interface DayScore {
  total: number;
  achieved: number;
  maxScore: number;
  percent: number;
  status: 'success' | 'partial' | 'fail' | 'none' | 'no_habits';
}

export const EMOJIS = [
  '💪', '🏃', '📚', '🎯', '🧘', '🎨', '✍️', '🏋️',
  '🚴', '🧠', '🌱', '💧', '🥗', '😴', '☀️', '🎵',
  '📝', '🧹', '💻', '📖', '🎮', '🧭', '🎭', '🌍',
  '🐶', '🐱', '🌸', '🍳', '🎧', '📷', '✈️', '🏡',
];