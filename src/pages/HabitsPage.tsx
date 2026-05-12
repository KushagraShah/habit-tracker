import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchHabits,
  createHabit,
  updateHabit,
  deleteHabit,
} from '../lib/habits';
import type { Habit, RecurrenceDay } from '../types';
import { DAYS_OF_WEEK, EMOJIS } from '../types';
import { addDays, format } from 'date-fns';

export default function HabitsPage() {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('💪');
  const [successLabel, setSuccessLabel] = useState('');
  const [partialLabel, setPartialLabel] = useState('');
  const [failLabel, setFailLabel] = useState('');
  const [selectedDays, setSelectedDays] = useState<RecurrenceDay[]>([]);
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 30), 'yyyy-MM-dd'));

  useEffect(() => {
    if (!user) return;
    loadHabits();
  }, [user]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const loadHabits = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchHabits(user.id);
      setHabits(data);
    } catch (err) {
      console.error('Failed to load habits', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setEmoji('💪');
    setShowEmojiPicker(false);
    setSuccessLabel('');
    setPartialLabel('');
    setFailLabel('');
    setSelectedDays([]);
    setStartDate(format(new Date(), 'yyyy-MM-dd'));
    setEndDate(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
    setEditingHabit(null);
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
    setShowForm(true);
  };

  const toggleDay = (day: RecurrenceDay) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (selectedDays.length === 0) return;

    const habitData = {
      user_id: user.id,
      title,
      description: description || null,
      emoji,
      recurrence: selectedDays,
      success_label: successLabel || null,
      partial_label: partialLabel || null,
      fail_label: failLabel || null,
      start_date: startDate,
      end_date: endDate,
      sort_order: 0,
      is_active: true,
    };

    try {
      if (editingHabit) {
        await updateHabit(editingHabit.id, {
          ...habitData,
          updated_at: new Date().toISOString(),
        });
      } else {
        await createHabit(habitData as any);
      }
      resetForm();
      await loadHabits();
    } catch (err) {
      console.error('Failed to save habit', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this habit? This will also remove all its logs.'))
      return;
    try {
      await deleteHabit(id);
      await loadHabits();
    } catch (err) {
      console.error('Failed to delete habit', err);
    }
  };

  const handleToggleActive = async (habit: Habit) => {
    try {
      await updateHabit(habit.id, {
        is_active: !habit.is_active,
        updated_at: new Date().toISOString(),
      });
      await loadHabits();
    } catch (err) {
      console.error('Failed to toggle habit', err);
    }
  };

  const formatRecurrence = (days: RecurrenceDay[]) => {
    if (days.length === 7) return 'Every day';
    if (days.length === 5 && !days.includes('Sat') && !days.includes('Sun'))
      return 'Weekdays';
    if (days.length === 2 && days.includes('Sat') && days.includes('Sun'))
      return 'Weekends';
    return days.join(', ');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">My Habits</h2>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">+ New Habit</button>
      </div>

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
                  <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="text-2xl w-14 h-[42px] flex items-center justify-center border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    title="Pick an emoji">
                    {emoji}
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg p-2 w-72">
                      <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
                        {EMOJIS.map((e: string) => (
                          <button key={e} type="button"
                            onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
                            className={`text-xl w-7 h-7 flex items-center justify-center rounded hover:bg-indigo-100 dark:hover:bg-indigo-900 ${
                              emoji === e ? 'bg-indigo-100 dark:bg-indigo-900 ring-2 ring-indigo-400' : ''
                            }`}>
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                  <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100"
                    placeholder="e.g. Go to the gym" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100"
                  placeholder="(optional)" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start date</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End date</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100 text-sm" />
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Button Labels (optional)
                </label>
                <p className="text-xs text-gray-400 mb-2">Custom text for action buttons on Report page</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-green-600 mb-1">Success</label>
                    <input type="text" value={successLabel} onChange={(e) => setSuccessLabel(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100"
                      placeholder="e.g. Good workout" />
                  </div>
                  <div>
                    <label className="block text-xs text-yellow-600 mb-1">Partial</label>
                    <input type="text" value={partialLabel} onChange={(e) => setPartialLabel(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100"
                      placeholder="(optional)" />
                  </div>
                  <div>
                    <label className="block text-xs text-red-600 mb-1">Fail</label>
                    <input type="text" value={failLabel} onChange={(e) => setFailLabel(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100"
                      placeholder="e.g. Skipped" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recurrence (days)</label>
                <div className="flex gap-1 flex-wrap">
                  {DAYS_OF_WEEK.map((day) => (
                    <button key={day} type="button" onClick={() => toggleDay(day)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedDays.includes(day) ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                      }`}>{day}</button>
                  ))}
                </div>
                {selectedDays.length === 0 && <p className="text-xs text-red-400 mt-1">Select at least one day</p>}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={selectedDays.length === 0}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {editingHabit ? 'Save Changes' : 'Create Habit'}
                </button>
                <button type="button" onClick={resetForm}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
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
            <div key={habit.id}
              className={`bg-white dark:bg-gray-900 rounded-xl shadow-sm border p-4 ${
                habit.is_active ? 'border-gray-100 dark:border-gray-700' : 'border-gray-100 dark:border-gray-700 opacity-50'
              }`}>
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
                  <button onClick={() => handleToggleActive(habit)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      habit.is_active ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-green-100 text-green-600 hover:bg-green-200'
                    }`}>{habit.is_active ? 'Pause' : 'Resume'}</button>
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