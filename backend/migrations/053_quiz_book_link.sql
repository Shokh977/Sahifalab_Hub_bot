-- Migration 053: link quizzes to specific books
-- Run in Supabase SQL editor

ALTER TABLE quiz
    ADD COLUMN IF NOT EXISTS book_id INTEGER REFERENCES book(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quiz_book_id ON quiz(book_id) WHERE book_id IS NOT NULL;
