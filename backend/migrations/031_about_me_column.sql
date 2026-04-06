-- Migration 031: Add about_me column to profiles table for dual bio system
-- bio = short status (max 150 chars), about_me = long-form "about me" text

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS about_me TEXT;
