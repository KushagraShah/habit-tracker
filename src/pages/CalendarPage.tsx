import { useEffect, useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
} from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { fetchHabits, fetchLogs, isHabitDueOnDate } from '../lib/habits';
import type { Habit, HabitLog } from '../types';

export default function CalendarPage() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, currentDate]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const startStr = format(calStart, 'yyyy-MM-dd');
      const endStr = format(calEnd, 'yyyy-MM-dd');
      const [habitsData, logsData] = await Promise.all([
        fetchHabits(user.id),
        fetchLogs(user.id, startStr, endStr),
      ]);
      setHabits(habitsData.filter((h) => h.is_active));
      setLogs(logsData);
    } catch (err) {
      console.error('Failed to load calendar data', err);
    } finally {
      setLoading(false);
    }
  };

  const getDayLogs = (date: Date): { habit: Habit; log?: HabitLog }[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dueHabits = habits.filter((h) => isHabitDueOnDate(h, date));
    return dueHabits.map((habit) => {
      const log = logs.find(
        (l) => l.habit_id === habit.id && l.log_date === dateStr
      );
      return { habit, log };
    });
  };

  const getDayScore = (date: Date): 'good' | 'mixed' | 'bad' | 'none' => {
    const dayLogs = getDayLogs(date);
    if (dayLogs.length === 0) return 'none';
    const logged = dayLogs.filter((dl) => dl.log);
    if (logged.length === 0) return 'bad';
    const allSuccess = logged.every((dl) => dl.log!.status === 'success');
    const allFail = logged.every(
      (dl) => dl.log!.status === 'fail' || !dl.log
    );
    if (allSuccess && logged.length === dayLogs.length) return 'good';
    if (allFail || logged.length === 0) return 'bad';
    return 'mixed';
  };

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={prevMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          ←
        </button>
        <h2 className="text-xl font-bold text-gray-800">
          {format(currentDate, 'MMMM yyyy')}
        </h2>
        <button
          onClick={nextMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          →
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400">Loading...</p>
        </div>
      ) : (
        <>
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div
                key={d}
                className="text-center text-xs font-medium text-gray-400 py-2"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const score = getDayScore(day);
              const isToday = isSameDay(day, new Date());
              const isCurrent = isSameMonth(day, currentDate);

              let bgColor = 'bg-gray-50';
              if (score === 'good') bgColor = 'bg-green-100';
              else if (score === 'mixed') bgColor = 'bg-yellow-100';
              else if (score === 'bad') bgColor = 'bg-red-100';

              return (
                <div
                  key={day.toISOString()}
                  className={`
                    aspect-square rounded-lg p-1 flex flex-col items-center justify-center
                    ${isCurrent ? bgColor : 'bg-gray-50 opacity-40'}
                    ${isToday ? 'ring-2 ring-indigo-400' : ''}
                  `}
                >
                  <span className="text-xs font-medium text-gray-600">
                    {format(day, 'd')}
                  </span>
                  {score !== 'none' && (
                    <div className="flex gap-0.5 mt-0.5">
                      {getDayLogs(day).map((dl) => (
                        <div
                          key={dl.habit.id}
                          className={`w-1.5 h-1.5 rounded-full ${
                            dl.log?.status === 'success'
                              ? 'bg-green-500'
                              : dl.log?.status === 'partial'
                              ? 'bg-yellow-500'
                              : dl.log?.status === 'fail'
                              ? 'bg-red-500'
                              : 'bg-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-6 text-xs text-gray-500 justify-center">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-green-100" /> All done
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-yellow-100" /> Mixed
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-red-100" /> Missed
            </span>
          </div>
        </>
      )}
    </div>
  );
}