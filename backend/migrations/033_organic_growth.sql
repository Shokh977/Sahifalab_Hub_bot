-- Migration 033: Organic growth simulation for post views
--
-- 1. Adds target_base_views + base_views_added columns to posts.
-- 2. BEFORE INSERT trigger randomises target_base_views to 10–50 for every new post.
-- 3. simulate_organic_growth() — called lazily from the frontend; picks up to 5
--    recent posts that still have budget and increments base_views_added by 1–3.
-- 4. increment_views_bulk(int[]) — batch atomic increment for real user views
--    (replaces the old single-post /view endpoint; called by the client view-buffer).


-- ── 1. New columns ────────────────────────────────────────────────────────────
ALTER TABLE posts ADD COLUMN IF NOT EXISTS target_base_views INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS base_views_added  INTEGER NOT NULL DEFAULT 0;

-- Backfill existing posts that have no target yet
UPDATE posts
SET    target_base_views = floor(random() * 41 + 10)::int
WHERE  target_base_views = 0;


-- ── 2. Trigger: randomise target on every new post ────────────────────────────
CREATE OR REPLACE FUNCTION set_target_base_views()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.target_base_views := floor(random() * 41 + 10)::int;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_set_target_base_views ON posts;
CREATE TRIGGER trg_posts_set_target_base_views
    BEFORE INSERT ON posts
    FOR EACH ROW
    EXECUTE FUNCTION set_target_base_views();


-- ── 3. simulate_organic_growth() ─────────────────────────────────────────────
-- Randomly picks up to 5 posts created in the last 24 h that still have room
-- to grow, and increments base_views_added by 1–3 (capped at target).
-- Call this from the frontend once per session when Lenta loads.
CREATE OR REPLACE FUNCTION simulate_organic_growth()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    rec  RECORD;
    inc  INTEGER;
BEGIN
    FOR rec IN (
        SELECT id, target_base_views, base_views_added
        FROM   posts
        WHERE  created_at > now() - INTERVAL '24 hours'
          AND  base_views_added < target_base_views
        ORDER  BY random()
        LIMIT  5
    ) LOOP
        inc := floor(random() * 3 + 1)::int;
        UPDATE posts
        SET    base_views_added = LEAST(base_views_added + inc, target_base_views)
        WHERE  id = rec.id;
    END LOOP;
END;
$$;


-- ── 4. increment_views_bulk(int[]) ────────────────────────────────────────────
-- Atomically bumps views_count for every supplied post ID in a single UPDATE.
-- Called by the client-side view-buffer flush (every 10 s or every 10 IDs).
CREATE OR REPLACE FUNCTION increment_views_bulk(p_post_ids INTEGER[])
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE posts SET views_count = views_count + 1 WHERE id = ANY(p_post_ids);
END;
$$;
