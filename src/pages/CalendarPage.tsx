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
import { computeDayScore, computeStreak } from '../utils/scoring';
import type { Habit, HabitLog } from '../types';

export default function CalendarPage() {
  const { user, signupDate } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
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

      // Fetch extra logs going back ~60 days for streak + proper scoring
      const streakStart = subMonths(new Date(), 2);
      const streakStartStr = format(streakStart, 'yyyy-MM-dd');

      const [habitsData, logsData, extraLogs] = await Promise.all([
        fetchHabits(user.id),
        fetchLogs(user.id, startStr, endStr),
        fetchLogs(user.id, streakStartStr, startStr),
      ]);
      setHabits(habitsData.filter((h) => h.is_active));
      setLogs([...extraLogs, ...logsData]);
    } catch (err) {
      console.error('Failed to load calendar data', err);
    } finally {
      setLoading(false);
    }
  };

  const getDayScore = (date: Date) => {
    return computeDayScore(habits, logs, date, today, signupDate);
  };

  // Get due habit dots for a specific day
  const getDayDots = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return habits
      .filter((h) => {
        const habitCreated = new Date(h.created_at);
        const habitDate = new Date(habitCreated.getFullYear(), habitCreated.getMonth(), habitCreated.getDate());
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return dayStart >= habitDate && isHabitDueOnDate(h, date);
      })
      .map((h) => {
        const log = logs.find((l) => l.habit_id === h.id && l.log_date === dateStr);
        return {
          id: h.id,
          color: !log
            ? 'bg-gray-300'
            : log.status === 'success'
            ? 'bg-green-500'
            : log.status === 'partial'
            ? 'bg-yellow-500'
            : 'bg-red-500',
        };
      });
  };

  const streak = computeStreak(habits, logs, today, signupDate);

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">←</button>
        <h2 className="text-xl font-bold text-gray-800">{format(currentDate, 'MMMM yyyy')}</h2>
        <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">→</button>
      </div>

      {/* Streak counter */}
      {streak > 0 && (
        <div className="text-center mb-4 px-4 py-2 bg-orange-50 rounded-lg">
          <span className="text-orange-600 font-bold text-lg">🔥 {streak}</span>
          <span className="text-orange-500 text-sm ml-1">day streak (no failed days)</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400">Loading...</p>
        </div>
      ) : (
        <>
          {/* Day headers - Mon first */}
          <div className="grid grid-cols-7 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const score = getDayScore(day);
              const isDayToday = isSameDay(day, today);
              const isCurrent = isSameMonth(day, currentDate);
              const dots = getDayDots(day);

              // Color logic:
              // 'no_habits' = green (nothing due = no problem)
              // 'success' = green
              // 'partial' = yellow
              // 'fail' = red
              let bgColor = 'bg-green-50'; // Default: no issues
              if (score.status === 'partial') bgColor = 'bg-yellow-100';
              else if (score.status === 'fail') bgColor = 'bg-red-100';

              return (
                <div
                  key={day.toISOString()}
                  className={`
                    aspect-square rounded-lg p-1 flex flex-col items-center justify-center
                    ${isCurrent ? bgColor : 'bg-gray-50 opacity-40'}
                    ${isDayToday ? 'ring-2 ring-indigo-400' : ''}
                  `}
                >
                  <span className={`text-xs font-medium ${
                    score.status === 'fail' ? 'text-red-600' :
                    score.status === 'partial' ? 'text-yellow-700' :
                    'text-green-700'
                  }`}>
                    {format(day, 'd')}
                  </span>
                  {dots.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                      {dots.map((dot) => (
                        <div key={dot.id} className={`w-1.5 h-1.5 rounded-full ${dot.color}`} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-6 text-xs text-gray-500 justify-center flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-50 border border-green-200" /> Success / Off</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100" /> Partial</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100" /> Failed</span>
          </div>
        </>
      )}
    </div>
  );
}