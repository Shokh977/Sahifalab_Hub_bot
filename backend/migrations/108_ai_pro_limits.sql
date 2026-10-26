-- 108_ai_pro_limits.sql — AI flashcard decks with Sahifalab Pro.
--
-- Free users: 1 free AI action a day (was 3), then at most 1 more paid with
-- Tanga (100 for a flashcard deck, 099), then the app offers Pro
-- (limiter reason 'pro_required'). Pro users: free up to hard_daily_cap
-- (20). Both live in the ai_dual_gate config row, so they can change
-- without a redeploy. Safe to re-run.

UPDATE app_config
SET value = value || '{"free_daily_allowance": 1, "free_paid_daily_limit": 1}'::jsonb,
    updated_at = NOW()
WHERE key = 'ai_dual_gate';
