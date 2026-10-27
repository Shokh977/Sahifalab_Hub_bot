-- 110_name_badges.sql — Pro name badges: the small animated object after a name.
--
-- The catalog lives here (not in the app) so a new badge needs no app
-- update: admin uploads three files (animated WebP for dark and light
-- surfaces, a static frame) and adds a row. The app downloads the catalog,
-- caches the files and plays them natively.
--
-- unlock: 'pro' (active Pro), 'seasonal' (everyone while app_config
-- season_<season> is open), 'achievement' (best streak >= streak_days),
-- 'free'. is_active = false hides a badge: nobody can pick it and anyone
-- who had it shows no badge (their saved choice is kept).
--
-- The first 10 badges ship with the backend (/api/cosmetics/badge-files/…);
-- uploaded ones live on the CDN. Name colours are app tokens, not rows.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS name_badges (
  id           TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{2,24}$' AND id <> 'none'),
  title        TEXT NOT NULL,
  unlock       TEXT NOT NULL DEFAULT 'pro' CHECK (unlock IN ('free', 'pro', 'seasonal', 'achievement')),
  season       TEXT,
  streak_days  INT,
  dark_url     TEXT NOT NULL,
  light_url    TEXT NOT NULL,
  static_url   TEXT NOT NULL,
  sort_order   INT NOT NULL DEFAULT 100,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (unlock <> 'seasonal' OR season IS NOT NULL),
  CHECK (unlock <> 'achievement' OR streak_days IS NOT NULL)
);

INSERT INTO name_badges (id, title, unlock, season, sort_order, dark_url, light_url, static_url)
SELECT b.id, b.title, b.unlock, b.season, b.sort_order,
       '/api/cosmetics/badge-files/' || b.id || '-d.webp',
       '/api/cosmetics/badge-files/' || b.id || '-l.webp',
       '/api/cosmetics/badge-files/' || b.id || '.png'
FROM (VALUES
  ('toj',     'Toj',     'pro',      NULL,      10),
  ('olmos',   'Olmos',   'pro',      NULL,      20),
  ('yulduz',  'Yulduz',  'pro',      NULL,      30),
  ('alanga',  'Alanga',  'pro',      NULL,      40),
  ('chaqmoq', 'Chaqmoq', 'pro',      NULL,      50),
  ('kitob',   'Kitob',   'pro',      NULL,      60),
  ('barg',    'Barg',    'pro',      NULL,      70),
  ('qalam',   'Qalam',   'pro',      NULL,      80),
  ('hilol',   'Hilol',   'seasonal', 'ramazon', 90),
  ('lola',    'Lola',    'seasonal', 'navroz',  100)
) AS b(id, title, unlock, season, sort_order)
ON CONFLICT (id) DO NOTHING;
