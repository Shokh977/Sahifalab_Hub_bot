-- 108_ai_pro_limits.sql — AI flashcard decks with Sahifalab Pro.
--
-- On a Pro-aware app (X-Client-Version >= pro_min_client_version, 1.7.0)
-- a free user gets 1 free AI action a day, then at most 1 more paid with
-- Tanga (100 for a flashcard deck, 099), then the app offers Pro (limiter
-- reason 'pro_required'). Pro users: free up to hard_daily_cap (20).
--
-- Older apps are not affected: they keep free_daily_allowance (3) and no
-- paid limit, because they have no Pro screen. That is why the Pro-era
-- values are separate keys and free_daily_allowance is left alone.
-- All in app_config, changeable without a redeploy. Safe to re-run.

UPDATE app_config
SET value = value || '{"pro_client_free_daily_allowance": 1, "free_paid_daily_limit": 1}'::jsonb,
    updated_at = NOW()
WHERE key = 'ai_dual_gate';

INSERT INTO app_config (key, value, description) VALUES
  ('pro_min_client_version', '"1.7.0"',
   'Lowest app version that gets the Sahifalab Pro rules (AI deck limit, locked weekly review)')
ON CONFLICT (key) DO NOTHING;
