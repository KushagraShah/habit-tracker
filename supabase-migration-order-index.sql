-- Run these in Supabase SQL editor to add order_index and eligible_weekdays columns

ALTER TABLE habits ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

-- Set default order_index based on sort_order for existing habits
UPDATE habits SET order_index = sort_order WHERE order_index IS NULL;

ALTER TABLE habits ADD COLUMN IF NOT EXISTS eligible_weekdays INTEGER[] DEFAULT NULL;

-- Existing flexible weekly habits get all 7 days as default eligible (NULL = all days)
-- NULL eligible_weekdays means the habit is visible every day (preserving current behavior)