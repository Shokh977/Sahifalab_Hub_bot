-- Add missing connections_count column to profiles table

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS connections_count INTEGER DEFAULT 0;
