-- 071_backfill_welcome_xp.sql
--
-- MUST run after 070_widen_xp_logs_source_constraint.sql (source='WELCOME' is
-- rejected by xp_logs until that migration is applied).
--
-- Backfills the +100 welcome bonus for every existing real user (telegram_id
-- > 0, matching auth.py's _send_welcome() rule that skips synthetic
-- email/Google accounts with negative ids) who does not already have a
-- 'WELCOME' row in xp_logs. Verified live (2026-07-12): 1852 users with
-- telegram_id > 0, 0 existing WELCOME rows — every welcome bonus has been
-- silently failing since this feature was introduced.
--
-- Idempotent / safe to re-run: the WHERE NOT EXISTS guard means a user who
-- already has a WELCOME row (e.g. because this script already ran, or
-- because they signed up after 070 was applied and _send_welcome() succeeded
-- normally) is skipped — no double-grant.
--
-- Uses the canonical add_xp() RPC per-user (not a bulk UPDATE) so total_xp,
-- level, and the xp_logs audit row all stay consistent with every other XP
-- award in the system.

DO $$
DECLARE
    r RECORD;
    v_count INT := 0;
BEGIN
    FOR r IN
        SELECT p.telegram_id
        FROM   profiles p
        WHERE  p.telegram_id > 0
          AND  NOT EXISTS (
              SELECT 1 FROM xp_logs x
              WHERE x.user_id = p.telegram_id AND x.source = 'WELCOME'
          )
    LOOP
        PERFORM add_xp(r.telegram_id, 'WELCOME', 100, NULL);
        v_count := v_count + 1;
    END LOOP;

    RAISE NOTICE 'Backfilled welcome XP for % users', v_count;
END $$;


-- ── Deck-clone-milestone backfill ──────────────────────────────────────────
-- Same root cause: 'DECK_MILESTONE' was rejected by the CHECK constraint, and
-- because add_xp() raises before flashcard_decks.clone_milestones_awarded is
-- ever updated (Postgres rolls back the whole add_xp() call transactionally
-- on the constraint violation), clone_milestones_awarded accurately reflects
-- reality — nothing was ever marked awarded. Safe and straightforward to
-- backfill using the exact same threshold logic as
-- flashcards.py:_check_and_award_clone_milestones().
-- Verified live (2026-07-12): zero decks currently have clone_count >= 10, so
-- this is a no-op today, but is included for correctness / future-proofing
-- and is idempotent (safe to re-run).

DO $$
DECLARE
    d RECORD;
    m INT;
    milestone_xp CONSTANT JSONB := '{"10": 50, "50": 200, "100": 500}'::jsonb;
    v_count INT := 0;
BEGIN
    FOR d IN SELECT id, user_id, clone_count, COALESCE(clone_milestones_awarded, '{}') AS awarded FROM flashcard_decks
    LOOP
        FOREACH m IN ARRAY ARRAY[10, 50, 100]
        LOOP
            IF d.clone_count >= m AND NOT (m = ANY(d.awarded)) THEN
                PERFORM add_xp(d.user_id, 'DECK_MILESTONE', (milestone_xp ->> m::text)::int, d.id);
                UPDATE flashcard_decks SET clone_milestones_awarded = array_append(clone_milestones_awarded, m) WHERE id = d.id;
                v_count := v_count + 1;
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Backfilled % deck-clone milestone awards', v_count;
END $$;
