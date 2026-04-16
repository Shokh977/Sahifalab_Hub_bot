-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 051: Web Push Notification Subscriptions
--
-- Stores browser PushSubscription objects so the backend can deliver
-- notifications to users even when they have the tab closed.
--
-- Each row = one browser on one device for one user.
-- A user can have multiple subscriptions (phone, laptop, desktop).
--
-- VAPID keys must be generated once and stored in backend env vars:
--   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CLAIM_EMAIL
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT       NOT NULL,   -- telegram_id of the subscriber
  endpoint    TEXT         NOT NULL,   -- push service URL (unique per browser)
  p256dh      TEXT         NOT NULL,   -- client public key (base64url)
  auth        TEXT         NOT NULL,   -- auth secret (base64url)
  user_agent  TEXT,                    -- browser info for debugging
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- One subscription endpoint per user (replace on re-subscribe)
  UNIQUE (user_id, endpoint)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS push_subs_user_id_idx
  ON push_subscriptions(user_id);

-- ── Auto-update updated_at ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_push_subscription()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_subscription_updated ON push_subscriptions;
CREATE TRIGGER push_subscription_updated
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION touch_push_subscription();

-- ── RPC: upsert_push_subscription ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION upsert_push_subscription(
  p_user_id   BIGINT,
  p_endpoint  TEXT,
  p256dh      TEXT,
  p_auth      TEXT,
  p_ua        TEXT DEFAULT NULL
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (p_user_id, p_endpoint, p256dh, p_auth, p_ua)
  ON CONFLICT (user_id, endpoint)
  DO UPDATE SET
    p256dh     = EXCLUDED.p256dh,
    auth       = EXCLUDED.auth,
    user_agent = EXCLUDED.user_agent,
    updated_at = NOW()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── RPC: delete_push_subscription ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION delete_push_subscription(
  p_user_id  BIGINT,
  p_endpoint TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM push_subscriptions
  WHERE user_id = p_user_id AND endpoint = p_endpoint;
END;
$$;

-- ── RPC: get_push_subscriptions_for_user ─────────────────────────────────────

CREATE OR REPLACE FUNCTION get_push_subscriptions_for_user(p_user_id BIGINT)
RETURNS TABLE (
  id        BIGINT,
  endpoint  TEXT,
  p256dh    TEXT,
  auth      TEXT
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, endpoint, p256dh, auth
  FROM push_subscriptions
  WHERE user_id = p_user_id
  ORDER BY updated_at DESC;
$$;

-- ── RPC: delete_expired_push_subscription (called when 410 received) ─────────

CREATE OR REPLACE FUNCTION delete_push_subscription_by_id(p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM push_subscriptions WHERE id = p_id;
END;
$$;

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Service role bypasses RLS; anon key uses RPCs which are SECURITY DEFINER.

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Deny all direct access (RPCs handle everything)
CREATE POLICY "no_direct_access" ON push_subscriptions
  FOR ALL USING (false);
