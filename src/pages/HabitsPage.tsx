import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchHabits,
  createHabit,
  updateHabit,
  deleteHabit,
} from '../lib/habits';
import type { Habit, RecurrenceDay } from '../types';
import { DAYS_OF_WEEK } from '../types';

const COLORS = [
  '#4f46e5', // indigo
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#db2777', // pink
  '#2563eb', // blue
];

export default function HabitsPage() {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [selectedDays, setSelectedDays] = useState<RecurrenceDay[]>([]);
  const [color, setColor] = useState(COLORS[0]);

  useEffect(() => {
    if (!user) return;
    loadHabits();
  }, [user]);

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
    setSuccessCriteria('');
    setSelectedDays([]);
    setColor(COLORS[0]);
    setEditingHabit(null);
    setShowForm(false);
  };

  const openEdit = (habit: Habit) => {
    setTitle(habit.title);
    setDescription(habit.description || '');
    setSuccessCriteria(habit.success_criteria || '');
    setSelectedDays(habit.recurrence);
    setColor(habit.color);
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
      recurrence: selectedDays,
      success_criteria: successCriteria || null,
      color,
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
        <h2 className="text-xl font-bold text-gray-800">My Habits</h2>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + New Habit
        </button>
      </div>

      {/* Habit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              {editingHabit ? 'Edit Habit' : 'New Habit'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="e.g. Go to the gym"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="e.g. Morning workout at 7am"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Success Criteria (optional)
                </label>
                <input
                  type="text"
                  value={successCriteria}
                  onChange={(e) => setSuccessCriteria(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="e.g. At least 30 min of exercise"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recurrence (select days)
                </label>
                <div className="flex gap-1 flex-wrap">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedDays.includes(day)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                {selectedDays.length === 0 && (
                  <p className="text-xs text-red-400 mt-1">
                    Select at least one day
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-8 h-8 rounded-full ${
                        color === c ? 'ring-2 ring-offset-2 ring-indigo-400' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={selectedDays.length === 0}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {editingHabit ? 'Save Changes' : 'Create Habit'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Habits List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400">Loading...</p>
        </div>
      ) : habits.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-lg mb-2">No habits yet</p>
          <p className="text-gray-400 text-sm">
            Create your first habit to get started!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {habits.map((habit) => (
            <div
              key={habit.id}
              className={`bg-white rounded-xl shadow-sm border p-4 ${
                habit.is_active ? 'border-gray-100' : 'border-gray-100 opacity-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: habit.color }}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 truncate">
                    {habit.title}
                  </h3>
                  <p className="text-xs text-gray-400">
                    {formatRecurrence(habit.recurrence)}
                    {habit.success_criteria && ` · ${habit.success_criteria}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleToggleActive(habit)}
                    className="p-2 text-xs text-gray-400 hover:text-gray-600"
                    title={habit.is_active ? 'Disable' : 'Enable'}
                  >
                    {habit.is_active ? '🟢' : '⚪'}
                  </button>
                  <button
                    onClick={() => openEdit(habit)}
                    className="p-2 text-sm text-gray-400 hover:text-gray-600"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(habit.id)}
                    className="p-2 text-sm text-gray-400 hover:text-red-500"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}