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
import {
  describeDay,
  getHabitDayState,
  getHabitStats,
  getMonthAggregate,
  getWeekAggregate,
  getWeeklyTrendData,
  isHabitActiveOnDate,
} from '../utils/scoring';
import type { DayStatus, Habit, HabitDayState, HabitLog } from '../types';
import {
  formatDateOnly,
  formatWeekRange,
  getWeekStart,
  getWeeksBack,
  isAfterDateOnly,
  todayLocal,
} from '../utils/date';

const WEEK_STARTS_ON = 1;
const TREND_WEEKS = 8;

const STATUS_STYLES: Record<DayStatus, { cell: string; text: string; label: string; dot: string }> = {
  complete: {
    cell: 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800',
    text: 'text-green-700 dark:text-green-300',
    label: 'Everything logged',
    dot: 'bg-green-500',
  },
  partial: {
    cell: 'bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-300',
    label: 'Partly logged',
    dot: 'bg-amber-500',
  },
  unlogged: {
    cell: 'bg-gray-50 dark:bg-gray-900/60 border-dashed border-gray-300 dark:border-gray-600',
    text: 'text-gray-400 dark:text-gray-500',
    label: 'Nothing logged',
    dot: 'bg-gray-300 dark:bg-gray-600',
  },
  skipped: {
    cell: 'bg-rose-100 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-300',
    label: 'Skipped',
    dot: 'bg-rose-500',
  },
  no_habits: {
    cell: 'bg-gray-100 dark:bg-gray-800/60 border-gray-100 dark:border-gray-800',
    text: 'text-gray-400 dark:text-gray-500',
    label: 'Rest day',
    dot: 'bg-gray-300 dark:bg-gray-600',
  },
  before_habits: {
    cell: 'bg-gray-100 dark:bg-gray-800/60 border-gray-100 dark:border-gray-800',
    text: 'text-gray-400 dark:text-gray-500',
    label: 'Before you started',
    dot: 'bg-gray-300 dark:bg-gray-600',
  },
  future: {
    cell: 'bg-gray-100 dark:bg-gray-800/60 border-gray-100 dark:border-gray-800',
    text: 'text-gray-400 dark:text-gray-500',
    label: 'Future',
    dot: 'bg-gray-300 dark:bg-gray-600',
  },
};

const DOT_COLORS: Record<HabitDayState, string> = {
  success: 'bg-green-500',
  partial: 'bg-amber-500',
  fail: 'bg-red-500',
  skipped: 'bg-rose-400',
  not_logged: 'bg-gray-300 dark:bg-gray-600',
  not_due: 'bg-gray-300 dark:bg-gray-600',
};

const DOT_LABELS: Record<HabitDayState, string> = {
  success: 'Done',
  partial: 'Partial',
  fail: 'Missed',
  skipped: 'Skipped',
  not_logged: 'Not logged',
  not_due: 'Not due',
};

const STRIP_COLORS: Record<HabitDayState, string> = {
  success: 'bg-green-500',
  partial: 'bg-amber-400',
  fail: 'bg-red-500',
  skipped: 'bg-rose-300',
  not_logged: 'bg-gray-200 dark:bg-gray-700',
  not_due: 'bg-gray-100 dark:bg-gray-800',
};

export default function InsightsPage() {
  const { user, signupDate } = useAuth();
  const navigate = useNavigate();
  const [today] = useState(() => todayLocal());
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(todayLocal()));
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showTrend, setShowTrend] = useState(false);

  const { monthStart, monthEnd, calendarStart, calendarEnd } = useMemo(() => {
    const computedMonthStart = startOfMonth(currentMonth);
    const computedMonthEnd = endOfMonth(currentMonth);
    return {
      monthStart: computedMonthStart,
      monthEnd: computedMonthEnd,
      calendarStart: startOfWeek(computedMonthStart, { weekStartsOn: WEEK_STARTS_ON }),
      calendarEnd: endOfWeek(computedMonthEnd, { weekStartsOn: WEEK_STARTS_ON }),
    };
  }, [currentMonth]);

  const visibleDays = useMemo(
    () => eachDayOfInterval({ start: calendarStart, end: calendarEnd }),
    [calendarStart, calendarEnd]
  );

  const trendWeeks = useMemo(() => getWeeksBack(today, TREND_WEEKS), [today]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');

    try {
      // One window covers both the visible month and the trend chart.
      const start = isAfterDateOnly(trendWeeks[0], calendarStart) ? calendarStart : trendWeeks[0];
      const end = isAfterDateOnly(calendarEnd, today) ? calendarEnd : today;
      const [habitsData, logsData] = await Promise.all([
        fetchHabits(user.id),
        fetchLogs(user.id, formatDateOnly(start), formatDateOnly(end)),
      ]);
      setHabits(habitsData);
      setLogs(logsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, [calendarStart, calendarEnd, today, trendWeeks, user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeTodayCount = habits.filter((habit) => isHabitActiveOnDate(habit, today)).length;

  const logsByHabitAndDate = useMemo(() => {
    const map = new Map<string, HabitLog>();
    logs.forEach((log) => map.set(`${log.habit_id}:${log.log_date}`, log));
    return map;
  }, [logs]);

  const monthStats = useMemo(
    () => getMonthAggregate(habits, logs, monthStart, monthEnd, today, signupDate),
    [habits, logs, monthStart, monthEnd, today, signupDate]
  );

  const thisWeek = useMemo(
    () => getWeekAggregate(habits, logs, getWeekStart(today), today),
    [habits, logs, today]
  );

  const trend = useMemo(
    () => getWeeklyTrendData(habits, logs, trendWeeks, today),
    [habits, logs, trendWeeks, today]
  );

  // Habits needing attention first: lowest logging coverage, then biggest load.
  const habitRows = useMemo(
    () =>
      habits
        .map((habit) => ({
          habit,
          stats: getHabitStats(habit, logs, monthStart, monthEnd, today),
        }))
        .filter((row) => row.stats.due > 0)
        .sort(
          (a, b) => a.stats.loggingPercent - b.stats.loggingPercent || b.stats.due - a.stats.due
        ),
    [habits, logs, monthStart, monthEnd, today]
  );

  const getHabitDots = useCallback(
    (day: Date) => {
      const dateKey = formatDateOnly(day);
      return habits
        .map((habit) => {
          const log = logsByHabitAndDate.get(`${habit.id}:${dateKey}`);
          if (habit.scheduling_type === 'flexible_weekly') {
            // Flexible habits only show a dot when something was logged.
            if (!log) return null;
            const state = getHabitDayState(habit, log, day, today);
            return {
              id: habit.id,
              title: habit.title,
              color: DOT_COLORS[state],
              label: DOT_LABELS[state],
            };
          }
          const state = getHabitDayState(habit, log, day, today);
          if (state === 'not_due') return null;
          return {
            id: habit.id,
            title: habit.title,
            color: DOT_COLORS[state],
            label: DOT_LABELS[state],
          };
        })
        .filter((dot): dot is { id: string; title: string; color: string; label: string } => dot !== null)
        .slice(0, 6);
    },
    [habits, logsByHabitAndDate, today]
  );

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
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
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
          <p className="text-xs text-gray-400">Habit-days logged</p>
          <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
            {monthStats.logged}
            <span className="text-sm text-gray-400 font-normal">/{monthStats.due}</span>
          </p>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-400">Quality of logged</p>
          <p className="text-xl font-bold text-gray-700 dark:text-gray-200">
            {monthStats.qualityPercent}%
          </p>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-400">Days fully logged</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">
            {monthStats.daysFullyLogged}
          </p>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-400">Active today</p>
          <p className="text-xl font-bold text-gray-700 dark:text-gray-200">{activeTodayCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400">Loading...</p>
        </div>
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
              const summary = describeDay(habits, logs, day, today, signupDate);
              const styles = STATUS_STYLES[summary.status];
              const dots = getHabitDots(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = dateKey === formatDateOnly(today);
              const loggedHere = summary.done + summary.partial + summary.failed + summary.skipped;
              const showFraction = summary.due > 0 && summary.status !== 'future';

              return (
                <button
                  key={dateKey}
                  onClick={() => navigate(`/today/${dateKey}`)}
                  title={`${format(day, 'PPP')} — ${styles.label}${
                    summary.due > 0
                      ? ` (${summary.headline}${summary.detail ? ` · ${summary.detail}` : ''})`
                      : ''
                  }`}
                  className={`min-h-[54px] rounded-xl border px-1 py-1.5 flex flex-col items-center justify-center transition-all hover:ring-2 hover:ring-indigo-300 ${
                    isCurrentMonth
                      ? styles.cell
                      : 'bg-gray-50 dark:bg-gray-900/40 border-gray-100 dark:border-gray-800 opacity-40'
                  } ${isToday ? 'ring-2 ring-indigo-400' : ''}`}
                >
                  <span className={`text-xs font-semibold ${styles.text}`}>{format(day, 'd')}</span>
                  {showFraction && (
                    <span className={`text-[10px] leading-tight opacity-80 ${styles.text}`}>
                      {loggedHere}/{summary.due}
                    </span>
                  )}
                  <div className="min-h-[8px] flex gap-0.5 mt-0.5 flex-wrap justify-center max-w-full">
                    {dots.length > 0 ? (
                      dots.map((dot) => (
                        <span
                          key={dot.id}
                          className={`w-1.5 h-1.5 rounded-full ${dot.color}`}
                          title={`${dot.title}: ${dot.label}`}
                        />
                      ))
                    ) : (
                      <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-4">
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400 justify-center">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-100 border border-green-200" /> Everything logged
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-amber-100 border border-amber-200" /> Partly logged
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-gray-50 border border-dashed border-gray-300" /> Nothing logged
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-rose-100 border border-rose-200" /> Skipped
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-gray-100 border border-gray-200" /> Rest / future
              </span>
            </div>
            <p className="text-center text-xs text-gray-400 mt-3">
              {monthStats.logged} of {monthStats.due} habit-days logged ·{' '}
              <span className="text-red-500">{monthStats.failed} missed</span> · {monthStats.notLogged} not logged
              {monthStats.skipped > 0 ? ` · ${monthStats.skipped} skipped` : ''}
            </p>
          </div>
        </>
      )}

      {/* This week - moved here from Today so logging stays uncluttered */}
      <div className="mt-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">This week</h3>
          <span className="text-xs text-gray-400">{formatWeekRange(getWeekStart(today))}</span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                {thisWeek.fixedLogged}
              </span>
              <span className="text-gray-400">/{thisWeek.fixedDue} scheduled habit-days logged</span>
            </p>
            {thisWeek.flexTargetToDate > 0 && (
              <p className="text-sm text-gray-700 dark:text-gray-200">
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                  {thisWeek.flexPoints}
                </span>
                <span className="text-gray-400">/{thisWeek.flexTargetToDate} flexible target so far</span>
              </p>
            )}
            <p className="text-xs text-gray-400">
              {thisWeek.done} done · {thisWeek.partial} partial
              {thisWeek.failed > 0 ? ` · ${thisWeek.failed} missed` : ''}
              {thisWeek.notLogged > 0 ? ` · ${thisWeek.notLogged} still open` : ''}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {thisWeek.loggingPercent}%
            </div>
            <div className="text-xs text-gray-400">logged</div>
          </div>
        </div>

        {habitRows.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              This month per habit, worst first
            </h4>
            <div className="space-y-1.5">
              {habitRows.map(({ habit, stats }) => (
                <div key={habit.id} className="flex items-center gap-2 text-xs">
                  <span className="w-5 text-center text-sm">{habit.emoji || '📋'}</span>
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{habit.title}</span>
                  <span className="flex gap-0.5 shrink-0" title="Last 7 days">
                    {stats.last7.map((entry) => (
                      <span
                        key={entry.date}
                        className={`w-1.5 h-3 rounded-sm ${STRIP_COLORS[entry.state]}`}
                        title={`${entry.date}: ${DOT_LABELS[entry.state]}`}
                      />
                    ))}
                  </span>
                  <span
                    className={`w-12 text-right font-medium shrink-0 ${
                      stats.loggingPercent >= 80
                        ? 'text-green-600 dark:text-green-400'
                        : stats.loggingPercent >= 50
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-gray-400'
                    }`}
                  >
                    {stats.logged}/{stats.due}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => setShowTrend((show) => !show)}
        className="w-full mt-4 text-xs text-indigo-600 dark:text-indigo-400 hover:underline text-left"
      >
        {showTrend ? '▼ Hide 8-week trend' : '▶ Show 8-week trend'}
      </button>

      {showTrend && (
        <div className="mt-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Weekly quality trend
          </h3>
          <div className="flex items-end gap-1.5 h-24">
            {trend.map((week) => {
              const height = week.score == null ? 0 : Math.max(week.score, 2);
              return (
                <div
                  key={formatDateOnly(week.weekStart)}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <span className="text-[10px] text-gray-400 font-medium">
                    {week.score == null ? '—' : `${week.score}%`}
                  </span>
                  <div
                    className={`w-full rounded-t min-h-[4px] transition-all ${
                      week.score == null
                        ? 'bg-gray-200 dark:bg-gray-700'
                        : week.isCurrentWeek
                          ? 'bg-indigo-200 dark:bg-indigo-800'
                          : 'bg-indigo-400 dark:bg-indigo-500'
                    }`}
                    style={{ height: `${(height / 100) * 70}px` }}
                    title={`${formatWeekRange(week.weekStart)}: ${
                      week.score == null ? 'No data' : `${week.score}% quality`
                    } · ${week.loggingPercent}% logged`}
                  />
                  <span className="text-[9px] text-gray-400 leading-tight text-center truncate w-full">
                    {format(week.weekStart, 'M/d')}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Quality = how well you did with the habit-days you logged. The lighter bar is the week in
            progress.
          </p>
        </div>
      )}
    </div>
  );
}
