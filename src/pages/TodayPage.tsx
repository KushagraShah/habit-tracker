import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchHabits, fetchLogs, isHabitDueOnDate, upsertLog } from '../lib/habits';
import { computeDayScore } from '../utils/scoring';
import type { Habit, HabitLog } from '../types';
import { format, addDays, subDays } from 'date-fns';

const DAYS_IN_BAR = 7;

export default function TodayPage() {
  const { user, signupDate } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(new Date());
  const [showPastWarning, setShowPastWarning] = useState(false);

  const today = new Date();
  const isPast = viewDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStr = format(viewDate, 'yyyy-MM-dd');

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
        <button
          onClick={goToPrevDay}
          className="p-4 hover:bg-gray-100 rounded-xl transition-colors text-gray-500 text-2xl shrink-0 min-w-[48px] min-h-[48px] flex items-center justify-center active:bg-gray-200"
          aria-label="Previous day"
        >
          ←
        </button>

        <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-hide justify-center">
          {barDays.map((day) => {
            const isActive = format(day, 'yyyy-MM-dd') === format(viewDate, 'yyyy-MM-dd');
            const isDayToday = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
            const dayStr = format(day, 'EEE');
            const dateStr_ = format(day, 'd');
            return (
              <button
                key={day.toISOString()}
                onClick={() => goToDate(day)}
                className={`flex flex-col items-center px-3 py-2 rounded-lg min-w-0 transition-colors min-h-[48px] ${
                  isActive
                    ? 'bg-indigo-100 text-indigo-700 font-semibold'
                    : 'hover:bg-gray-100 text-gray-500'
                }`}
              >
                <span className="text-xs">{dayStr}</span>
                <span className={`text-sm ${isDayToday ? 'font-bold' : ''}`}>{dateStr_}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={goToNextDay}
          className="p-4 hover:bg-gray-100 rounded-xl transition-colors text-gray-500 text-2xl shrink-0 min-w-[48px] min-h-[48px] flex items-center justify-center active:bg-gray-200"
          aria-label="Next day"
        >
          →
        </button>
      </div>

      {/* Progress bar */}
      {dayScore.status === 'success' && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span className="text-green-600 font-medium">✅ All done</span>
            <span>{Math.round(dayScore.percent)}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-green-500" style={{ width: '100%' }} />
          </div>
        </div>
      )}
      {dayScore.status === 'partial' && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span className="text-yellow-600 font-medium">🟡 Partial</span>
            <span>{Math.round(dayScore.percent)}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-yellow-500" style={{ width: `${Math.min(dayScore.percent, 100)}%` }} />
          </div>
        </div>
      )}
      {dayScore.status === 'fail' && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span className="text-red-600 font-medium">❌ Missed</span>
            <span>{Math.round(dayScore.percent)}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(dayScore.percent, 100)}%` }} />
          </div>
        </div>
      )}

      {/* Past data warning */}
      {isPast && showPastWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-4 text-sm text-amber-700">
          ⚠️ You are editing data for a past date. This will affect your streaks and statistics.
        </div>
      )}

      {/* Habits list */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-gray-400">Loading...</p>
        </div>
      ) : dueHabits.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-lg mb-2">Nothing due this day 🎉</p>
          <p className="text-gray-400 text-sm">
            Head to the Habits tab to create new habits
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {dueHabits.map((habit) => {
            const log = getLogForHabit(habit.id);
            return (
              <div
                key={habit.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{habit.emoji || '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800 truncate">
                      {habit.title}
                    </h3>
                    {habit.description && (
                      <p className="text-xs text-gray-400 truncate">
                        {habit.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  {(['success', 'partial', 'fail'] as const).map((status) => {
                    const isActive = log?.status === status;
                    const baseClasses =
                      'flex-1 py-3 rounded-lg text-sm font-medium transition-colors min-h-[44px]';
                    const activeClasses = isActive
                      ? status === 'success'
                        ? 'bg-green-100 text-green-700 ring-2 ring-green-400'
                        : status === 'partial'
                        ? 'bg-yellow-100 text-yellow-700 ring-2 ring-yellow-400'
                        : 'bg-red-100 text-red-700 ring-2 ring-red-400'
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100';

                    const label =
                      status === 'success'
                        ? habit.success_label || '✅ Done'
                        : status === 'partial'
                        ? habit.partial_label || '🟡 Partial'
                        : habit.fail_label || '❌ Miss';

                    return (
                      <button
                        key={status}
                        onClick={() => handleLog(habit.id, status)}
                        className={`${baseClasses} ${activeClasses}`}
                      >
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