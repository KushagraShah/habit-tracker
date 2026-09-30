import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addDays, format, subDays } from 'date-fns';
import { useAuth } from '../contexts/useAuth';
import {
  deleteLog,
  fetchHabits,
  fetchLogs,
  upsertLog,
  upsertLogs,
  updateLogNote,
  type LogWrite,
} from '../lib/habits';
import {
  describeDay,
  getHabitDayState,
  getHabitStats,
  getWeekAggregate,
  isHabitScheduledOnDate,
} from '../utils/scoring';
import type { DayStatus, DaySummary, Habit, HabitDayState, HabitLog, HabitStatus } from '../types';
import {
  formatDateOnly,
  getWeekStart,
  isAfterDateOnly,
  isBeforeDateOnly,
  parseDateOnly,
  todayLocal,
} from '../utils/date';
import { getStatusLabelForDate } from '../utils/criteria';

const DAYS_IN_STRIP = 7;
const BACKLOG_DAYS = 7;
/** Logs are loaded once for this window: strips, backlog and streaks all use it. */
const LOG_WINDOW_DAYS = 400;

const STATUS_CYCLE: HabitStatus[] = ['success', 'partial', 'skipped', 'fail'];

const STATUS_META: Record<HabitStatus, { icon: string; active: string; idle: string }> = {
  success: {
    icon: '✅',
    active:
      'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 ring-2 ring-green-400',
    idle: 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
  },
  partial: {
    icon: '🟡',
    active:
      'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 ring-2 ring-amber-400',
    idle: 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
  },
  fail: {
    icon: '✖',
    active: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 ring-2 ring-red-400',
    idle: 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
  },
  skipped: {
    icon: '⏭',
    active:
      'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 ring-2 ring-slate-400',
    idle: 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700',
  },
};

const DAY_STATUS_STYLES: Record<DayStatus, { label: string; text: string; bar: string }> = {
  complete: { label: 'everything logged', text: 'text-green-600 dark:text-green-400', bar: 'bg-green-500' },
  partial: { label: 'partly logged', text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
  unlogged: { label: 'nothing logged yet', text: 'text-gray-400', bar: 'bg-gray-300 dark:bg-gray-600' },
  skipped: { label: 'skipped', text: 'text-rose-600 dark:text-rose-400', bar: 'bg-rose-400' },
  no_habits: { label: 'nothing due', text: 'text-gray-400', bar: 'bg-gray-300 dark:bg-gray-600' },
  before_habits: { label: 'before you started', text: 'text-gray-400', bar: 'bg-gray-300 dark:bg-gray-600' },
  future: { label: 'future date', text: 'text-gray-400', bar: 'bg-gray-300 dark:bg-gray-600' },
};

const GRID_CELLS: Record<HabitDayState, { className: string; glyph: string }> = {
  success: { className: 'bg-green-500 text-white', glyph: '✓' },
  partial: { className: 'bg-amber-400 text-white', glyph: '½' },
  fail: { className: 'bg-red-500 text-white', glyph: '✖' },
  skipped: { className: 'bg-slate-400 text-white', glyph: '⏭' },
  not_logged: {
    className: 'bg-gray-100 dark:bg-gray-800 text-gray-400 border border-dashed border-gray-300 dark:border-gray-600',
    glyph: '·',
  },
  not_due: { className: 'bg-transparent text-gray-200 dark:text-gray-700', glyph: '' },
};

const HABIT_STATE_LABELS: Record<HabitDayState, string> = {
  success: 'done',
  partial: 'partial',
  fail: 'missed',
  skipped: 'skipped',
  not_logged: 'not logged',
  not_due: 'not scheduled',
};

const STRIP_COLORS: Record<HabitDayState, string> = {
  success: 'bg-green-500',
  partial: 'bg-amber-400',
  fail: 'bg-red-500',
  skipped: 'bg-slate-400',
  not_logged: 'bg-gray-200 dark:bg-gray-700',
  not_due: 'bg-gray-100 dark:bg-gray-800',
};

function getRouteDate(routeDate?: string): Date {
  if (!routeDate) return todayLocal();
  const parsed = parseDateOnly(routeDate);
  return Number.isNaN(parsed.getTime()) ? todayLocal() : parsed;
}

function nextStatus(current: HabitStatus | undefined): HabitStatus | null {
  if (!current) return 'success';
  const index = STATUS_CYCLE.indexOf(current);
  return index === STATUS_CYCLE.length - 1 ? null : STATUS_CYCLE[index + 1];
}

function performanceStyle(score: number): { text: string; bar: string } {
  if (score >= 80) return { text: 'text-green-600 dark:text-green-400', bar: 'bg-green-500' };
  if (score >= 50) return { text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' };
  return { text: 'text-red-600 dark:text-red-400', bar: 'bg-red-500' };
}

/** Small day-strip bars use the same outcome performance as the main card. */
function dayStripBar(summary: DaySummary): string {
  if (summary.status === 'future') return 'bg-transparent';
  if (summary.status === 'before_habits' || summary.status === 'no_habits') return 'bg-gray-300 dark:bg-gray-600';

  const scored = summary.done + summary.partial + summary.failed;
  if (scored > 0) return performanceStyle(summary.qualityPercent).bar;
  if (summary.skipped > 0 && summary.notLogged === 0) return 'bg-slate-400';
  return 'bg-gray-300 dark:bg-gray-600';
}

function dayStripLabel(summary: DaySummary): string {
  if (summary.status === 'future' || summary.status === 'before_habits' || summary.status === 'no_habits') {
    return DAY_STATUS_STYLES[summary.status].label;
  }

  const scored = summary.done + summary.partial + summary.failed;
  if (scored > 0) return `${summary.qualityPercent}% performance`;
  if (summary.skipped > 0 && summary.notLogged === 0) return 'only skipped (neutral)';
  return 'no scored outcomes yet';
}

interface UndoEntry {
  habitId: string;
  habitTitle: string;
  logDate: string;
  previous: HabitLog | undefined;
}

export default function TodayPage() {
  const { user, signupDate } = useAuth();
  const navigate = useNavigate();
  const { date: routeDate } = useParams();

  const [today] = useState(() => todayLocal());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [undo, setUndo] = useState<UndoEntry | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() =>
    localStorage.getItem('habit-tracker-today-view') === 'grid' ? 'grid' : 'list'
  );

  const viewDate = getRouteDate(routeDate);
  const dateStr = formatDateOnly(viewDate);
  const isPast = isBeforeDateOnly(viewDate, today);
  const isFuture = isAfterDateOnly(viewDate, today);
  const weekStart = getWeekStart(today);

  useEffect(() => {
    localStorage.setItem('habit-tracker-today-view', viewMode);
  }, [viewMode]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      // One window powers the strips, the backlog nudge and the streaks.
      const from = formatDateOnly(subDays(today, LOG_WINDOW_DAYS - 1));
      const [habitsData, logsData] = await Promise.all([
        fetchHabits(user.id),
        fetchLogs(user.id, from, formatDateOnly(today)),
      ]);
      setHabits(habitsData);
      setLogs(logsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your habits');
    } finally {
      setLoading(false);
    }
  }, [today, user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const logLookup = useMemo(() => {
    const map = new Map<string, HabitLog>();
    for (const log of logs) map.set(`${log.habit_id}:${log.log_date}`, log);
    return map;
  }, [logs]);

  const getLogFor = useCallback(
    (habitId: string, date: string) => logLookup.get(`${habitId}:${date}`),
    [logLookup]
  );

  const dueHabits = useMemo(
    () => habits.filter((habit) => isHabitScheduledOnDate(habit, viewDate)),
    [habits, viewDate]
  );

  const daySummary = useMemo(
    () => describeDay(habits, logs, viewDate, today, signupDate),
    [habits, logs, viewDate, today, signupDate]
  );

  const weekSummary = useMemo(
    () => getWeekAggregate(habits, logs, weekStart, today),
    [habits, logs, weekStart, today]
  );

  const habitStats = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getHabitStats>>();
    const from = subDays(today, 29);
    for (const habit of habits) {
      map.set(habit.id, getHabitStats(habit, logs, from, today, today));
    }
    return map;
  }, [habits, logs, today]);

  const stripDays = useMemo(
    () =>
      Array.from({ length: DAYS_IN_STRIP }, (_, index) =>
        subDays(viewDate, DAYS_IN_STRIP - 1 - index)
      ),
    [viewDate]
  );

  // Recent days that still have unlogged habits: the "you forgot" nudge.
  const backlog = useMemo(() => {
    if (loading) return [];
    const rows: { date: Date; dateStr: string; notLogged: number; due: number }[] = [];
    for (let i = 1; i <= BACKLOG_DAYS; i += 1) {
      const day = subDays(today, i);
      const summary = describeDay(habits, logs, day, today, signupDate);
      if (summary.due > 0 && summary.notLogged > 0) {
        rows.push({
          date: day,
          dateStr: formatDateOnly(day),
          notLogged: summary.notLogged,
          due: summary.due,
        });
      }
    }
    return rows;
  }, [habits, logs, loading, signupDate, today]);

  const remaining = useMemo(
    () => dueHabits.filter((habit) => !getLogFor(habit.id, dateStr)),
    [dueHabits, dateStr, getLogFor]
  );

  const flexRows = useMemo(
    () => weekSummary.perHabit.filter((row) => row.isFlexible && row.due > 0),
    [weekSummary]
  );

  const scoredEntries = daySummary.done + daySummary.partial + daySummary.failed;
  const closedEntries = scoredEntries + daySummary.skipped;
  const dayPerformance = scoredEntries > 0 ? performanceStyle(daySummary.qualityPercent) : null;

  const applyLocalLog = (habitId: string, date: string, next: HabitLog | null) => {
    setLogs((prev) => {
      const key = `${habitId}:${date}`;
      const rest = prev.filter((log) => `${log.habit_id}:${log.log_date}` !== key);
      return next ? [...rest, next] : rest;
    });
  };

  const setStatus = async (habit: Habit, date: string, status: HabitStatus | null) => {
    if (!user || isFuture) return;
    const previous = getLogFor(habit.id, date);
    setError('');
    setSavingIds((ids) => [...ids, habit.id]);
    try {
      if (status === null) {
        if (previous) await deleteLog(previous.id);
        applyLocalLog(habit.id, date, null);
      } else {
        const saved = await upsertLog(habit.id, user.id, date, status, previous?.note ?? undefined);
        applyLocalLog(habit.id, date, saved);
      }
      setUndo({ habitId: habit.id, habitTitle: habit.title, logDate: date, previous });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingIds((ids) => ids.filter((id) => id !== habit.id));
    }
  };

  const handleLogTap = (habit: Habit, status: HabitStatus) => {
    const existing = getLogFor(habit.id, dateStr);
    void setStatus(habit, dateStr, existing?.status === status ? null : status);
  };

  const handleGridTap = (habit: Habit, date: string) => {
    void setStatus(habit, date, nextStatus(getLogFor(habit.id, date)?.status));
  };

  const handleMarkAllDone = async () => {
    if (!user || remaining.length === 0) return;
    setBulkSaving(true);
    setError('');
    try {
      const entries: LogWrite[] = remaining.map((habit) => ({
        habit_id: habit.id,
        user_id: user.id,
        log_date: dateStr,
        status: 'success',
      }));
      const saved = await upsertLogs(entries);
      setLogs((prev) => {
        const keys = new Set(saved.map((log) => `${log.habit_id}:${log.log_date}`));
        return [...prev.filter((log) => !keys.has(`${log.habit_id}:${log.log_date}`)), ...saved];
      });
      setUndo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark everything done');
    } finally {
      setBulkSaving(false);
    }
  };

  const handleUndo = async () => {
    if (!undo || !user) return;
    const entry = undo;
    const habit = habits.find((item) => item.id === entry.habitId);
    setUndo(null);
    if (!habit) return;
    try {
      if (entry.previous) {
        const restored = await upsertLog(
          habit.id,
          user.id,
          entry.logDate,
          entry.previous.status,
          entry.previous.note
        );
        applyLocalLog(habit.id, entry.logDate, restored);
      } else {
        const current = getLogFor(habit.id, entry.logDate);
        if (current) await deleteLog(current.id);
        applyLocalLog(habit.id, entry.logDate, null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo');
    }
  };

  const saveNote = async (habitId: string) => {
    const log = getLogFor(habitId, dateStr);
    setNoteFor(null);
    if (!log) return;
    try {
      const saved = await updateLogNote(log.id, noteDraft);
      applyLocalLog(habitId, dateStr, saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    }
  };

  const goToDate = (date: Date) => navigate(`/today/${formatDateOnly(date)}`);

  const dayStyles = DAY_STATUS_STYLES[daySummary.status];

  const habitListNodes = dueHabits.map((habit) => {
    const log = getLogFor(habit.id, dateStr);
    const stats = habitStats.get(habit.id);
    const isSaving = savingIds.includes(habit.id);

    return (
      <div
        key={habit.id}
        className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{habit.emoji || '📋'}</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate">
              {habit.title}
            </h3>
            <div className="flex items-center gap-1.5 min-w-0">
              {habit.scheduling_type === 'flexible_weekly' && (
                <span className="text-[11px] text-indigo-500 shrink-0">
                  {habit.weekly_target}x/week
                </span>
              )}
              {log?.note && <span className="text-[11px] text-gray-400 truncate">📝 {log.note}</span>}
            </div>
          </div>
          <span className="flex gap-0.5 shrink-0" title="Last 7 days">
            {stats?.last7.map((entry) => (
              <span
                key={entry.date}
                className={`w-1.5 h-3 rounded-sm ${STRIP_COLORS[entry.state]}`}
                title={`${entry.date}: ${HABIT_STATE_LABELS[entry.state]}`}
              />
            ))}
          </span>
          {stats && stats.successStreak > 1 && (
            <span className="text-[11px] text-orange-500 font-medium shrink-0">
              🔥{stats.successStreak}
            </span>
          )}
        </div>

        <div className="flex gap-1.5">
          {(['success', 'partial', 'fail'] as const).map((status) => {
            const isSelected = log?.status === status;
            const meta = STATUS_META[status];
            return (
              <button
                key={status}
                disabled={isFuture || isSaving}
                onClick={() => handleLogTap(habit, status)}
                title={isSelected ? 'Tap again to clear' : getStatusLabelForDate(habit, status, viewDate)}
                className={`flex-1 min-w-0 px-2 py-3 rounded-lg text-xs font-medium transition-colors min-h-[44px] disabled:cursor-not-allowed disabled:opacity-50 ${
                  isSelected ? meta.active : meta.idle
                }`}
              >
                <span className="block truncate">
                  {isSelected ? '✓ ' : ''}
                  {getStatusLabelForDate(habit, status, viewDate)}
                </span>
              </button>
            );
          })}
          <button
            disabled={isFuture || isSaving}
            onClick={() => handleLogTap(habit, 'skipped')}
            title="Deliberately skipped — no penalty"
            className={`w-11 shrink-0 rounded-lg text-sm font-medium min-h-[44px] disabled:cursor-not-allowed disabled:opacity-50 ${
              log?.status === 'skipped' ? STATUS_META.skipped.active : STATUS_META.skipped.idle
            }`}
          >
            ⏭
          </button>
        </div>

        <div className="mt-1.5">
          {noteFor === habit.id ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveNote(habit.id);
                }}
                placeholder="Note for this day"
                className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={() => void saveNote(habit.id)}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 min-h-[32px]"
              >
                Save
              </button>
              <button onClick={() => setNoteFor(null)} className="text-xs text-gray-400 min-h-[32px]">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (!log) {
                  setError('Pick a status first — then you can add a note.');
                  return;
                }
                setNoteFor(habit.id);
                setNoteDraft(log.note ?? '');
              }}
              className="text-[11px] text-gray-400 hover:text-indigo-500 min-h-[32px]"
            >
              📝 {log?.note ? 'Edit note' : 'Add note'}
            </button>
          )}
        </div>
      </div>
    );
  });

  const gridNodes = (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_repeat(7,minmax(0,1.9rem))] gap-1 items-center px-1 text-[10px] text-gray-400">
        <span>Habit</span>
        {stripDays.map((day) => (
          <span key={formatDateOnly(day)} className="text-center">
            {format(day, 'EEEEE')}
          </span>
        ))}
      </div>
      {dueHabits.map((habit) => (
        <div
          key={habit.id}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-2 grid grid-cols-[1fr_repeat(7,minmax(0,1.9rem))] gap-1 items-center"
        >
          <div className="min-w-0 flex items-center gap-1.5">
            <span className="text-base">{habit.emoji || '📋'}</span>
            <span className="text-xs truncate text-gray-700 dark:text-gray-200">{habit.title}</span>
          </div>
          {stripDays.map((day) => {
            const dayKey = formatDateOnly(day);
            const state = getHabitDayState(habit, getLogFor(habit.id, dayKey), day, today);
            const isDisabled = isAfterDateOnly(day, today) || state === 'not_due';
            const cell = GRID_CELLS[state];
            return (
              <button
                key={dayKey}
                disabled={isDisabled}
                onClick={() => handleGridTap(habit, dayKey)}
                title={`${habit.title} · ${format(day, 'd MMM')} · ${HABIT_STATE_LABELS[state]}`}
                className={`h-8 rounded-md text-xs font-semibold flex items-center justify-center ${cell.className} disabled:opacity-30`}
              >
                {cell.glyph}
              </button>
            );
          })}
        </div>
      ))}
      <p className="text-[11px] text-gray-400 px-1">
        Tap a cell to cycle ✓ done → ½ partial → ⏭ skipped → ✖ missed → clear. Built for catching up on
        the last few days in one screen.
      </p>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      {/* Date bar */}
      <div className="flex items-center gap-1 mb-3">
        <button
          onClick={() => goToDate(subDays(viewDate, 1))}
          className="p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-500 dark:text-gray-400 text-xl shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Previous day"
        >
          ←
        </button>

        <div className="flex-1 flex gap-1 overflow-x-auto justify-center">
          {stripDays.map((day) => {
            const dayKey = formatDateOnly(day);
            const isActive = dayKey === dateStr;
            const isDayToday = dayKey === formatDateOnly(today);
            const summary = describeDay(habits, logs, day, today, signupDate);
            return (
              <button
                key={dayKey}
                onClick={() => goToDate(day)}
                className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg min-w-0 transition-colors min-h-[48px] ${
                  isActive
                    ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
                title={`${format(day, 'PPP')} — ${dayStripLabel(summary)}`}
              >
                <span className="text-xs">{format(day, 'EEE')}</span>
                <span className={`text-sm ${isDayToday ? 'font-bold' : ''}`}>{format(day, 'd')}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                    dayStripBar(summary)
                  }`}
                />
              </button>
            );
          })}
        </div>

        <button
          onClick={() => goToDate(addDays(viewDate, 1))}
          className="p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-500 dark:text-gray-400 text-xl shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Next day"
        >
          →
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-700 rounded-lg px-4 py-2 mb-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Backlog nudge: for the days this phone never got opened */}
      {!loading && backlog.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
            {backlog.length === 1
              ? '1 recent day still has unlogged habits'
              : `${backlog.length} recent days still have unlogged habits`}
          </h3>
          <div className="space-y-1.5">
            {backlog.slice(0, 3).map((row) => (
              <button
                key={row.dateStr}
                onClick={() => goToDate(row.date)}
                className="w-full flex items-center justify-between gap-2 text-xs bg-white/70 dark:bg-gray-900/60 rounded-lg px-3 py-2 hover:bg-white dark:hover:bg-gray-900 transition-colors"
              >
                <span className="font-medium text-gray-700 dark:text-gray-200">
                  {format(row.date, 'EEE d MMM')}
                </span>
                <span className="text-amber-700 dark:text-amber-300">
                  {row.notLogged} of {row.due} not logged · fill in →
                </span>
              </button>
            ))}
          </div>
          {backlog.length > 3 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
              plus {backlog.length - 3} earlier {backlog.length - 3 === 1 ? 'day' : 'days'}
            </p>
          )}
        </div>
      )}

      {/* Performance leads; logging coverage stays visible without masquerading as success. */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              {scoredEntries > 0
                ? `${daySummary.qualityPercent}% performance`
                : daySummary.due > 0
                  ? `${closedEntries} of ${daySummary.due} closed out`
                  : daySummary.headline}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{daySummary.detail || dayStyles.label}</p>
            {daySummary.due > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {closedEntries} of {daySummary.due} closed out ({daySummary.loggingPercent}% logged)
              </p>
            )}
          </div>
          {daySummary.due > 0 && (
            <div className={`text-right shrink-0 ${dayPerformance?.text ?? 'text-gray-400'}`}>
              <div className="text-3xl font-bold">{scoredEntries > 0 ? `${daySummary.qualityPercent}%` : '—'}</div>
              <div className="text-[11px] font-medium text-gray-400">performance</div>
            </div>
          )}
        </div>
        {daySummary.due > 0 && (
          <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mt-3">
            <div
              className={`h-full rounded-full transition-all ${dayPerformance?.bar ?? 'bg-gray-300 dark:bg-gray-600'}`}
              style={{ width: `${scoredEntries > 0 ? Math.min(daySummary.qualityPercent, 100) : 0}%` }}
            />
          </div>
        )}
        {daySummary.due > 0 && scoredEntries === 0 && !isFuture && (
          <p className="text-xs text-gray-400 mt-2">
            No scored outcomes yet — done, partial, and missed determine performance; skipped stays neutral.
          </p>
        )}
        {isFuture && (
          <p className="text-xs text-gray-400 mt-2">
            🔮 Future date — logging opens on the day itself
          </p>
        )}
        {daySummary.status === 'no_habits' && !isFuture && (
          <p className="text-xs text-green-600 dark:text-green-400 mt-2">
            🌿 Nothing due
            {daySummary.flexLogged > 0
              ? ` · ${daySummary.flexLogged} flexible log${daySummary.flexLogged === 1 ? '' : 's'}`
              : ' — rest day'}
          </p>
        )}
      </div>

      {/* Flexible habits: progress against the week's target, never a daily % */}
      {!loading && flexRows.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Flexible this week
            </h3>
            <span className="text-xs text-gray-400">
              {weekSummary.flexPoints}/{weekSummary.flexTargetToDate} on pace
            </span>
          </div>
          <div className="space-y-1.5">
            {flexRows.map((row) => (
              <div key={row.habitId} className="flex items-center gap-2 text-xs">
                <span className="w-5 text-center text-sm">{row.emoji}</span>
                <span className="flex-1 truncate text-gray-600 dark:text-gray-300">{row.title}</span>
                <span className="text-gray-400">
                  {row.points % 1 === 0 ? row.points : row.points.toFixed(1)}/{row.due}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isPast && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 px-3 py-2">
          <p className="text-xs text-indigo-700 dark:text-indigo-300">
            Backfilling {format(viewDate, 'EEE d MMM')} — it counts toward your history
          </p>
          <button
            onClick={() => goToDate(today)}
            className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 underline shrink-0 min-h-[32px]"
          >
            Back to today
          </button>
        </div>
      )}

      {!loading && dueHabits.length > 0 && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 text-xs rounded-md font-medium min-h-[36px] ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 text-xs rounded-md font-medium min-h-[36px] ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Week grid
            </button>
          </div>
          {!isFuture && remaining.length > 0 && (
            <button
              onClick={handleMarkAllDone}
              disabled={bulkSaving}
              className="text-xs font-semibold rounded-lg px-3 py-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 min-h-[36px]"
            >
              {bulkSaving ? 'Saving…' : `All ${remaining.length} done`}
            </button>
          )}
        </div>
      )}

      {undo && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2.5 shadow-lg">
          <span className="text-xs truncate max-w-[45vw]">{undo.habitTitle} updated</span>
          <button onClick={handleUndo} className="text-xs font-bold underline">
            Undo
          </button>
          <button onClick={() => setUndo(null)} aria-label="Dismiss" className="text-xs opacity-70">
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-gray-400">Loading...</p>
        </div>
      ) : dueHabits.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-lg mb-2">Nothing due this day 🎉</p>
          {backlog.length > 0 ? (
            <button
              onClick={() => goToDate(backlog[0].date)}
              className="text-sm text-indigo-600 dark:text-indigo-400 underline"
            >
              Fill in {format(backlog[0].date, 'EEE d MMM')} instead
            </button>
          ) : (
            <p className="text-gray-400 text-sm">
              Head to the Habits tab to create or resume habits
            </p>
          )}
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-2">{habitListNodes}</div>
      ) : (
        gridNodes
      )}

      <p className="text-center text-xs text-gray-400 mt-6">
        <Link to="/insights" className="text-indigo-600 dark:text-indigo-400 underline">
          See insights
        </Link>{' '}
        for the weekly breakdown, per-habit history and the 8-week trend.
      </p>
    </div>
  );
}