"""
test_daily_quiz_service.py — "5 Savol" (090_daily_quiz). Pure-function tests
(select_five, shuffle_for_user, window boundary) need no DB; the rest opt in
against a real Postgres via DATABASE_URL, mirroring test_tanga_service.py's
style: reserved out-of-range telegram_id, teardown in a finally block.
"""
import os
from datetime import date, datetime, timedelta, UTC

import pytest
from sqlalchemy import text

DATABASE_URL = os.environ.get("DATABASE_URL")

# No module-level skipif: the pure-function tests below (select_five,
# shuffle_for_user, window boundary) need no DB and always run. Only the
# db_session fixture skips (see below) — that's what gates the DB-backed tests.

TEST_USER_A = -9_000_000_090
TEST_USER_B = -9_000_000_091


# ═══════════════════════════════════════════════════════════════════════════
# Pure-function tests — no DB
# ═══════════════════════════════════════════════════════════════════════════

def _candidate(difficulty: str, verified: bool, tag: str) -> dict:
    return {
        "question_text": f"q-{tag}", "options": ["a", "b", "c", "d"], "correct_index": 0,
        "explanation": "e", "source": "s", "difficulty": difficulty, "verified": verified,
    }


def test_select_five_picks_exact_difficulty_mix():
    from app.services.daily_quiz_service import select_five

    candidates = (
        [_candidate("easy", True, f"e{i}") for i in range(4)]
        + [_candidate("medium", True, f"m{i}") for i in range(4)]
        + [_candidate("hard", True, f"h{i}") for i in range(2)]
    )
    selected, warnings = select_five(candidates)

    assert warnings == []
    assert len(selected) == 5
    counts = {"easy": 0, "medium": 0, "hard": 0}
    for c in selected:
        counts[c["difficulty"]] += 1
    assert counts == {"easy": 2, "medium": 2, "hard": 1}


def test_select_five_excludes_unverified():
    from app.services.daily_quiz_service import select_five

    candidates = [
        _candidate("easy", True, "e-good"),
        _candidate("easy", False, "e-bad"),  # failed cold verification — must never be selectable
    ]
    selected, warnings = select_five(candidates)
    assert all(c["question_text"] != "q-e-bad" for c in selected)
    assert warnings  # short on every bucket with only 1 verified candidate total


def test_select_five_backfills_on_shortfall_and_warns():
    from app.services.daily_quiz_service import select_five

    # No hard candidates at all — must still return 5 by backfilling from
    # whatever's left, but must say so.
    candidates = (
        [_candidate("easy", True, f"e{i}") for i in range(3)]
        + [_candidate("medium", True, f"m{i}") for i in range(3)]
    )
    selected, warnings = select_five(candidates)
    assert len(selected) == 5
    assert any("hard" in w for w in warnings)


def test_shuffle_for_user_is_deterministic():
    from app.services.daily_quiz_service import shuffle_for_user

    options = ["A", "B", "C", "D"]
    shuffled1, perm1 = shuffle_for_user(user_id=111, question_id=222, options=options)
    shuffled2, perm2 = shuffle_for_user(user_id=111, question_id=222, options=options)
    assert shuffled1 == shuffled2
    assert perm1 == perm2


def test_shuffle_for_user_perm_resolves_back_correctly():
    from app.services.daily_quiz_service import shuffle_for_user

    options = ["A", "B", "C", "D"]
    shuffled, perm = shuffle_for_user(user_id=42, question_id=7, options=options)
    # perm[shown_index] must be the ORIGINAL index of what's shown at shown_index
    for shown_index, original_index in enumerate(perm):
        assert shuffled[shown_index] == options[original_index]


def test_shuffle_for_user_differs_per_question():
    from app.services.daily_quiz_service import shuffle_for_user

    options = ["A", "B", "C", "D"]
    _, perm_q1 = shuffle_for_user(user_id=1, question_id=1, options=options)
    _, perm_q2 = shuffle_for_user(user_id=1, question_id=2, options=options)
    # Not a mathematical guarantee for arbitrary seeds, but true for this
    # concrete pair — pins the "seeded per (user, question)" behaviour
    # against silently collapsing into "seeded per user only".
    assert perm_q1 != perm_q2


def test_window_close_is_next_midnight_utc():
    from app.api.v1.endpoints.daily_quiz import _window_close

    d = date(2026, 8, 27)
    close_at = _window_close(d)
    assert close_at == datetime(2026, 8, 28, 0, 0, tzinfo=UTC)
    assert close_at - datetime(2026, 8, 27, 0, 0, tzinfo=UTC) == timedelta(days=1)


# ═══════════════════════════════════════════════════════════════════════════
# DB-backed tests
# ═══════════════════════════════════════════════════════════════════════════

@pytest.fixture
def db_session():
    if not DATABASE_URL:
        pytest.skip("DATABASE_URL not set")
    from app.db.session import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        uids = [TEST_USER_A, TEST_USER_B]
        # = ANY(:array) with a plain list, not `IN`/a tuple param — this
        # codebase's established idiom for a dynamic id-set under pg8000
        # (see admin_ai_usage.py), avoids relying on tuple-param expansion.
        session.execute(text("DELETE FROM daily_quiz_reports WHERE user_id = ANY(:uids)"), {"uids": uids})
        session.execute(text("DELETE FROM daily_quiz_attempts WHERE user_id = ANY(:uids)"), {"uids": uids})
        session.execute(text("DELETE FROM daily_quiz_questions WHERE quiz_id IN (SELECT id FROM daily_quizzes WHERE theme = 'test_theme')"))
        session.execute(text("DELETE FROM daily_quizzes WHERE theme = 'test_theme'"))
        session.execute(text("DELETE FROM tanga_transactions WHERE user_id = ANY(:uids)"), {"uids": uids})
        session.execute(text("DELETE FROM profiles WHERE telegram_id = ANY(:uids)"), {"uids": uids})
        session.commit()
        session.close()


def _seed_users(db):
    for uid in (TEST_USER_A, TEST_USER_B):
        db.execute(text("""
            INSERT INTO profiles (telegram_id, tanga_balance, timezone)
            VALUES (:uid, 0, 'Asia/Tashkent')
            ON CONFLICT (telegram_id) DO UPDATE SET tanga_balance = 0, quiz_streak_days = 0, quiz_last_played_date = NULL
        """), {"uid": uid})
    db.commit()


def _seed_quiz(db, publish_date: date, quiz_number: int) -> int:
    import json
    row = db.execute(text("""
        INSERT INTO daily_quizzes (quiz_number, publish_date, theme, status)
        VALUES (:num, :d, 'test_theme', 'published')
        RETURNING id
    """), {"num": quiz_number, "d": publish_date}).fetchone()
    quiz_id = int(row.id)
    for pos in range(5):
        db.execute(text("""
            INSERT INTO daily_quiz_questions
                (quiz_id, position, question_text, options, correct_index, explanation, source, difficulty, verified)
            VALUES (:qid, :pos, :qt, CAST(:opts AS jsonb), 0, 'expl', 'src', 'easy', TRUE)
        """), {"qid": quiz_id, "pos": pos, "qt": f"Question {pos}", "opts": json.dumps(["A", "B", "C", "D"])})
    db.commit()
    return quiz_id


def test_deliver_today_is_idempotent_on_delivered_at(db_session):
    from app.services.daily_quiz_service import deliver_today

    _seed_users(db_session)
    quiz_id = _seed_quiz(db_session, date.today(), quiz_number=900001)

    first = deliver_today(db_session, TEST_USER_A, quiz_id)
    second = deliver_today(db_session, TEST_USER_A, quiz_id)

    assert first["delivered_at"] == second["delivered_at"]
    assert first["attempt_id"] == second["attempt_id"]
    assert len(first["questions"]) == 5


def test_score_and_submit_scores_correctly_and_is_idempotent(db_session):
    from app.services.daily_quiz_service import deliver_today, score_and_submit, shuffle_for_user

    _seed_users(db_session)
    quiz_id = _seed_quiz(db_session, date.today(), quiz_number=900002)
    deliver_today(db_session, TEST_USER_A, quiz_id)

    questions = db_session.execute(
        text("SELECT id, options, correct_index FROM daily_quiz_questions WHERE quiz_id = :qid ORDER BY position"),
        {"qid": quiz_id},
    ).fetchall()

    # Answer all 5 correctly: for each question, find the shown_index whose
    # perm maps back to correct_index (never assume shown order == stored order).
    answers = []
    for q in questions:
        _, perm = shuffle_for_user(TEST_USER_A, q.id, list(q.options))
        shown_index = perm.index(q.correct_index)
        answers.append({"question_id": q.id, "selected_index": shown_index})

    result = score_and_submit(db_session, TEST_USER_A, quiz_id, answers)
    assert result["already_submitted"] is False
    assert result["correct_count"] == 5
    assert result["tanga_awarded"] == 5 + 5 + 3  # played + 5 correct + perfect bonus == 13 == MAX_DAILY_REWARD

    # Idempotent replay — even with WRONG answers this time, the original
    # result must come back unchanged, never rescored.
    wrong_answers = [{"question_id": q.id, "selected_index": 0} for q in questions]
    replay = score_and_submit(db_session, TEST_USER_A, quiz_id, wrong_answers)
    assert replay["already_submitted"] is True
    assert replay["correct_count"] == 5
    assert replay["tanga_awarded"] == 13


def test_score_and_submit_requires_prior_delivery(db_session):
    from app.services.daily_quiz_service import score_and_submit

    _seed_users(db_session)
    quiz_id = _seed_quiz(db_session, date.today(), quiz_number=900003)

    with pytest.raises(ValueError):
        score_and_submit(db_session, TEST_USER_A, quiz_id, [{"question_id": 1, "selected_index": 0}])


def test_grant_submission_reward_is_idempotent(db_session):
    from app.services.daily_quiz_service import grant_submission_reward

    _seed_users(db_session)
    quiz_id = _seed_quiz(db_session, date.today(), quiz_number=900004)

    grant_submission_reward(db_session, TEST_USER_A, quiz_id, 13)
    grant_submission_reward(db_session, TEST_USER_A, quiz_id, 13)  # simulate a client retry

    balance = db_session.execute(
        text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_USER_A},
    ).scalar()
    ledger_rows = db_session.execute(
        text("SELECT COUNT(*) FROM tanga_transactions WHERE user_id = :uid AND reason = 'daily_quiz'"),
        {"uid": TEST_USER_A},
    ).scalar()
    assert balance == 13
    assert ledger_rows == 1


def test_void_question_refunds_only_users_who_got_it_right(db_session):
    from app.services.daily_quiz_service import deliver_today, score_and_submit, shuffle_for_user, void_question_and_refund

    _seed_users(db_session)
    quiz_id = _seed_quiz(db_session, date.today(), quiz_number=900005)
    q0 = db_session.execute(
        text("SELECT id, options, correct_index FROM daily_quiz_questions WHERE quiz_id = :qid AND position = 0"),
        {"qid": quiz_id},
    ).fetchone()

    for uid in (TEST_USER_A, TEST_USER_B):
        deliver_today(db_session, uid, quiz_id)

    # User A answers question 0 correctly, user B answers it wrong.
    _, perm_a = shuffle_for_user(TEST_USER_A, q0.id, list(q0.options))
    _, perm_b = shuffle_for_user(TEST_USER_B, q0.id, list(q0.options))
    score_and_submit(db_session, TEST_USER_A, quiz_id, [{"question_id": q0.id, "selected_index": perm_a.index(q0.correct_index)}])
    wrong_b = next(i for i in range(4) if perm_b[i] != q0.correct_index)
    score_and_submit(db_session, TEST_USER_B, quiz_id, [{"question_id": q0.id, "selected_index": wrong_b}])

    before_a = db_session.execute(text("SELECT correct_count FROM daily_quiz_attempts WHERE user_id = :uid AND quiz_id = :qid"), {"uid": TEST_USER_A, "qid": quiz_id}).scalar()
    assert before_a == 1

    result = void_question_and_refund(db_session, q0.id)
    assert result["ok"] is True
    assert result["refunded_users"] == 1  # only A, who got it right

    after_a = db_session.execute(text("SELECT correct_count FROM daily_quiz_attempts WHERE user_id = :uid AND quiz_id = :qid"), {"uid": TEST_USER_A, "qid": quiz_id}).scalar()
    assert after_a == 0

    tanga_a = db_session.execute(text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_USER_A}).scalar()
    tanga_b = db_session.execute(text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_USER_B}).scalar()
    assert tanga_a == 1  # the +1 refund
    assert tanga_b == 0  # never got it right, nothing to refund

    # Re-voiding an already-voided question is a clean no-op, not a double refund.
    second = void_question_and_refund(db_session, q0.id)
    assert second["ok"] is False


def test_rollover_auto_publishes_a_verified_quiz_without_approval(db_session):
    """Direct regression test for the reported bug: a cleanly-generated
    'verified' day must publish on its own via rollover() — it must NOT
    require an admin to have clicked Approve first."""
    import asyncio
    from app.services.daily_quiz_service import rollover

    today = date.today()
    row = db_session.execute(text("""
        INSERT INTO daily_quizzes (quiz_number, publish_date, theme, status)
        VALUES (900101, :d, 'test_theme', 'verified') RETURNING id
    """), {"d": today}).fetchone()
    quiz_id = int(row.id)
    for pos in range(5):
        db_session.execute(text("""
            INSERT INTO daily_quiz_questions
                (quiz_id, position, question_text, options, correct_index, explanation, source, difficulty, verified)
            VALUES (:qid, :pos, :qt, CAST(:opts AS jsonb), 0, 'expl', 'src', 'easy', TRUE)
        """), {"qid": quiz_id, "pos": pos, "qt": f"Q{pos}", "opts": '["A","B","C","D"]'})
    db_session.commit()

    result = asyncio.run(rollover(db_session, today))
    assert result["published"] is True

    status = db_session.execute(text("SELECT status FROM daily_quizzes WHERE id = :id"), {"id": quiz_id}).scalar()
    assert status == "published"


def test_rollover_does_not_publish_a_draft_quiz(db_session):
    """The other half of the same regression: a day that generation left
    short ('draft') must NOT silently publish — it's the one case that
    still needs a human, and rollover must page admins instead of
    pretending nothing's wrong."""
    import asyncio
    from app.services.daily_quiz_service import rollover

    today = date.today()
    row = db_session.execute(text("""
        INSERT INTO daily_quizzes (quiz_number, publish_date, theme, status)
        VALUES (900102, :d, 'test_theme', 'draft') RETURNING id
    """), {"d": today}).fetchone()
    quiz_id = int(row.id)
    for pos in range(3):  # short — only 3/5
        db_session.execute(text("""
            INSERT INTO daily_quiz_questions
                (quiz_id, position, question_text, options, correct_index, explanation, source, difficulty, verified)
            VALUES (:qid, :pos, :qt, CAST(:opts AS jsonb), 0, 'expl', 'src', 'easy', TRUE)
        """), {"qid": quiz_id, "pos": pos, "qt": f"Q{pos}", "opts": '["A","B","C","D"]'})
    db_session.commit()

    result = asyncio.run(rollover(db_session, today))
    assert result["published"] is False

    status = db_session.execute(text("SELECT status FROM daily_quizzes WHERE id = :id"), {"id": quiz_id}).scalar()
    assert status == "draft"


def test_rollover_reverts_to_draft_if_valid_count_drops_below_5_at_publish_time(db_session):
    """Defense-in-depth check: even a 'verified' quiz must be re-validated
    at the actual publish instant, not trusted from generation time — if a
    question got voided in between, rollover must catch it rather than
    ship a 4-question quiz silently."""
    import asyncio
    from app.services.daily_quiz_service import rollover

    today = date.today()
    row = db_session.execute(text("""
        INSERT INTO daily_quizzes (quiz_number, publish_date, theme, status)
        VALUES (900103, :d, 'test_theme', 'verified') RETURNING id
    """), {"d": today}).fetchone()
    quiz_id = int(row.id)
    for pos in range(5):
        db_session.execute(text("""
            INSERT INTO daily_quiz_questions
                (quiz_id, position, question_text, options, correct_index, explanation, source, difficulty, verified, voided)
            VALUES (:qid, :pos, :qt, CAST(:opts AS jsonb), 0, 'expl', 'src', 'easy', TRUE, :voided)
        """), {"qid": quiz_id, "pos": pos, "qt": f"Q{pos}", "opts": '["A","B","C","D"]', "voided": pos == 0})
    db_session.commit()

    result = asyncio.run(rollover(db_session, today))
    assert result["published"] is False
    assert result["reason"] == "question_count_mismatch_at_publish"

    status = db_session.execute(text("SELECT status FROM daily_quizzes WHERE id = :id"), {"id": quiz_id}).scalar()
    assert status == "draft"


def test_report_question_is_idempotent_per_user_and_auto_voids_at_threshold(db_session):
    import asyncio
    from app.services.daily_quiz_service import deliver_today, report_question, REPORT_VOID_THRESHOLD

    def _report(qid, uid, reason):
        # report_question is async (it may page admins on auto-void, see
        # _page_admins_question_voided) — no pytest-asyncio in this repo's
        # test stack, so run it via a fresh event loop per call.
        return asyncio.run(report_question(db_session, qid, uid, reason))

    _seed_users(db_session)
    quiz_id = _seed_quiz(db_session, date.today(), quiz_number=900006)
    q0 = db_session.execute(
        text("SELECT id FROM daily_quiz_questions WHERE quiz_id = :qid AND position = 0"), {"qid": quiz_id},
    ).fetchone()
    deliver_today(db_session, TEST_USER_A, quiz_id)

    first = _report(q0.id, TEST_USER_A, "wrong answer")
    assert first["ok"] is True

    # Same user reporting the same question again must not double-count.
    replay = _report(q0.id, TEST_USER_A, "wrong answer again")
    assert replay.get("already_reported") is True

    count = db_session.execute(text("SELECT report_count FROM daily_quiz_questions WHERE id = :id"), {"id": q0.id}).scalar()
    assert count == 1  # the replay must not have incremented it a second time

    # Distinct reporters up to the threshold trigger an auto-void. Each
    # report needs a real profile row (FK) — reserved ids well clear of
    # TEST_USER_A/B, cleaned up locally at the end of this test.
    extra_reporters = [-9_000_000_200 - i for i in range(REPORT_VOID_THRESHOLD - 1)]
    try:
        for fake_uid in extra_reporters:
            db_session.execute(text("""
                INSERT INTO profiles (telegram_id, tanga_balance, timezone) VALUES (:uid, 0, 'Asia/Tashkent')
                ON CONFLICT (telegram_id) DO NOTHING
            """), {"uid": fake_uid})
            db_session.commit()

        voided = False
        for fake_uid in extra_reporters:
            result = _report(q0.id, fake_uid, "reason")
            voided = result.get("auto_voided", False)

        assert voided is True
    finally:
        db_session.execute(text("DELETE FROM daily_quiz_reports WHERE user_id = ANY(:uids)"), {"uids": extra_reporters})
        db_session.execute(text("DELETE FROM profiles WHERE telegram_id = ANY(:uids)"), {"uids": extra_reporters})
        db_session.commit()
