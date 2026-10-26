-- 106_profile_looks.sql — profile cosmetics (Claude Design "6-qadam").
--
-- profiles.profile_look — the user's chosen look, e.g.
--                         {"banner": "tong", "ring": "olov"}. The server
--                         validates every write against the unlock rules in
--                         app/services/cosmetics_service.py, and renders a
--                         locked choice as its free fallback without deleting
--                         it (so it comes back when it unlocks again).
-- profiles.pro_until     — Sahifalab Pro is active while this is in the
--                         future. NULL = never had Pro. Set by the admin grant
--                         when a one-time Pro pass is paid.
--
-- Season windows live in app_config (no redeploy to change them):
--   season_navroz  — {"start": "03-01", "end": "03-31"}   (every year)
--   season_ramazon — {"start": "2027-02-08", "end": "2027-03-09"}
--                    (lunar: set each year; missing = out of season)
--
-- The columns are deliberately NOT on the SQLAlchemy Profile model: every
-- Profile query would fail before this migration is applied. The code reads
-- them with raw SQL behind a column-exists check.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_look JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pro_until TIMESTAMPTZ;

INSERT INTO app_config (key, value, description) VALUES
  ('season_navroz', '{"start": "03-01", "end": "03-31"}',
   'Navro''z cosmetics window (MM-DD, every year, Asia/Tashkent)'),
  ('season_ramazon', '{"start": "2027-02-08", "end": "2027-03-09"}',
   'Ramazon cosmetics window (YYYY-MM-DD, set each year, Asia/Tashkent)')
ON CONFLICT (key) DO NOTHING;
