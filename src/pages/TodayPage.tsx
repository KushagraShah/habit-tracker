import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { fetchHabits, fetchLogs, isHabitDueOnDate, upsertLog } from '../lib/habits';
import { computeDayScore } from '../utils/scoring';
import type { Habit, HabitLog } from '../types';
import { format, addDays, subDays, parseISO, isValid } from 'date-fns';

const DAYS_IN_BAR = 7;

export default function TodayPage() {
  const { user, signupDate } = useAuth();
  const { date: routeDate } = useParams();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(() => {
    if (routeDate) {
      const parsed = parseISO(routeDate);
      return isValid(parsed) ? parsed : new Date();
    }
    return new Date();
  });
  const [showPastWarning, setShowPastWarning] = useState(false);

  const today = new Date();
  const isPast = viewDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStr = format(viewDate, 'yyyy-MM-dd');

  useEffect(() => {
    if (routeDate) {
      const parsed = parseISO(routeDate);
      if (isValid(parsed)) setViewDate(parsed);
    }
  }, [routeDate]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, viewDate]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [habitsData, logsData] = await Promise.all([
        fetchHabits(user.id),
        fetchLogs(user.id, dateStr, dateStr),
      ]);
      setHabits(habitsData.filter((h) => h.is_active));
      setLogs(logsData);
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  const dueHabits = habits.filter((h) => isHabitDueOnDate(h, viewDate));
  // Also filter by start/end date for consistency with scoring
  const activeDueHabits = dueHabits.filter((h) => {
    const start = new Date(h.start_date);
    const end = new Date(h.end_date);
    const day = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate());
    return day >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
           day <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
  });

  const getLogForHabit = (habitId: string): HabitLog | undefined => {
    return logs.find((l) => l.habit_id === habitId && l.log_date === dateStr);
  };

  const handleLog = async (habitId: string, status: 'success' | 'partial' | 'fail') => {
    if (!user) return;
    if (isPast && !showPastWarning) {
      setShowPastWarning(true);
    }
    await upsertLog(habitId, user.id, dateStr, status);
    await loadData();
  };

  const goToPrevDay = () => setViewDate(subDays(viewDate, 1));
  const goToNextDay = () => setViewDate(addDays(viewDate, 1));
  const goToDate = (date: Date) => {
    setViewDate(date);
    setShowPastWarning(false);
  };

  const dayScore = computeDayScore(habits, logs, viewDate, today, signupDate);

  const barDays = Array.from({ length: DAYS_IN_BAR }, (_, i) => {
    const offset = i - Math.floor(DAYS_IN_BAR / 2);
    return addDays(viewDate, offset);
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      {/* Day bar */}
      <div className="flex items-center gap-1 mb-4">
        <button onClick={goToPrevDay}
          className="p-4 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-500 dark:text-gray-400 text-2xl shrink-0 min-w-[48px] min-h-[48px] flex items-center justify-center active:bg-gray-200 dark:active:bg-gray-700"
          aria-label="Previous day">←</button>

        <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-hide justify-center">
          {barDays.map((day) => {
            const isActive = format(day, 'yyyy-MM-dd') === format(viewDate, 'yyyy-MM-dd');
            const isDayToday = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
            return (
              <button key={day.toISOString()} onClick={() => goToDate(day)}
                className={`flex flex-col items-center px-3 py-2 rounded-lg min-w-0 transition-colors min-h-[48px] ${
                  isActive ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}>
                <span className="text-xs">{format(day, 'EEE')}</span>
                <span className={`text-sm ${isDayToday ? 'font-bold' : ''}`}>{format(day, 'd')}</span>
              </button>
            );
          })}
        </div>

        <button onClick={goToNextDay}
          className="p-4 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-500 dark:text-gray-400 text-2xl shrink-0 min-w-[48px] min-h-[48px] flex items-center justify-center active:bg-gray-200 dark:active:bg-gray-700"
          aria-label="Next day">→</button>
      </div>

      {/* Day status messages */}
      {dayScore.status === 'before_habits' && (
        <div className="mb-4 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-center text-sm text-gray-500 dark:text-gray-400">
          ⏳ No habits active yet for this date
        </div>
      )}
      {dayScore.status === 'future' && (
        <div className="mb-4 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-center text-sm text-gray-500 dark:text-gray-400">
          🔮 Future date — no logging yet
        </div>
      )}
      {dayScore.status === 'no_habits' && (
        <div className="mb-4 px-4 py-2 bg-green-50 dark:bg-green-950/30 rounded-lg text-center text-sm text-green-600 dark:text-green-400">
          🌿 Nothing due — rest day
        </div>
      )}

      {/* Progress bar for logged days */}
      {dayScore.status === 'success' && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span className="text-green-600 dark:text-green-400 font-medium">✅ All done</span>
            <span>{Math.round(dayScore.percent)}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-green-500" style={{ width: '100%' }} />
          </div>
        </div>
      )}
      {dayScore.status === 'partial' && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span className="text-yellow-600 dark:text-yellow-400 font-medium">🟡 Partial</span>
            <span>{Math.round(dayScore.percent)}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-yellow-500" style={{ width: `${Math.min(dayScore.percent, 100)}%` }} />
          </div>
        </div>
      )}
      {dayScore.status === 'fail' && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span className="text-red-600 dark:text-red-400 font-medium">❌ Missed</span>
            <span>{Math.round(dayScore.percent)}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(dayScore.percent, 100)}%` }} />
          </div>
        </div>
      )}

      {/* Past data warning */}
      {isPast && showPastWarning && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-2 mb-4 text-sm text-amber-700 dark:text-amber-300">
          ⚠️ You are editing data for a past date. This will affect your streaks and statistics.
        </div>
      )}

      {/* Habits list */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><p className="text-gray-400">Loading...</p></div>
      ) : activeDueHabits.length === 0 && dayScore.status === 'no_habits' ? null : activeDueHabits.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-lg mb-2">Nothing due this day 🎉</p>
          <p className="text-gray-400 text-sm">Head to the Habits tab to create new habits</p>
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
                  </div>
                </div>

                <div className="flex gap-2">
                  {(['success', 'partial', 'fail'] as const).map((status) => {
                    const isActive = log?.status === status;
                    const baseClasses = 'flex-1 py-3 rounded-lg text-sm font-medium transition-colors min-h-[44px]';
                    const activeClasses = isActive
                      ? status === 'success' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 ring-2 ring-green-400'
                        : status === 'partial' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 ring-2 ring-yellow-400'
                        : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 ring-2 ring-red-400'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700';

                    const label = status === 'success' ? habit.success_label || '✅ Done'
                      : status === 'partial' ? habit.partial_label || '🟡 Partial'
                      : habit.fail_label || '❌ Miss';

                    return (
                      <button key={status} onClick={() => handleLog(habit.id, status)} className={`${baseClasses} ${activeClasses}`}>
                        {label}
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