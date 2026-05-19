-- Run these in Supabase SQL editor to add new columns for existing database

ALTER TABLE habits ADD COLUMN IF NOT EXISTS scheduling_type TEXT NOT NULL DEFAULT 'fixed_weekdays' CHECK (scheduling_type IN ('fixed_weekdays', 'flexible_weekly'));

ALTER TABLE habits ADD COLUMN IF NOT EXISTS weekly_target INT DEFAULT NULL CHECK (weekly_target IS NULL OR (weekly_target >= 1 AND weekly_target <= 7));

ALTER TABLE habits ADD COLUMN IF NOT EXISTS pause_until DATE DEFAULT NULL;