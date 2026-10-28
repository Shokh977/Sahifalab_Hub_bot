-- 111_sponsor_channel.sql — one-time access to the private Telegram channel
-- "SAHIFALAB homiylari", sold through the existing manual payment queue.
--
-- A channel purchase is a pending_enrollments row with product = 'channel',
-- no course and no pro_months. The pay bot creates it (the buyer may have no
-- app account: user_id is their Telegram id, as for every other row), the
-- buyer sends the receipt, an admin grants it, and the bot sends a
-- join-request invite link that only that Telegram account can use.
--
-- The price lives in app_config 'sponsor_channel' ({"price": so'm}) so the
-- admin can change it from the bot (/homiy_narx) without a redeploy.
-- Requires 107_pro_orders.sql. Safe to re-run.

ALTER TABLE pending_enrollments DROP CONSTRAINT IF EXISTS pending_enrollments_product_check;
ALTER TABLE pending_enrollments ADD CONSTRAINT pending_enrollments_product_check CHECK (
  (product = 'course' AND course_id IS NOT NULL)
  OR (product = 'pro' AND course_id IS NULL AND pro_months IN (1, 3, 12))
  OR (product = 'channel' AND course_id IS NULL AND pro_months IS NULL)
);

CREATE INDEX IF NOT EXISTS pending_enrollments_channel_user_idx
  ON pending_enrollments (user_id, status) WHERE product = 'channel';

INSERT INTO app_config (key, value, description) VALUES
  ('sponsor_channel', '{"price": 50000}',
   'SAHIFALAB homiylari private channel: one-time access price in so''m')
ON CONFLICT (key) DO NOTHING;
