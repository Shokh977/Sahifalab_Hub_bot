-- 107_pro_orders.sql — Sahifalab Pro one-time passes through the existing
-- manual payment queue (step-12 pending_enrollments).
--
-- A Pro pass is a pending_enrollments row with product = 'pro', no course,
-- and pro_months = 1 | 3 | 12. Same PAY-XXXX-YYYY code, same pay bot, same
-- admin queue; granting it extends profiles.pro_until (migration 106) by the
-- months bought, starting from today or from the current end if Pro is
-- still active. Course rows are unchanged (product defaults to 'course').
--
-- Prices live in app_config (no redeploy to change them), in so'm:
-- pro_plans is what users pay, pro_list_prices the regular price shown
-- crossed out beside it (9 900 so'm a month).
-- Requires 106_profile_looks.sql (profiles.pro_until).

ALTER TABLE pending_enrollments ALTER COLUMN course_id DROP NOT NULL;
ALTER TABLE pending_enrollments ADD COLUMN IF NOT EXISTS product VARCHAR(20) NOT NULL DEFAULT 'course';
ALTER TABLE pending_enrollments ADD COLUMN IF NOT EXISTS pro_months INTEGER;

ALTER TABLE pending_enrollments DROP CONSTRAINT IF EXISTS pending_enrollments_product_check;
ALTER TABLE pending_enrollments ADD CONSTRAINT pending_enrollments_product_check CHECK (
  (product = 'course' AND course_id IS NOT NULL)
  OR (product = 'pro' AND course_id IS NULL AND pro_months IN (1, 3, 12))
);

INSERT INTO app_config (key, value, description) VALUES
  ('pro_plans', '{"1": 6900, "3": 17000, "12": 70000}',
   'Sahifalab Pro one-time pass prices in so''m, by months (1 / 3 / 12)'),
  ('pro_list_prices', '{"1": 9900, "3": 29700, "12": 118800}',
   'Sahifalab Pro regular prices in so''m, shown crossed out next to pro_plans')
ON CONFLICT (key) DO NOTHING;
