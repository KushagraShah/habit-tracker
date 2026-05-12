import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
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

  const getDayScore = (date: Date) => computeDayScore(habits, logs, date, today, signupDate);
  const streak = computeStreak(habits, logs, today, signupDate);

  const handleDayClick = (date: Date) => {
    navigate(`/today/${format(date, 'yyyy-MM-dd')}`);
  };

  // Compute streak date set for highlighting
  const streakDates = new Set<string>();
  if (streak > 0) {
    const current = new Date();
    for (let i = 0; i < 365; i++) {
      const score = computeDayScore(habits, logs, current, today, signupDate);
      if (score.status === 'before_habits') break;
      if (score.status === 'fail') break;
      if (score.status === 'no_habits' || score.status === 'future' || score.status === 'none') {
        current.setDate(current.getDate() - 1);
        continue;
      }
      streakDates.add(format(current, 'yyyy-MM-dd'));
      current.setDate(current.getDate() - 1);
      if (streakDates.size >= streak) break;
    }
  }

  const getDayDots = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return habits
      .filter((h) => {
        const start = new Date(h.start_date);
        const end = new Date(h.end_date);
        const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return day >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
               day <= new Date(end.getFullYear(), end.getMonth(), end.getDate()) &&
               isHabitDueOnDate(h, date);
      })
      .map((h) => {
        const log = logs.find((l) => l.habit_id === h.id && l.log_date === dateStr);
        return {
          id: h.id,
          color: !log ? 'bg-gray-300' : log.status === 'success' ? 'bg-green-500' : log.status === 'partial' ? 'bg-yellow-500' : 'bg-red-500',
        };
      });
  };

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">←</button>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{format(currentDate, 'MMMM yyyy')}</h2>
        <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">→</button>
      </div>

      {/* Current streak display - prominent */}
      {streak > 0 && (
        <div className="text-center mb-4 px-4 py-3 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl border border-orange-200 dark:border-orange-700/50">
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl">🔥</span>
            <div>
              <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">{streak}</span>
              <span className="text-orange-500 dark:text-orange-300 ml-1 font-medium">day streak</span>
            </div>
          </div>
          <p className="text-xs text-orange-400 dark:text-orange-500 mt-1">No failed days — keep going!</p>
        </div>
      )}
      {streak === 0 && habits.length > 0 && (
        <div className="text-center mb-4 px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <span className="text-gray-400 text-sm">No active streak — log a successful day to start one 🔥</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64"><p className="text-gray-400">Loading...</p></div>
      ) : (
        <>
          <div className="grid grid-cols-7 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 py-2">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const score = getDayScore(day);
              const isDayToday = isSameDay(day, today);
              const isCurrent = isSameMonth(day, currentDate);
              const dots = getDayDots(day);
              const dateKey = format(day, 'yyyy-MM-dd');
              const isInStreak = streakDates.has(dateKey);

              let bgColor = 'bg-green-50 dark:bg-green-950/30'; // no issues
              if (score.status === 'before_habits') bgColor = 'bg-gray-100 dark:bg-gray-800';
              else if (score.status === 'future') bgColor = 'bg-gray-100 dark:bg-gray-800';
              else if (score.status === 'no_habits') bgColor = 'bg-green-50 dark:bg-green-950/30';
              else if (score.status === 'partial') bgColor = 'bg-yellow-100 dark:bg-yellow-900/30';
              else if (score.status === 'fail') bgColor = 'bg-red-100 dark:bg-red-900/30';
              else if (score.status === 'success') bgColor = isInStreak ? 'bg-emerald-200 dark:bg-emerald-800/50' : 'bg-green-100 dark:bg-green-900/30';

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => handleDayClick(day)}
                  className={`
                    aspect-square rounded-lg p-1 flex flex-col items-center justify-center cursor-pointer
                    ${isCurrent ? bgColor : 'bg-gray-50 dark:bg-gray-800/50 opacity-40'}
                    ${isDayToday ? 'ring-2 ring-indigo-400' : ''}
                    hover:ring-1 hover:ring-indigo-300 transition-all
                  `}
                >
                  <span className={`text-xs font-medium ${
                    score.status === 'fail' ? 'text-red-600 dark:text-red-400' :
                    score.status === 'partial' ? 'text-yellow-700 dark:text-yellow-400' :
                    score.status === 'before_habits' ? 'text-gray-400' :
                    score.status === 'future' ? 'text-gray-400' :
                    'text-green-700 dark:text-green-400'
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
                  {isInStreak && dots.length > 0 && (
                    <span className="text-[8px] mt-0.5">🔥</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-4 mt-6 text-xs text-gray-500 dark:text-gray-400 justify-center flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/30 border border-green-200" /> Success / Off</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 dark:bg-yellow-900/30" /> Partial</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 dark:bg-red-900/30" /> Failed</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200 dark:bg-emerald-800/50" /> Streak</span>
          </div>
        </>
      )}
    </div>
  );
}