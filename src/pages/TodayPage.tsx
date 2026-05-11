import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchHabits, fetchLogs, isHabitDueOnDate, upsertLog } from '../lib/habits';
import type { Habit, HabitLog } from '../types';
import { format } from 'date-fns';

export default function TodayPage() {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);

  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [habitsData, logsData] = await Promise.all([
        fetchHabits(user.id),
        fetchLogs(user.id, today, today),
      ]);
      setHabits(habitsData.filter((h) => h.is_active));
      setLogs(logsData);
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  const dueHabits = habits.filter((h) => isHabitDueOnDate(h, new Date()));

  const getLogForHabit = (habitId: string): HabitLog | undefined => {
    return logs.find((l) => l.habit_id === habitId && l.log_date === today);
  };

  const handleLog = async (habitId: string, status: 'success' | 'partial' | 'fail') => {
    if (!user) return;
    await upsertLog(habitId, user.id, today, status);
    await loadData();
  };

  const todayName = format(new Date(), 'EEEE, MMMM d');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-gray-800 mb-1">Today</h2>
      <p className="text-gray-500 text-sm mb-6">{todayName}</p>

      {dueHabits.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-lg mb-2">Nothing due today 🎉</p>
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
                    return (
                      <button
                        key={status}
                        onClick={() => handleLog(habit.id, status)}
                        className={`${baseClasses} ${activeClasses}`}
                      >
                        {status === 'success'
                          ? '✅ Done'
                          : status === 'partial'
                          ? '🟡 Partial'
                          : '❌ Miss'}
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