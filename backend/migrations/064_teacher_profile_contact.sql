-- Migration 064: add contact field to teacher_profiles
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run

ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS contact VARCHAR(255);
