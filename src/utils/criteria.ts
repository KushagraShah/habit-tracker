import type { Habit, HabitCriteriaVersion, HabitStatus } from '../types';
import { formatDateOnly } from './date';

export interface HabitCriteria {
  success_label: string | null;
  partial_label: string | null;
  fail_label: string | null;
}

export const DEFAULT_STATUS_LABELS: Record<HabitStatus, string> = {
  success: '✅ Done',
  partial: '🟡 Partial',
  fail: '✖ Miss',
  skipped: '⏭ Skip',
};

function toDateOnly(value: Date | string): string {
  return typeof value === 'string' ? value : formatDateOnly(value);
}

function isCriteriaVersion(value: unknown): value is HabitCriteriaVersion {
  if (!value || typeof value !== 'object') return false;
  const version = value as Record<string, unknown>;
  return (
    typeof version.effective_date === 'string'
    && (typeof version.success_label === 'string' || version.success_label === null)
    && (typeof version.partial_label === 'string' || version.partial_label === null)
    && (typeof version.fail_label === 'string' || version.fail_label === null)
  );
}

/**
 * Old rows do not have criteria_history until the SQL migration is run. Treat
 * their current labels as a baseline so reads stay safe during rollout.
 */
export function getCriteriaHistory(habit: Habit): HabitCriteriaVersion[] {
  const rawHistory = Array.isArray(habit.criteria_history) ? habit.criteria_history : [];
  const versions = rawHistory.filter(isCriteriaVersion);
  if (versions.length > 0) {
    return [...versions].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  }

  return [{
    effective_date: habit.start_date,
    success_label: habit.success_label,
    partial_label: habit.partial_label,
    fail_label: habit.fail_label,
  }];
}

/** Return the criteria that applied on a specific local calendar date. */
export function getHabitCriteriaForDate(habit: Habit, date: Date | string): HabitCriteria {
  const dateOnly = toDateOnly(date);
  const versions = getCriteriaHistory(habit);
  let selected = versions[0];

  for (const version of versions) {
    if (version.effective_date <= dateOnly) selected = version;
    else break;
  }

  return selected ?? {
    success_label: habit.success_label,
    partial_label: habit.partial_label,
    fail_label: habit.fail_label,
  };
}

export function getStatusLabelForDate(
  habit: Habit,
  status: HabitStatus,
  date: Date | string,
): string {
  if (status === 'skipped') return DEFAULT_STATUS_LABELS.skipped;

  const criteria = getHabitCriteriaForDate(habit, date);
  if (status === 'success') return criteria.success_label || DEFAULT_STATUS_LABELS.success;
  if (status === 'partial') return criteria.partial_label || DEFAULT_STATUS_LABELS.partial;
  return criteria.fail_label || DEFAULT_STATUS_LABELS.fail;
}

/**
 * Insert or replace one effective-dated version. A baseline is always kept so
 * dates before the first upgrade retain the standard they originally used.
 */
export function withCriteriaVersion(
  habit: Habit,
  effectiveDate: string,
  criteria: HabitCriteria,
): HabitCriteriaVersion[] {
  const versions = getCriteriaHistory(habit).filter(
    (version) => version.effective_date !== effectiveDate,
  );

  versions.push({ effective_date: effectiveDate, ...criteria });
  return versions.sort((a, b) => a.effective_date.localeCompare(b.effective_date));
}