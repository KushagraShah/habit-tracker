-- Habit Tracker Database Schema
-- Run this in Supabase SQL editor after creating a new project.
-- If you already have the old schema, review before re-running because CREATE TABLE
-- statements are intended for fresh projects. The ALTER/POLICY sections document the
-- expected final shape for existing projects.

-- 1. Profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Auto-create profile when a new user signs up (or is confirmed)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Keep updated_at reliable at the database layer.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2. Habits table
CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  emoji TEXT DEFAULT '💪',
  recurrence JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(recurrence) = 'array'),
  scheduling_type TEXT NOT NULL DEFAULT 'fixed_weekdays' CHECK (scheduling_type IN ('fixed_weekdays', 'flexible_weekly')),
  weekly_target INT DEFAULT NULL CHECK (weekly_target IS NULL OR (weekly_target >= 1 AND weekly_target <= 7)),
  success_label TEXT,
  partial_label TEXT,
  fail_label TEXT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Default far in the future so habits do not silently expire after 30 days.
  end_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '10 years'),
  pause_periods JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(pause_periods) = 'array'),
  pause_until DATE DEFAULT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT habits_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_habits_user_id ON habits(user_id);
CREATE INDEX idx_habits_user_sort ON habits(user_id, sort_order, created_at);

CREATE TRIGGER set_habits_updated_at
  BEFORE UPDATE ON habits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE habits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own habits"
  ON habits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own habits"
  ON habits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own habits"
  ON habits FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own habits"
  ON habits FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Habit logs table
CREATE TABLE habit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'fail')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(habit_id, log_date)
);

CREATE INDEX idx_habit_logs_user_date ON habit_logs(user_id, log_date);
CREATE INDEX idx_habit_logs_habit_date ON habit_logs(habit_id, log_date);

CREATE TRIGGER set_habit_logs_updated_at
  BEFORE UPDATE ON habit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;

-- Log policies intentionally verify both the log owner and the referenced habit owner.
-- This prevents a malicious authenticated user from inserting a row for another
-- user's habit_id with their own user_id and blocking the real owner via UNIQUE.
CREATE POLICY "Users can view own logs"
  ON habit_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own logs for own habits"
  ON habit_logs FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM habits
      WHERE habits.id = habit_logs.habit_id
        AND habits.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own logs for own habits"
  ON habit_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM habits
      WHERE habits.id = habit_logs.habit_id
        AND habits.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own logs"
  ON habit_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Migration for existing databases: Add new columns to habits table
-- Run these ALTER statements separately if you already have the habits table
-- ALTER TABLE habits ADD COLUMN IF NOT EXISTS scheduling_type TEXT NOT NULL DEFAULT 'fixed_weekdays' CHECK (scheduling_type IN ('fixed_weekdays', 'flexible_weekly'));
-- ALTER TABLE habits ADD COLUMN IF NOT EXISTS weekly_target INT DEFAULT NULL CHECK (weekly_target IS NULL OR (weekly_target >= 1 AND weekly_target <= 7));
-- ALTER TABLE habits ADD COLUMN IF NOT EXISTS pause_until DATE DEFAULT NULL;