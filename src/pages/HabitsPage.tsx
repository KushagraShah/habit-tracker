import { useCallback, useEffect, useRef, useState } from 'react';
import { addYears } from 'date-fns';
import { useAuth } from '../contexts/useAuth';
import {
  createHabit,
  deleteHabit,
  fetchHabits,
  updateHabit,
} from '../lib/habits';
import type { Habit, HabitCreateInput, PausePeriod, RecurrenceDay } from '../types';
import { DAYS_OF_WEEK, EMOJIS } from '../types';
import { formatDateOnly, isAfterDateOnly, todayLocal } from '../utils/date';

const DEFAULT_HABIT_YEARS = 10;

function getDefaultEndDate(): string {
  return formatDateOnly(addYears(todayLocal(), DEFAULT_HABIT_YEARS));
}

function closeOpenPausePeriod(periods: PausePeriod[], date: string): PausePeriod[] {
  return periods.map((period) => (
    period.end ? period : { ...period, end: date }
  ));
}

export default function HabitsPage() {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('💪');
  const [successLabel, setSuccessLabel] = useState('');
  const [partialLabel, setPartialLabel] = useState('');
  const [failLabel, setFailLabel] = useState('');
  const [selectedDays, setSelectedDays] = useState<RecurrenceDay[]>([]);
  const [startDate, setStartDate] = useState(formatDateOnly(todayLocal()));
  const [endDate, setEndDate] = useState(getDefaultEndDate());

  const loadHabits = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchHabits(user.id);
      setHabits(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load habits');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadHabits();
  }, [loadHabits]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setEmoji('💪');
    setShowEmojiPicker(false);
    setSuccessLabel('');
    setPartialLabel('');
    setFailLabel('');
    setSelectedDays([]);
    setStartDate(formatDateOnly(todayLocal()));
    setEndDate(getDefaultEndDate());
    setEditingHabit(null);
    setFormError('');
    setShowForm(false);
  };

  const openEdit = (habit: Habit) => {
    setTitle(habit.title);
    setDescription(habit.description || '');
    setEmoji(habit.emoji || '💪');
    setShowEmojiPicker(false);
    setSuccessLabel(habit.success_label || '');
    setPartialLabel(habit.partial_label || '');
    setFailLabel(habit.fail_label || '');
    setSelectedDays(habit.recurrence);
    setStartDate(habit.start_date);
    setEndDate(habit.end_date);
    setEditingHabit(habit);
    setFormError('');
    setShowForm(true);
  };

  const toggleDay = (day: RecurrenceDay) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((selected) => selected !== day) : [...prev, day]
    );
  };

  const validateForm = (): boolean => {
    if (!title.trim()) {
      setFormError('Title is required.');
      return false;
    }
    if (selectedDays.length === 0) {
      setFormError('Select at least one recurrence day.');
      return false;
    }
    if (isAfterDateOnly(new Date(`${startDate}T00:00:00`), new Date(`${endDate}T00:00:00`))) {
      setFormError('End date must be on or after start date.');
      return false;
    }
    setFormError('');
    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !validateForm()) return;

    const baseHabitData = {
      title: title.trim(),
      description: description.trim() || null,
      emoji,
      recurrence: selectedDays,
      success_label: successLabel.trim() || null,
      partial_label: partialLabel.trim() || null,
      fail_label: failLabel.trim() || null,
      start_date: startDate,
      end_date: endDate,
      sort_order: editingHabit?.sort_order ?? habits.length,
      is_active: editingHabit?.is_active ?? true,
      pause_periods: editingHabit?.pause_periods ?? [],
    };

    try {
      setError('');
      if (editingHabit) {
        await updateHabit(editingHabit.id, baseHabitData);
      } else {
        const createInput: HabitCreateInput = {
          ...baseHabitData,
          user_id: user.id,
        };
        await createHabit(createInput);
      }
      resetForm();
      await loadHabits();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save habit');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this habit? This will also remove all its logs.')) return;
    try {
      setError('');
      await deleteHabit(id);
      await loadHabits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete habit');
    }
  };

  const handleToggleActive = async (habit: Habit) => {
    const today = formatDateOnly(todayLocal());
    const pausePeriods = habit.pause_periods ?? [];
    const nextPausePeriods = habit.is_active
      ? [...pausePeriods, { start: today, end: null }]
      : closeOpenPausePeriod(pausePeriods, today);

    try {
      setError('');
      await updateHabit(habit.id, {
        is_active: !habit.is_active,
        pause_periods: nextPausePeriods,
      });
      await loadHabits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update habit status');
    }
  };

  const formatRecurrence = (days: RecurrenceDay[]) => {
    if (days.length === 7) return 'Every day';
    if (days.length === 5 && !days.includes('Sat') && !days.includes('Sun')) return 'Weekdays';
    if (days.length === 2 && days.includes('Sat') && days.includes('Sun')) return 'Weekends';
    return DAYS_OF_WEEK.filter((day) => days.includes(day)).join(', ');
  };

  const submitDisabled = selectedDays.length === 0 || !title.trim();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">My Habits</h2>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + New Habit
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-700 rounded-lg px-4 py-2 mb-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">
              {editingHabit ? 'Edit Habit' : 'New Habit'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex gap-2 items-start">
                <div ref={emojiRef} className="relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Icon</label>
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker((show) => !show)}
                    className="text-2xl w-14 h-[42px] flex items-center justify-center border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    title="Pick an emoji"
                  >
                    {emoji}
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg p-2 w-72">
                      <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
                        {EMOJIS.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => { setEmoji(option); setShowEmojiPicker(false); }}
                            className={`text-xl w-7 h-7 flex items-center justify-center rounded hover:bg-indigo-100 dark:hover:bg-indigo-900 ${
                              emoji === option ? 'bg-indigo-100 dark:bg-indigo-900 ring-2 ring-indigo-400' : ''
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100"
                    placeholder="e.g. Go to the gym"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100"
                  placeholder="(optional)"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100 text-sm"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Defaults far in the future so habits do not expire after 30 days.</p>
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Button Labels (optional)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" value={successLabel} onChange={(event) => setSuccessLabel(event.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100" placeholder="Success" />
                  <input type="text" value={partialLabel} onChange={(event) => setPartialLabel(event.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100" placeholder="Partial" />
                  <input type="text" value={failLabel} onChange={(event) => setFailLabel(event.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100" placeholder="Miss" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recurrence (days)</label>
                <div className="flex gap-1 flex-wrap">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedDays.includes(day) ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {formError && <p className="text-sm text-red-500">{formError}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitDisabled}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {editingHabit ? 'Save Changes' : 'Create Habit'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64"><p className="text-gray-400">Loading...</p></div>
      ) : habits.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-lg mb-2">No habits yet</p>
          <p className="text-gray-400 text-sm">Create your first habit to get started!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {habits.map((habit) => (
            <div
              key={habit.id}
              className={`bg-white dark:bg-gray-900 rounded-xl shadow-sm border p-4 ${
                habit.is_active ? 'border-gray-100 dark:border-gray-700' : 'border-gray-100 dark:border-gray-700 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{habit.emoji || '📋'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate">{habit.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      habit.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                    }`}>{habit.is_active ? 'Active' : 'Paused'}</span>
                  </div>
                  <p className="text-xs text-gray-400">{formatRecurrence(habit.recurrence)}</p>
                  <p className="text-xs text-gray-400">{habit.start_date} → {habit.end_date}</p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => handleToggleActive(habit)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      habit.is_active ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-green-100 text-green-600 hover:bg-green-200'
                    }`}
                  >
                    {habit.is_active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => openEdit(habit)} className="p-2 text-sm text-gray-400 hover:text-gray-600" title="Edit">✏️</button>
                  <button onClick={() => handleDelete(habit.id)} className="p-2 text-sm text-gray-400 hover:text-red-500" title="Delete">🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
