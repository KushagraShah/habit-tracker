import { useCallback, useEffect, useRef, useState } from 'react';
import { addYears } from 'date-fns';
import GraphemeSplitter from 'grapheme-splitter';
import emojiRegex from 'emoji-regex';
import { useAuth } from '../contexts/useAuth';
import {
  createHabit,
  deleteHabit,
  fetchAllLogs,
  fetchHabits,
  fetchLogs,
  updateHabit,
  computeHabitStreaks,
  swapOrderIndex,
} from '../lib/habits';
import type { Habit, HabitCreateInput, PausePeriod, RecurrenceDay, SchedulingType } from '../types';
import { DAYS_OF_WEEK, EMOJIS } from '../types';
import { formatDateOnly, isAfterDateOnly, todayLocal } from '../utils/date';

const DEFAULT_HABIT_YEARS = 1;
const splitter = new GraphemeSplitter();

function getDefaultEndDate(): string {
  return formatDateOnly(addYears(todayLocal(), DEFAULT_HABIT_YEARS));
}

function extractSingleEmoji(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const graphemes = splitter.splitGraphemes(trimmed);
  const first = graphemes[0] ?? '';
  const regex = emojiRegex();
  const matches = first.match(regex);

  if (!matches || matches[0] !== first) {
    return '';
  }

  return first;
}

function closeOpenPausePeriod(periods: PausePeriod[], date: string): PausePeriod[] {
  return periods.map((period) => (
    period.end ? period : { ...period, end: date }
  ));
}

function getPauseLabel(habit: Habit): string {
  if (!habit.is_active) {
    const openPeriod = (habit.pause_periods ?? []).find(p => !p.end);
    if (openPeriod) return 'Paused indefinitely';
    if (habit.pause_until) return `Paused until ${habit.pause_until}`;
    return 'Paused';
  }
  return '';
}

export default function HabitsPage() {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [allLogs, setAllLogs] = useState<Record<string, import('../types').HabitLog[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [formError, setFormError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showManualEmojiInput, setShowManualEmojiInput] = useState(false);
  const [manualEmojiDraft, setManualEmojiDraft] = useState('');
  const [manualEmojiHint, setManualEmojiHint] = useState('');
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
  const [schedulingType, setSchedulingType] = useState<SchedulingType>('fixed_weekdays');
  const [weeklyTarget, setWeeklyTarget] = useState(4);
  const [eligibleWeekdays, setEligibleWeekdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]); // 0=Sun...6=Sat
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const [deleteTarget, setDeleteTarget] = useState<Habit | null>(null);
  const [pauseTarget, setPauseTarget] = useState<Habit | null>(null);
  const [pauseAction, setPauseAction] = useState<'indefinite' | 'until' | 'resume' | null>(null);
  const [pauseUntilDate, setPauseUntilDate] = useState('');

  const [todayDate] = useState(() => todayLocal());
  const todayStr = formatDateOnly(todayDate);
  const todayMinStr = todayStr;

  const loadHabits = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const today = todayDate;
      const data = await fetchHabits(user.id);
      setHabits(data);

      const endStr = formatDateOnly(today);
      const start = new Date(today);
      start.setDate(start.getDate() - 90);
      const startStr = formatDateOnly(start);

      const logsData = await fetchLogs(user.id, startStr, endStr);
      const logsByHabit: Record<string, import('../types').HabitLog[]> = {};
      for (const log of logsData) {
        if (!logsByHabit[log.habit_id]) logsByHabit[log.habit_id] = [];
        logsByHabit[log.habit_id].push(log);
      }
      setAllLogs(logsByHabit);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load habits');
    } finally {
      setLoading(false);
    }
  }, [user, todayDate]);

  useEffect(() => {
    void loadHabits();
  }, [loadHabits]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
        setShowManualEmojiInput(false);
        setManualEmojiDraft('');
        setManualEmojiHint('');
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
    setShowManualEmojiInput(false);
    setManualEmojiDraft('');
    setManualEmojiHint('');
    setSuccessLabel('');
    setPartialLabel('');
    setFailLabel('');
    setSelectedDays([]);
    setStartDate(formatDateOnly(todayLocal()));
    setEndDate(getDefaultEndDate());
    setSchedulingType('fixed_weekdays');
    setWeeklyTarget(4);
    setEligibleWeekdays([0, 1, 2, 3, 4, 5, 6]);
    setEditingHabit(null);
    setFormError('');
    setShowForm(false);
  };

  const openEdit = (habit: Habit) => {
    setTitle(habit.title);
    setDescription(habit.description || '');
    setEmoji(habit.emoji || '💪');
    setShowEmojiPicker(false);
    setShowManualEmojiInput(false);
    setManualEmojiDraft('');
    setManualEmojiHint('');
    setSuccessLabel(habit.success_label || '');
    setPartialLabel(habit.partial_label || '');
    setFailLabel(habit.fail_label || '');
    setSelectedDays(habit.recurrence);
    setStartDate(habit.start_date);
    setEndDate(habit.end_date);
    setSchedulingType(habit.scheduling_type || 'fixed_weekdays');
    setWeeklyTarget(habit.weekly_target || 4);
    setEligibleWeekdays(habit.eligible_weekdays ?? [0, 1, 2, 3, 4, 5, 6]);
    setEditingHabit(habit);
    setFormError('');
    setShowForm(true);
  };

  const toggleDay = (day: RecurrenceDay) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((selected) => selected !== day) : [...prev, day]
    );
  };

  const handleManualEmojiChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextEmoji = extractSingleEmoji(event.target.value);

    if (!event.target.value.trim()) {
      setManualEmojiDraft('');
      setManualEmojiHint('');
      return;
    }

    if (!nextEmoji) {
      setManualEmojiDraft('');
      setManualEmojiHint('Please enter one emoji.');
      return;
    }

    setManualEmojiDraft(nextEmoji);
    setManualEmojiHint('');
    setEmoji(nextEmoji);
    setShowManualEmojiInput(false);
    setShowEmojiPicker(false);
  };

  const validateForm = (): boolean => {
    if (!title.trim()) {
      setFormError('Title is required.');
      return false;
    }
    if (schedulingType === 'fixed_weekdays' && selectedDays.length === 0) {
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
      emoji: emoji || '💪',
      recurrence: schedulingType === 'fixed_weekdays' ? selectedDays : [],
      scheduling_type: schedulingType,
      weekly_target: schedulingType === 'flexible_weekly' ? weeklyTarget : null,
      success_label: successLabel.trim() || null,
      partial_label: partialLabel.trim() || null,
      fail_label: failLabel.trim() || null,
      start_date: startDate,
      end_date: endDate,
      sort_order: editingHabit?.sort_order ?? habits.length,
      order_index: editingHabit?.order_index ?? habits.length,
      eligible_weekdays: schedulingType === 'flexible_weekly' ? eligibleWeekdays : null,
      is_active: editingHabit?.is_active ?? true,
      pause_periods: editingHabit?.pause_periods ?? [],
      pause_until: editingHabit?.pause_until ?? null,
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

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setError('');
      await deleteHabit(deleteTarget.id);
      setDeleteTarget(null);
      await loadHabits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete habit');
    }
  };

  const openDelete = (habit: Habit) => {
    setDeleteTarget(habit);
  };

  const openPauseMenu = (habit: Habit) => {
    setPauseTarget(habit);
    setPauseAction(null);
    setPauseUntilDate('');
  };

  const handlePauseConfirm = async () => {
    if (!pauseTarget || !pauseAction) return;
    try {
      setError('');
      const todayStr = formatDateOnly(todayDate);
      const pausePeriods = pauseTarget.pause_periods ?? [];

      if (pauseAction === 'resume') {
        const closedPeriods = closeOpenPausePeriod(pausePeriods, todayStr);
        await updateHabit(pauseTarget.id, {
          is_active: true,
          pause_periods: closedPeriods,
          pause_until: null,
        });
      } else if (pauseAction === 'indefinite') {
        const closedPeriods = closeOpenPausePeriod(pausePeriods, todayStr);
        await updateHabit(pauseTarget.id, {
          is_active: false,
          pause_periods: [...closedPeriods, { start: todayStr, end: null }],
          pause_until: null,
        });
      } else if (pauseAction === 'until' && pauseUntilDate) {
        const closedPeriods = closeOpenPausePeriod(pausePeriods, todayStr);
        await updateHabit(pauseTarget.id, {
          is_active: false,
          pause_periods: [...closedPeriods, { start: todayStr, end: pauseUntilDate }],
          pause_until: pauseUntilDate,
        });
      }

      setPauseTarget(null);
      setPauseAction(null);
      await loadHabits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update habit');
    }
  };

  const formatRecurrence = (days: RecurrenceDay[]) => {
    if (days.length === 7) return 'Every day';
    if (days.length === 5 && !days.includes('Sat') && !days.includes('Sun')) return 'Weekdays';
    if (days.length === 2 && days.includes('Sat') && days.includes('Sun')) return 'Weekends';
    return DAYS_OF_WEEK.filter((day) => days.includes(day)).join(', ');
  };

  const submitDisabled = (schedulingType === 'fixed_weekdays' && selectedDays.length === 0) || !title.trim();

  const handleMoveUp = async (habit: Habit, index: number) => {
    if (!user || index === 0) return;
    const above = habits[index - 1];
    try {
      await swapOrderIndex(user.id, habit.id, habit.order_index, above.id, above.order_index);
      await loadHabits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder');
    }
  };

  const handleMoveDown = async (habit: Habit, index: number) => {
    if (!user || index === habits.length - 1) return;
    const below = habits[index + 1];
    try {
      await swapOrderIndex(user.id, habit.id, habit.order_index, below.id, below.order_index);
      await loadHabits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder');
    }
  };

  const handleExportData = async () => {
    if (!user) return;
    setExportError('');
    setExporting(true);

    try {
      const [habitsData, logsData] = await Promise.all([
        fetchHabits(user.id),
        fetchAllLogs(user.id),
      ]);

      const payload = {
        app: 'habit-tracker',
        version: 1,
        exportedAt: new Date().toISOString(),
        userId: user.id,
        habits: habitsData,
        logs: logsData,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `habit-tracker-export-${formatDateOnly(todayLocal())}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">My Habits</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportData}
            disabled={exporting}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            {exporting ? 'Exporting…' : 'Export data'}
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + New Habit
          </button>
        </div>
      </div>

      {exportError && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-700 rounded-lg px-4 py-2 mb-4 text-sm text-red-700 dark:text-red-300">
          {exportError}
        </div>
      )}

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
                            onClick={() => {
                              setEmoji(option);
                              setShowEmojiPicker(false);
                              setShowManualEmojiInput(false);
                              setManualEmojiDraft('');
                              setManualEmojiHint('');
                            }}
                            className={`text-xl w-7 h-7 flex items-center justify-center rounded hover:bg-indigo-100 dark:hover:bg-indigo-900 ${
                              emoji === option ? 'bg-indigo-100 dark:bg-indigo-900 ring-2 ring-indigo-400' : ''
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <button
                          type="button"
                          onClick={() => {
                            setShowManualEmojiInput((show) => !show);
                            setManualEmojiDraft('');
                            setManualEmojiHint('');
                          }}
                          className="w-full text-left text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Use phone keyboard
                        </button>
                        {showManualEmojiInput && (
                          <div className="mt-2">
                            <input
                              type="text"
                              value={manualEmojiDraft}
                              onChange={handleManualEmojiChange}
                              placeholder="🙂"
                              autoFocus
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100"
                            />
                            <p className="text-[11px] text-gray-400 mt-1">Enter one emoji using your phone keyboard.</p>
                            {manualEmojiHint && <p className="text-[11px] text-red-500 mt-1">{manualEmojiHint}</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                  <input type="text" required value={title} onChange={(event) => setTitle(event.target.value)} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100" placeholder="e.g. Go to the gym" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input type="text" value={description} onChange={(event) => setDescription(event.target.value)} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100" placeholder="(optional)" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start date</label>
                  <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End date</label>
                  <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Schedule type</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSchedulingType('fixed_weekdays')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${schedulingType === 'fixed_weekdays' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>Fixed weekdays</button>
                  <button type="button" onClick={() => setSchedulingType('flexible_weekly')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${schedulingType === 'flexible_weekly' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>X times per week</button>
                </div>
              </div>

              {schedulingType === 'fixed_weekdays' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recurrence (days)</label>
                  <div className="flex gap-1 flex-wrap">
                    {DAYS_OF_WEEK.map((day) => (
                      <button key={day} type="button" onClick={() => toggleDay(day)} className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedDays.includes(day) ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>{day}</button>
                    ))}
                  </div>
                </div>
              )}

              {schedulingType === 'flexible_weekly' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Target times per week</label>
                    <p className="text-xs text-gray-400 mb-2">Any logged day counts. Weekly score is calculated against this target.</p>
                    <div className="flex gap-1 flex-wrap">
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                        <button key={n} type="button" onClick={() => setWeeklyTarget(n)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${weeklyTarget === n ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>{n}x</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Can be done on</label>
                    <p className="text-xs text-gray-400 mb-2">Only show this habit on selected weekdays.</p>
                    <div className="flex gap-1 flex-wrap">
                      {weekdayLabels.map((label, i) => (
                        <button key={label} type="button" onClick={() => {
                          setEligibleWeekdays((prev) =>
                            prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort()
                          );
                        }} className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${eligibleWeekdays.includes(i) ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>{label}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Button Labels (optional)</label>
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" value={successLabel} onChange={(event) => setSuccessLabel(event.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100" placeholder="Success" />
                  <input type="text" value={partialLabel} onChange={(event) => setPartialLabel(event.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100" placeholder="Partial" />
                  <input type="text" value={failLabel} onChange={(event) => setFailLabel(event.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100" placeholder="Miss" />
                </div>
              </div>

              {formError && <p className="text-sm text-red-500">{formError}</p>}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitDisabled} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">{editingHabit ? 'Save Changes' : 'Create Habit'}</button>
                <button type="button" onClick={resetForm} className="px-6 py-2 border border-gray-300 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Delete habit?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">This will delete the habit and all of its past logs. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium">Cancel</button>
              <button onClick={handleDeleteConfirm} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}

      {pauseTarget && !pauseAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">{pauseTarget.title}</h3>
            <p className="text-xs text-gray-400 mb-4">Manage pause options</p>
            <div className="space-y-2">
              {pauseTarget.is_active ? (
                <>
                  <button onClick={() => setPauseAction('indefinite')} className="w-full px-4 py-3 rounded-lg text-left text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-100 dark:border-gray-700">⏸ Pause indefinitely</button>
                  <button onClick={() => setPauseAction('until')} className="w-full px-4 py-3 rounded-lg text-left text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-100 dark:border-gray-700">📅 Pause until date</button>
                </>
              ) : (
                <>
                  <button onClick={() => setPauseAction('resume')} className="w-full px-4 py-3 rounded-lg text-left text-sm font-medium text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors border border-green-100 dark:border-green-700">▶️ Resume habit</button>
                  <button onClick={() => setPauseAction('until')} className="w-full px-4 py-3 rounded-lg text-left text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-100 dark:border-gray-700">📅 Change pause date</button>
                  <button onClick={() => setPauseAction('indefinite')} className="w-full px-4 py-3 rounded-lg text-left text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-100 dark:border-gray-700">⏸ Pause indefinitely</button>
                </>
              )}
            </div>
            <button onClick={() => setPauseTarget(null)} className="w-full mt-3 px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {pauseTarget && pauseAction === 'until' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Pause until date</h3>
            <p className="text-xs text-gray-400 mb-4">The habit will automatically resume after this date.</p>
            <input type="date" value={pauseUntilDate || todayStr} onChange={(e) => setPauseUntilDate(e.target.value)} min={todayMinStr} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-800 dark:text-gray-100 text-sm mb-4" />
            <div className="flex gap-3">
              <button onClick={() => { setPauseTarget(null); setPauseAction(null); }} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium">Cancel</button>
              <button onClick={handlePauseConfirm} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium">Confirm</button>
            </div>
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
          {habits.map((habit) => {
            const streaks = computeHabitStreaks(habit, allLogs[habit.id] || []);
            const pauseLabel = getPauseLabel(habit);
            const isPaused = !habit.is_active || !!habit.pause_until;

            return (
              <div key={habit.id} className={`bg-white dark:bg-gray-900 rounded-xl shadow-sm border p-4 ${isPaused ? 'border-gray-100 dark:border-gray-700 opacity-60' : 'border-gray-100 dark:border-gray-700'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{habit.emoji || '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate">{habit.title}</h3>
                      {pauseLabel && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300">{pauseLabel}</span>}
                      {!isPaused && habit.is_active && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">Active</span>}
                    </div>
                    <p className="text-xs text-gray-400">{habit.scheduling_type === 'fixed_weekdays' ? formatRecurrence(habit.recurrence) : `${habit.weekly_target}x / week`}</p>
                    <p className="text-xs text-gray-400">{habit.start_date} → {habit.end_date}</p>
                    <div className="flex gap-3 mt-1.5">
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">🔥 Success {streaks.successStreak}</span>
                      <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">💪 Consistency {streaks.consistencyStreak}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <div className="flex flex-col gap-0.5 mr-1">
                      <button onClick={() => handleMoveUp(habit, habits.indexOf(habit))} disabled={habits.indexOf(habit) === 0} className="text-[10px] px-1 py-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-20 disabled:cursor-not-allowed" title="Move up">▲</button>
                      <button onClick={() => handleMoveDown(habit, habits.indexOf(habit))} disabled={habits.indexOf(habit) === habits.length - 1} className="text-[10px] px-1 py-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-20 disabled:cursor-not-allowed" title="Move down">▼</button>
                    </div>
                    <button onClick={() => openPauseMenu(habit)} className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors" title="Pause options">⏸</button>
                    <button onClick={() => openEdit(habit)} className="p-2 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Edit">✏️</button>
                    <button onClick={() => openDelete(habit)} className="p-2 text-sm text-gray-400 hover:text-red-500" title="Delete">🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}