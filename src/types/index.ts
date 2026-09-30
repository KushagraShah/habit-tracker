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
  /** Effective-dated button criteria. Kept on the habit because changes are rare. */
  criteria_history: HabitCriteriaVersion[] | null;
  start_date: string;
  end_date: string;
  pause_periods: PausePeriod[] | null;
  pause_until: string | null;
  order_index: number;
  eligible_weekdays: number[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Labels/criteria that apply from effective_date onward (local YYYY-MM-DD). */
export interface HabitCriteriaVersion {
  effective_date: string;
  success_label: string | null;
  partial_label: string | null;
  fail_label: string | null;
}

export type RecurrenceDay =
  | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

/**
 * success / partial = credited work.
 * fail    = you missed it (counts against you).
 * skipped = you deliberately skipped it (no penalty).
 */
export type HabitStatus = 'success' | 'partial' | 'fail' | 'skipped';

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

/** Index = Date#getDay(), i.e. 0 = Sunday. Used for recurrence + eligible_weekdays. */
export const RECURRENCE_BY_WEEKDAY: RecurrenceDay[] = [
  'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'
];

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * How a day looks overall, across the fixed-weekday habits due that day.
 * 'unlogged' is deliberately its own state: forgetting to log is not the same
 * as failing, so it is grey rather than red.
 */
export type DayStatus =
  | 'future'
  | 'before_habits'
  | 'no_habits'
  | 'unlogged'
  | 'partial'
  | 'complete'
  | 'skipped';

export interface DaySummary {
  status: DayStatus;
  /** fixed-weekday habits due on this date */
  due: number;
  done: number;
  partial: number;
  /** explicitly marked as missed */
  failed: number;
  /** deliberately skipped (no penalty) */
  skipped: number;
  /** due - done - partial - failed - skipped */
  notLogged: number;
  /** flexible ("N times per week") logs on this date - informational only */
  flexLogged: number;
  flexDone: number;
  points: number;
  /** points / (done + partial + failed) - how well you did with what you closed out */
  qualityPercent: number;
  /** (done + partial + failed + skipped) / due - how much you actually logged */
  loggingPercent: number;
  headline: string;
  detail: string;
}

/** Per-habit state for a single date, used by the 7-day strips. */
export type HabitDayState =
  | 'not_due'
  | 'not_logged'
  | 'success'
  | 'partial'
  | 'fail'
  | 'skipped';

export interface HabitStats {
  habitId: string;
  title: string;
  emoji: string;
  isFlexible: boolean;
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
  successStreak: number;
  consistencyStreak: number;
  /** last 7 days ending at `to`, oldest first */
  last7: { date: string; state: HabitDayState }[];
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

export interface HabitConsistency {
  habitId: string;
  title: string;
  emoji: string;
  completedCount: number;
  dueCount: number;
}
