-- 077_challenge_badge_key_unique.sql
--
-- Two challenges ended up sharing badge_key = 'marafonchi' (the real seed
-- challenge "20 Soat Fokus Marafoni" and a manually-created test challenge
-- "1 soat focus chellenge (test)") — nothing in the schema prevented it.
-- Since user_badges only ever holds one row per (user_id, badge_key), this
-- made the two challenges mechanically share a single badge, which also
-- produced duplicate React keys in the Trofey Xonasi badge grid.
--
-- Clear the test challenge's colliding badge_key, then add a unique index
-- so this can't happen again (application-level checks were also added in
-- admin_challenges.py, but the DB constraint is the real guarantee).

UPDATE challenges
SET badge_key = NULL
WHERE slug = '1-soat-focus-chellenge-test' AND badge_key = 'marafonchi';

CREATE UNIQUE INDEX IF NOT EXISTS challenges_badge_key_unique
ON challenges (badge_key)
WHERE badge_key IS NOT NULL;
