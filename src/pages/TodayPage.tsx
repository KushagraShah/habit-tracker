import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchHabits, fetchLogs, isHabitDueOnDate, upsertLog } from '../lib/habits';
import { computeDayScore } from '../utils/scoring';
import type { Habit, HabitLog } from '../types';
import { format, addDays, subDays } from 'date-fns';

export default function TodayPage() {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(new Date());
  const [showPastWarning, setShowPastWarning] = useState(false);

  const today = new Date();
  const isToday = format(viewDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
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
  const goToNextDay = () => {
    if (isPast || isToday) return; // can't go past today
    setViewDate(addDays(viewDate, 1));
  };
  const goToToday = () => {
    setViewDate(today);
    setShowPastWarning(false);
  };

  const dayScore = computeDayScore(habits, logs, viewDate, today);

  const viewDateName = format(viewDate, 'EEEE, MMMM d');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Date navigation bar */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={goToPrevDay}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
        >
          ←
        </button>
        <div className="text-center">
          <h2 className="text-lg font-bold text-gray-800">
            {isToday ? 'Today' : viewDateName}
          </h2>
          <p className="text-xs text-gray-400">
            {!isToday && (
              <button onClick={goToToday} className="text-indigo-500 hover:underline">
                Back to today
              </button>
            )}
          </p>
        </div>
        <button
          onClick={goToNextDay}
          disabled={!isPast && !isToday}
          className={`p-2 rounded-lg transition-colors ${
            !isPast && !isToday
              ? 'text-gray-200 cursor-not-allowed'
              : 'hover:bg-gray-100 text-gray-500'
          }`}
        >
          →
        </button>
      </div>

      {/* Day score */}
      {dayScore.status !== 'none' && (
        <div className={`text-center mb-4 px-4 py-2 rounded-lg text-sm font-medium ${
          dayScore.status === 'success' ? 'bg-green-50 text-green-700' :
          dayScore.status === 'partial' ? 'bg-yellow-50 text-yellow-700' :
          dayScore.status === 'fail' ? 'bg-red-50 text-red-700' :
          'bg-gray-50 text-gray-500'
        }`}>
          {dayScore.status === 'success' && '✅ Great day! All habits done'}
          {dayScore.status === 'partial' && `🟡 Partial day — ${Math.round(dayScore.percent)}% completed`}
          {dayScore.status === 'fail' && `❌ Missed — ${Math.round(dayScore.percent)}% completed`}
          <span className="text-xs ml-2">
            ({Math.round(dayScore.achieved * 2)}/{dayScore.total} pts)
          </span>
        </div>
      )}

      {/* Past data warning */}
      {isPast && showPastWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-4 text-sm text-amber-700">
          ⚠️ You are editing data for a past date. This will affect your streaks and statistics.
        </div>
      )}

      {dueHabits.length === 0 ? (
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
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: habit.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-800 truncate">
                      {habit.title}
                    </h3>
                    {habit.success_criteria && (
                      <p className="text-xs text-gray-400 truncate">
                        {habit.success_criteria}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  {(['success', 'partial', 'fail'] as const).map((status) => {
                    const isActive = log?.status === status;
                    const baseClasses =
                      'flex-1 py-2 rounded-lg text-sm font-medium transition-colors';
                    const activeClasses = isActive
                      ? status === 'success'
                        ? 'bg-green-100 text-green-700 ring-2 ring-green-400'
                        : status === 'partial'
                        ? 'bg-yellow-100 text-yellow-700 ring-2 ring-yellow-400'
                        : 'bg-red-100 text-red-700 ring-2 ring-red-400'
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100';

                    // Use custom labels if defined, fallback to defaults
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