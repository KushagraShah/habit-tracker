import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addDays, format, subDays } from 'date-fns';
import { useAuth } from '../contexts/useAuth';
import {
  deleteLog,
  fetchHabits,
  fetchLogs,
  isHabitScheduledOnDate,
  upsertLog,
} from '../lib/habits';
import { computeDayScore, getWeeklyAggregate, getWeeklyTrendData } from '../utils/scoring';
import type { DailyScoreLabel, Habit, HabitLog, HabitStatus } from '../types';
import {
  formatDateOnly,
  isBeforeDateOnly,
  isAfterDateOnly,
  parseDateOnly,
  todayLocal,
  getWeekStart,
  getWeekEnd,
  formatWeekRange,
  getWeeksBack,
} from '../utils/date';

const DAYS_IN_BAR = 7;
const TREND_WEEKS = 8;

const SCORE_LABEL_CONFIG: Record<DailyScoreLabel, { emoji: string; label: string; color: string; bg: string }> = {
  great: {
    emoji: '🌟',
    label: 'Great day',
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-500',
  },
  good: {
    emoji: '👍',
    label: 'Good day',
    color: 'text-indigo-600 dark:text-indigo-400',
    bg: 'bg-indigo-500',
  },
  partial: {
    emoji: '📊',
    label: 'Partial day',
    color: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-500',
  },
  reset: {
    emoji: '🔄',
    label: 'Reset day',
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-500',
  },
};

function mergeLogsById(...collections: HabitLog[][]): HabitLog[] {
  const map = new Map<string, HabitLog>();
  for (const logs of collections) {
    for (const log of logs) {
      map.set(log.id, log);
    }
  }
  return Array.from(map.values());
}

function getRouteDate(routeDate?: string): Date {
  if (!routeDate) return todayLocal();
  const parsed = parseDateOnly(routeDate);
  return Number.isNaN(parsed.getTime()) ? todayLocal() : parsed;
}

export default function TodayPage() {
  const { user, signupDate } = useAuth();
  const navigate = useNavigate();
  const { date: routeDate } = useParams();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPastWarning, setShowPastWarning] = useState(false);
  const [showTrend, setShowTrend] = useState(false);

  const today = todayLocal();
  const viewDate = getRouteDate(routeDate);
  const dateStr = formatDateOnly(viewDate);
  const isPast = isBeforeDateOnly(viewDate, today);
  const isFuture = isAfterDateOnly(viewDate, today);

  // Weekly summary for the current view date's week
  const weekStart = getWeekStart(viewDate);
  const weekEnd = getWeekEnd(viewDate);
  const weekStartStr = formatDateOnly(weekStart);
  const weekEndStr = formatDateOnly(weekEnd);

  // Trend weeks data
  const trendWeeks = getWeeksBack(today, TREND_WEEKS);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        // Fetch habits and logs for current week (covers current day)
        const [habitsData, weekLogsData] = await Promise.all([
          fetchHabits(user.id),
          fetchLogs(user.id, weekStartStr, weekEndStr),
        ]);
        setHabits(habitsData);
        setLogs(weekLogsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report data');
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [user, weekStartStr, weekEndStr]);

  // Fetch additional logs for trend chart
  useEffect(() => {
    if (!user || trendWeeks.length === 0) return;
    const fetchTrendLogs = async () => {
      const start = trendWeeks[0];
      const end = getWeekEnd(trendWeeks[trendWeeks.length - 1]);
      try {
        const trendLogs = await fetchLogs(user.id, formatDateOnly(start), formatDateOnly(end));
        setLogs((prev) => mergeLogsById(prev, trendLogs));
      } catch {
        // Silent fail for trend logs
      }
    };
    fetchTrendLogs();
  }, [user, trendWeeks]);

  const activeDueHabits = habits.filter((habit) => habit.is_active && isHabitScheduledOnDate(habit, viewDate));

  const getLogForHabit = (habitId: string): HabitLog | undefined => {
    return logs.find((log) => log.habit_id === habitId && log.log_date === dateStr);
  };

  const handleLog = async (habitId: string, status: HabitStatus) => {
    if (!user || isFuture) return;

    const existingLog = getLogForHabit(habitId);
    setError('');
    if (isPast) setShowPastWarning(true);

    try {
      if (existingLog?.status === status) {
        await deleteLog(existingLog.id);
      } else {
        await upsertLog(habitId, user.id, dateStr, status);
      }

      const [habitsData, weekLogsData] = await Promise.all([
        fetchHabits(user.id),
        fetchLogs(user.id, weekStartStr, weekEndStr),
      ]);
      setHabits(habitsData);
      setLogs(weekLogsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save log');
    }
  };

  const goToDate = (date: Date) => {
    setShowPastWarning(false);
    navigate(`/today/${formatDateOnly(date)}`);
  };

  const dayScore = computeDayScore(habits, logs, viewDate, today, signupDate);

  const weeklySummary = getWeeklyAggregate(habits, logs, weekStart, today);

  const weeklyTrend = getWeeklyTrendData(habits, logs, trendWeeks, today);

  const barDays = Array.from({ length: DAYS_IN_BAR }, (_, i) => {
    const offset = i - Math.floor(DAYS_IN_BAR / 2);
    return addDays(viewDate, offset);
  });

  const scoreLabelConfig = dayScore.scoreLabel ? SCORE_LABEL_CONFIG[dayScore.scoreLabel] : null;

  // Find weakest habits (lowest completion ratio)
  const weakestHabits = [...weeklySummary.perHabitConsistency]
    .sort((a, b) => {
      const ratioA = a.dueCount > 0 ? a.completedCount / a.dueCount : 0;
      const ratioB = b.dueCount > 0 ? b.completedCount / b.dueCount : 0;
      return ratioA - ratioB;
    })
    .slice(0, 2)
    .filter((h) => h.dueCount > 0 && h.completedCount < h.dueCount);

  // Encouraging copy based on score
  const encouragingCopy = (() => {
    if (!dayScore.scoreLabel) return null;
    const total = dayScore.total;
    const completed = Math.round(dayScore.achieved);
    const missed = total - completed;
    if (dayScore.scoreLabel === 'great') {
      return `Everything on track! You completed all ${completed} habits.`;
    }
    if (dayScore.scoreLabel === 'good') {
      return `Still a good day. You completed ${completed} of ${total} habits.`;
    }
    if (dayScore.scoreLabel === 'partial') {
      return `You completed ${completed} of ${total} habits. Some room for improvement tomorrow.`;
    }
    return `Tough day. ${missed} of ${total} habits missed — tomorrow is a fresh start.`;
  })();

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      {/* Weekday bar */}
      <div className="flex items-center gap-1 mb-4">
        <button
          onClick={() => goToDate(subDays(viewDate, 1))}
          className="p-4 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-500 dark:text-gray-400 text-2xl shrink-0 min-w-[48px] min-h-[48px] flex items-center justify-center active:bg-gray-200 dark:active:bg-gray-700"
          aria-label="Previous day"
        >
          ←
        </button>

        <div className="flex-1 flex gap-1 overflow-x-auto justify-center">
          {barDays.map((day) => {
            const dayKey = formatDateOnly(day);
            const isActive = dayKey === dateStr;
            const isDayToday = dayKey === formatDateOnly(today);
            return (
              <button
                key={dayKey}
                onClick={() => goToDate(day)}
                className={`flex flex-col items-center px-3 py-2 rounded-lg min-w-0 transition-colors min-h-[48px] ${
                  isActive
                    ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
              >
                <span className="text-xs">{format(day, 'EEE')}</span>
                <span className={`text-sm ${isDayToday ? 'font-bold' : ''}`}>{format(day, 'd')}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => goToDate(addDays(viewDate, 1))}
          className="p-4 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-500 dark:text-gray-400 text-2xl shrink-0 min-w-[48px] min-h-[48px] flex items-center justify-center active:bg-gray-200 dark:active:bg-gray-700"
          aria-label="Next day"
        >
          →
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-700 rounded-lg px-4 py-2 mb-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Daily Score Card */}
      {['success', 'partial', 'fail'].includes(dayScore.status) && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                {scoreLabelConfig?.emoji} Today: {Math.round(dayScore.achieved)}/{dayScore.total}
              </h3>
              {scoreLabelConfig && (
                <p className={`text-sm font-medium ${scoreLabelConfig.color}`}>
                  {dayScore.percent}% · {scoreLabelConfig.label}
                </p>
              )}
            </div>
            <div className="text-right">
              <div className={`text-3xl font-bold ${scoreLabelConfig?.color ?? 'text-gray-400'}`}>
                {dayScore.percent}%
              </div>
            </div>
          </div>
          <div className="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${scoreLabelConfig?.bg ?? 'bg-gray-400'}`}
              style={{ width: `${Math.min(dayScore.percent, 100)}%` }}
            />
          </div>
          {encouragingCopy && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{encouragingCopy}</p>
          )}
        </div>
      )}

      {/* Status messages */}
      {dayScore.status === 'before_habits' && (
        <div className="mb-4 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-center text-sm text-gray-500 dark:text-gray-400">
          ⏳ No habits active yet for this date
        </div>
      )}
      {dayScore.status === 'future' && (
        <div className="mb-4 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-center text-sm text-gray-500 dark:text-gray-400">
          🔮 Future date — logging is disabled until the day arrives
        </div>
      )}
      {dayScore.status === 'no_habits' && (
        <div className="mb-4 px-4 py-2 bg-green-50 dark:bg-green-950/30 rounded-lg text-center text-sm text-green-600 dark:text-green-400">
          🌿 Nothing due — rest day
        </div>
      )}

      {isPast && showPastWarning && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-2 mb-4 text-sm text-amber-700 dark:text-amber-300">
          ⚠️ You are editing data for a past date. This will affect your statistics.
        </div>
      )}

      {/* Weekly Summary Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">This week</h3>
          <span className="text-xs text-gray-400">{formatWeekRange(weekStart)}</span>
        </div>
        <div className="flex items-center gap-4 mb-3">
          <div className="flex-1">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              <span className="text-green-600 dark:text-green-400 font-semibold">{weeklySummary.doneCount} done</span>
              <span className="text-gray-400"> · </span>
              <span className="text-yellow-600 dark:text-yellow-400 font-semibold">{weeklySummary.partialCount} partial</span>
              <span className="text-gray-400"> · </span>
              <span className="text-red-600 dark:text-red-400 font-semibold">{weeklySummary.missedCount} missed</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">Progress: {weeklySummary.points.toFixed(1)} / {weeklySummary.dueUnits} due units</div>
            {weeklySummary.remainingTarget > 0 && (
              <div className="text-xs text-gray-400 mt-1">Remaining target: {weeklySummary.remainingTarget}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {weeklySummary.scorePercent}%
            </div>
            <div className="text-xs text-gray-400">weekly avg</div>
          </div>
        </div>
        {weeklySummary.dueUnits > 0 && (
          <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
            <div
              className="h-full rounded-full bg-indigo-500"
              style={{ width: `${Math.min(weeklySummary.scorePercent, 100)}%` }}
            />
          </div>
        )}

        {/* Per-habit consistency */}
        {weeklySummary.perHabitConsistency.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Per-habit completion</h4>
            <div className="space-y-1.5">
              {weeklySummary.perHabitConsistency.map((pc) => {
                const isComplete = pc.dueCount > 0 && pc.completedCount >= pc.dueCount;
                return (
                  <div key={pc.habitId} className="flex items-center gap-2 text-xs">
                    <span className="text-sm w-5 text-center">{pc.emoji}</span>
                    <span className="flex-1 text-gray-700 dark:text-gray-300 truncate">{pc.title}</span>
                    <span className={`font-medium ${isComplete ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      {pc.completedCount}/{pc.dueCount}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Weakest habits */}
        {weakestHabits.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Focus areas</h4>
            {weakestHabits.map((h) => (
              <p key={h.habitId} className="text-xs text-amber-600 dark:text-amber-400">
                {h.emoji} {h.title}: {h.completedCount}/{h.dueCount}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Trend Chart */}
      <button
        onClick={() => setShowTrend(!showTrend)}
        className="w-full mb-3 text-xs text-indigo-600 dark:text-indigo-400 hover:underline text-left"
      >
        {showTrend ? '▼ Hide trend' : '▶ Show trend (last 8 weeks)'}
      </button>

      {showTrend && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Weekly score trend</h3>
          <div className="flex items-end gap-1.5 h-24">
            {weeklyTrend.map((week, i) => {
              const height = week.score == null ? 0 : Math.max(week.score, 2);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-400 font-medium">{week.score == null ? '—' : `${week.score}%`}</span>
                  <div
                    className={`w-full rounded-t min-h-[4px] transition-all ${week.score == null ? 'bg-gray-300 dark:bg-gray-700' : 'bg-indigo-400 dark:bg-indigo-500'}`}
                    style={{ height: `${(height / 100) * 70}px` }}
                    title={`${formatWeekRange(week.weekStart)}: ${week.score == null ? 'No data' : `${week.score}%`}`}
                  />
                  <span className="text-[9px] text-gray-400 leading-tight text-center truncate w-full">
                    {format(week.weekStart, 'M/d')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Habit cards */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><p className="text-gray-400">Loading...</p></div>
      ) : activeDueHabits.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-lg mb-2">Nothing due this day 🎉</p>
          <p className="text-gray-400 text-sm">Head to the Habits tab to create or resume habits</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeDueHabits.map((habit) => {
            const log = getLogForHabit(habit.id);
            return (
              <div key={habit.id} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{habit.emoji || '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate">{habit.title}</h3>
                    {habit.description && <p className="text-xs text-gray-400 truncate">{habit.description}</p>}
                    {habit.scheduling_type === 'flexible_weekly' && (
                      <p className="text-xs text-indigo-500">Weekly target: 0/{habit.weekly_target} · Optional today</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  {(['success', 'partial', 'fail'] as const).map((status) => {
                    const isSelected = log?.status === status;
                    const baseClasses = 'flex-1 py-3 rounded-lg text-sm font-medium transition-colors min-h-[44px] disabled:cursor-not-allowed disabled:opacity-50';
                    const activeClasses = isSelected
                      ? status === 'success' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 ring-2 ring-green-400'
                        : status === 'partial' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 ring-2 ring-yellow-400'
                          : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 ring-2 ring-red-400'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700';

                    const label = status === 'success' ? habit.success_label || '✅ Done'
                      : status === 'partial' ? habit.partial_label || '🟡 Partial'
                        : habit.fail_label || '❌ Miss';

                    return (
                      <button
                        key={status}
                        disabled={isFuture}
                        onClick={() => handleLog(habit.id, status)}
                        className={`${baseClasses} ${activeClasses}`}
                        title={isSelected ? 'Tap again to clear this log' : undefined}
                      >
                        {isSelected ? `${label} ✓` : label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}