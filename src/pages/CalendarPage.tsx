import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { useAuth } from '../contexts/useAuth';
import { fetchHabits, fetchLogs } from '../lib/habits';
import { getDailyAggregate, getMonthlyAggregate, isHabitActiveOnDate, isHabitScheduledOnDate } from '../utils/scoring';
import type { Habit, HabitLog } from '../types';
import { formatDateOnly, isAfterDateOnly, todayLocal } from '../utils/date';

const WEEK_STARTS_ON = 1;

const STATUS_STYLES: Record<string, { cell: string; text: string; label: string; dot: string }> = {
  success: {
    cell: 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800',
    text: 'text-green-700 dark:text-green-300',
    label: 'Done',
    dot: 'bg-green-500',
  },
  partial: {
    cell: 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800',
    text: 'text-yellow-700 dark:text-yellow-300',
    label: 'Partial',
    dot: 'bg-yellow-500',
  },
  fail: {
    cell: 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-300',
    label: 'Missed',
    dot: 'bg-red-500',
  },
  no_habits: {
    cell: 'bg-gray-50 dark:bg-gray-900/60 border-gray-100 dark:border-gray-800',
    text: 'text-gray-400',
    label: 'Rest / inactive',
    dot: 'bg-gray-300 dark:bg-gray-600',
  },
  before_habits: {
    cell: 'bg-gray-50 dark:bg-gray-900/60 border-gray-100 dark:border-gray-800',
    text: 'text-gray-400',
    label: 'Before habits',
    dot: 'bg-gray-300 dark:bg-gray-600',
  },
  future: {
    cell: 'bg-gray-50 dark:bg-gray-900/60 border-gray-100 dark:border-gray-800',
    text: 'text-gray-400',
    label: 'Future',
    dot: 'bg-gray-300 dark:bg-gray-600',
  },
};

export default function CalendarPage() {
  const { user, signupDate } = useAuth();
  const navigate = useNavigate();
  const [today] = useState(() => todayLocal());
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(todayLocal()));
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { monthStart, monthEnd, calendarStart, calendarEnd } = useMemo(() => {
    const computedMonthStart = startOfMonth(currentMonth);
    const computedMonthEnd = endOfMonth(currentMonth);
    const computedCalendarStart = startOfWeek(computedMonthStart, { weekStartsOn: WEEK_STARTS_ON });
    const computedCalendarEnd = endOfWeek(computedMonthEnd, { weekStartsOn: WEEK_STARTS_ON });

    return {
      monthStart: computedMonthStart,
      monthEnd: computedMonthEnd,
      calendarStart: computedCalendarStart,
      calendarEnd: computedCalendarEnd,
    };
  }, [currentMonth]);

  const visibleDays = useMemo(
    () => eachDayOfInterval({ start: calendarStart, end: calendarEnd }),
    [calendarStart, calendarEnd]
  );

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');

    try {
      const end = isAfterDateOnly(calendarEnd, today) ? calendarEnd : today;
      const [habitsData, logsData] = await Promise.all([
        fetchHabits(user.id),
        fetchLogs(user.id, formatDateOnly(calendarStart), formatDateOnly(end)),
      ]);

      setHabits(habitsData);
      setLogs(logsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  }, [calendarEnd, calendarStart, today, user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeHabits = habits.filter((habit) => habit.is_active);

  const logsByHabitAndDate = useMemo(() => {
    const map = new Map<string, HabitLog>();
    logs.forEach((log) => map.set(`${log.habit_id}:${log.log_date}`, log));
    return map;
  }, [logs]);

  const monthStats = useMemo(
    () => getMonthlyAggregate(habits, logs, monthStart, monthEnd, today),
    [habits, logs, monthStart, monthEnd, today]
  );

  const getHabitDots = useCallback((day: Date) => {
    const dateKey = formatDateOnly(day);
    const isFutureDay = isAfterDateOnly(day, today);

    return habits
      .map((habit) => {
        if (habit.scheduling_type === 'fixed_weekdays') {
          if (!isHabitScheduledOnDate(habit, day)) return null;
          const log = logsByHabitAndDate.get(`${habit.id}:${dateKey}`);
          const color = log?.status === 'success'
            ? 'bg-green-500'
            : log?.status === 'partial'
              ? 'bg-yellow-500'
              : log?.status === 'fail'
                ? 'bg-red-500'
                : isFutureDay
                  ? 'bg-gray-300 dark:bg-gray-600'
                  : 'bg-red-500';
          const label = log?.status === 'success'
            ? 'Done'
            : log?.status === 'partial'
              ? 'Partial'
              : log?.status === 'fail'
                ? 'Missed'
                : isFutureDay
                  ? 'Future / pending'
                  : 'Missed (unlogged)';
          return { id: habit.id, title: habit.title, color, label };
        }

        if (!isHabitActiveOnDate(habit, day)) return null;
        const log = logsByHabitAndDate.get(`${habit.id}:${dateKey}`);
        if (!log) return null;
        const color = log.status === 'success' ? 'bg-green-500' : log.status === 'partial' ? 'bg-yellow-500' : 'bg-red-500';
        const label = log.status === 'success' ? 'Done' : log.status === 'partial' ? 'Partial' : 'Missed';
        return { id: habit.id, title: habit.title, color, label };
      })
      .filter((dot): dot is { id: string; title: string; color: string; label: string } => dot !== null)
      .slice(0, 6);
  }, [habits, logsByHabitAndDate, today]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => setCurrentMonth((month) => subMonths(month, 1))}
          className="p-3 min-w-[44px] rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Previous month"
        >
          ←
        </button>
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{format(currentMonth, 'MMMM yyyy')}</h2>
          <button
            onClick={() => setCurrentMonth(startOfMonth(today))}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Jump to today
          </button>
        </div>
        <button
          onClick={() => setCurrentMonth((month) => addMonths(month, 1))}
          className="p-3 min-w-[44px] rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-700 rounded-lg px-4 py-2 mb-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-400">Avg. score</p>
          <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{monthStats.scorePercent}%</p>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-400">Done entries</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">{monthStats.doneCount}</p>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-400">Active habits</p>
          <p className="text-xl font-bold text-gray-700 dark:text-gray-200">{activeHabits.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><p className="text-gray-400">Loading...</p></div>
      ) : (
        <>
          <div className="grid grid-cols-7 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {visibleDays.map((day) => {
              const dateKey = formatDateOnly(day);
              const dayAggregate = getDailyAggregate(habits, logs, day, today, signupDate);
              const styles = STATUS_STYLES[dayAggregate.status];
              const dots = getHabitDots(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = dateKey === formatDateOnly(today);

              return (
                <button
                  key={dateKey}
                  onClick={() => navigate(`/today/${dateKey}`)}
                  className={`aspect-square rounded-xl border p-1.5 flex flex-col items-center justify-center transition-all hover:ring-2 hover:ring-indigo-300 ${
                    isCurrentMonth ? styles.cell : 'bg-gray-50 dark:bg-gray-900/40 border-gray-100 dark:border-gray-800 opacity-40'
                  } ${isToday ? 'ring-2 ring-indigo-400' : ''}`}
                  title={`${format(day, 'PPP')}: ${styles.label}`}
                >
                  <span className={`text-xs font-semibold ${styles.text}`}>{format(day, 'd')}</span>
                  <div className="min-h-[10px] flex gap-0.5 mt-1 flex-wrap justify-center">
                    {dots.length > 0 ? dots.map((dot) => (
                      <span
                        key={dot.id}
                        className={`w-1.5 h-1.5 rounded-full ${dot.color}`}
                        title={`${dot.title}: ${dot.label}`}
                      />
                    )) : <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-4">
            <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400 justify-center">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-200" /> Done</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-200" /> Partial</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200" /> Missed</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-50 border border-gray-200" /> Rest / inactive</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-200" /> Future</span>
            </div>
            <p className="text-center text-xs text-gray-400 mt-3">
              Monthly score: {monthStats.scorePercent}% · {monthStats.doneCount} done, {monthStats.partialCount} partial, {monthStats.missedCount} missed
            </p>
          </div>
        </>
      )}
    </div>
  );
}
