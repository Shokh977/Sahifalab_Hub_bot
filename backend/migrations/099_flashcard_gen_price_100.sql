-- 099_flashcard_gen_price_100.sql — raise the paid price of AI flashcard
-- generation from 25 to 100 Tanga per creation (requested). The free daily
-- allowance (3/day, ai_dual_gate.free_daily_allowance) is unchanged.
--
-- ai_dual_gate's prices are DB-config, not a Python constant (see
-- 088_tanga_currency.sql's original seed and config_service.get_config) —
-- both the charge path (limiter.py::check_and_charge) and the display path
-- (GET /api/ai/limits) read this same jsonb key, so updating it here is the
-- entire change; no code touches the actual price value. Safe to re-run
-- (idempotent — always sets to 100 regardless of current value).
UPDATE app_config
SET value = jsonb_set(value, '{prices,flashcard_gen}', '100'::jsonb),
    updated_at = NOW()
WHERE key = 'ai_dual_gate';
