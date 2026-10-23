"""
test_question_submissions.py — "Siz ham savol yuboring" (105_question_submissions).

Pure-function tests (cleaning, validation, queue order, verdict flags,
difficulty mix) need no DB. The rest run against a real Postgres via
DATABASE_URL (CI service container, or tests/run_tanga_tests_local.py's
embedded pgserver), same style as test_daily_quiz_service.py: reserved
out-of-range telegram_ids, theme 'test_qs', teardown in a finally block.
The AI provider is replaced by a scripted fake — no network.
"""
import asyncio
import json
import os
from datetime import date, datetime, timedelta, UTC

import pytest
from sqlalchemy import text

DATABASE_URL = os.environ.get("DATABASE_URL")

USER_A = -9_000_000_105
USER_B = -9_000_000_106
THEME = "test_qs"


def _valid(**over) -> dict:
    base = {
        "question_text": "Asal nima uchun ming yillar davomida buzilmaydi?",
        "options": ["Shakar ko'p va suv kam", "Tuz qo'shilgani uchun", "Sovuqda saqlangani uchun", "Ichida spirt bor"],
        "correct_index": 0,
        "explanation": "Suv kam bo'lgani uchun mikroblar yashay olmaydi.",
        "source_note": None,
    }
    base.update(over)
    return base


# ═══════════════════════════════════════════════════════════════════════════
# Pure functions — no DB
# ═══════════════════════════════════════════════════════════════════════════

def test_clean_text_strips_html_controls_and_collapses_spaces():
    from app.services.question_submission_service import clean_text

    assert clean_text("  <b>Salom</b>\n\n dunyo​  ") == "Salom dunyo"
    assert clean_text("&lt;script&gt;alert(1)&lt;/script&gt;Savol") == "alert(1) Savol"
    assert clean_text("a\x00b\x07c") == "abc"
    assert clean_text(None) == ""


def test_validate_submission_accepts_a_good_question():
    from app.services.question_submission_service import validate_submission

    cleaned, errors = validate_submission(_valid())
    assert errors == []
    assert cleaned["correct_index"] == 0 and len(cleaned["options"]) == 4


@pytest.mark.parametrize("override", [
    {"question_text": "Qisqa?"},                                     # < 10 chars
    {"question_text": "x" * 201},                                    # > 200 chars
    {"question_text": "          ​​   qisqa   "},          # padding doesn't count
    {"options": ["A", "B", "C"]},                                    # 3 options
    {"options": ["A", "B", "C", "D", "E"]},                          # 5 options
    {"options": ["A", "B", "C", ""]},                                # empty option
    {"options": ["A", "B", "C", "x" * 81]},                          # option too long
    {"options": ["Oʻzbek", "O'zbek", "C", "D"]},                     # same after normalisation
    {"options": ["Toshkent", "toshkent.", "C", "D"]},                # case/punctuation duplicate
    {"correct_index": 4},
    {"correct_index": -1},
    {"correct_index": True},                                         # a bool is not an index
    {"explanation": "x" * 201},
])
def test_validate_submission_rejects(override):
    from app.services.question_submission_service import validate_submission

    _, errors = validate_submission(_valid(**override))
    assert errors


def test_queue_rank_puts_cold_disagreement_first_then_unverifiable():
    from app.services.question_submission_service import queue_rank

    disagree = {"ai_confidence": "high", "ai_verdict": {"cold_answer": {"outcome": "disagree"}}}
    unverifiable = {"ai_confidence": "unverifiable", "ai_verdict": {"cold_answer": {"outcome": "inconclusive"}}}
    low = {"ai_confidence": "low", "ai_verdict": {"cold_answer": {"outcome": "agree"}}}
    not_reviewed = {"ai_confidence": None, "ai_verdict": None}
    fine = {"ai_confidence": "high", "ai_verdict": {"cold_answer": {"outcome": "agree"}}}
    ranked = sorted([fine, low, disagree, not_reviewed, unverifiable], key=queue_rank)
    assert ranked[0] is disagree
    assert ranked[-1] is fine
    assert {queue_rank(x) for x in (unverifiable, low, not_reviewed)} == {1}


def test_cold_outcome_needs_confidence_to_disagree():
    from app.services.ai.prompts.question_cold_answer_v1 import outcome

    assert outcome(2, "sure", 2) == "agree"
    assert outcome(1, "sure", 2) == "disagree"
    assert outcome(1, "likely", 2) == "disagree"
    assert outcome(1, "unknown", 2) == "inconclusive"   # a guess is no evidence
    assert outcome(None, "sure", 2) == "inconclusive"
    assert outcome(7, "sure", 2) == "inconclusive"


def test_review_coerce_falls_back_to_the_cautious_side():
    from app.services.ai.prompts.question_review_v1 import coerce

    out = coerce({"confidence": "very_sure", "difficulty": "insane", "absurd_option_indexes": [0, 9, -1, 2, 2]})
    assert out["confidence"] == "unverifiable"
    assert out["difficulty"] == "medium"
    assert out["absurd_option_indexes"] == [0, 2]
    assert out["content_issue"] == "none"


def test_build_verdict_flags():
    from app.services.question_submission_service import build_verdict
    from app.services.ai.prompts.question_review_v1 import coerce

    review = coerce({
        "content_issue": "none", "mutually_exclusive": False, "also_correct_option_indexes": [2],
        "myth_asserted": True, "confidence": "low",
    })
    v = build_verdict({}, review, {"outcome": "disagree", "model_index": 1}, ["hloya -> halo"], [])
    assert v["flags"][0] == "cold_disagree"
    assert {"options_overlap", "also_correct", "myth", "orthography"} <= set(v["flags"])
    assert "hloya -> halo" in v["orthography"]

    err = build_verdict({}, None, {"outcome": "agree"}, [], [])
    assert err["review_error"] is True and "review_error" in err["flags"]


def test_mix_warning_is_advisory():
    from app.services.question_submission_service import mix_warning

    assert mix_warning(["easy", "easy", "medium", "medium", "hard"]) is None
    assert mix_warning(["easy", "easy", "easy", "medium", "hard"]).startswith("Qiyinlik")
    assert mix_warning(["easy", "medium"]) is None   # a short day isn't a mix problem


def test_clean_distractors_never_returns_the_answer_or_repeats():
    from app.services.question_submission_service import clean_distractors

    out = clean_distractors(["Toshkent", "toshkent", "Samarqand", "<i>Buxoro</i>", "Samarqand", "Xiva"], "TOSHKENT")
    assert out == ["Samarqand", "Buxoro", "Xiva"]
    assert clean_distractors("not a list", "x") == []


def test_attribution_and_status_labels():
    from app.services.question_submission_service import attribution_for, status_label

    assert attribution_for("Dilnoza", False) == "Dilnoza"
    assert attribution_for("Dilnoza", True) == "Sahifalab foydalanuvchisi"
    assert attribution_for("  ", False) == "Sahifalab foydalanuvchisi"
    assert status_label("rejected") == "Bu safar qoʻshilmadi"
    assert status_label("duplicate") == "Bu savol allaqachon bazamizda bor"
    assert status_label("scheduled", scheduled_date=date(2026, 11, 3)) == "03.11 kuni chiqadi"
    assert status_label("published", 214) == "Nashr etildi · 5 SAVOL #214"


# ═══════════════════════════════════════════════════════════════════════════
# Fake AI provider
# ═══════════════════════════════════════════════════════════════════════════

class FakeProvider:
    """Scripted per prompt_version. `review` / `cold` / `assist` may be a dict
    (returned as data) or an Exception instance (raised)."""

    def __init__(self, review=None, cold=None, assist=None):
        self.review = review if review is not None else {
            "content_issue": "none", "content_reason": "", "mutually_exclusive": True, "exclusivity_note": "",
            "absurd_option_indexes": [], "also_correct_option_indexes": [], "is_term_question": False,
            "answer_is_date_or_statistic": False, "myth_asserted": False, "quality_note": "",
            "orthography_issues": [], "category": "oziq_ovqat", "difficulty": "easy",
            "concept_tag": "honey_never_spoils", "matching_existing_tag": "",
            "suggested_explanation": "Asalda suv juda kam.", "confidence": "high", "confidence_reason": "Maʼlum fakt.",
        }
        self.cold = cold if cold is not None else {"answer_index": 0, "certainty": "sure"}
        self.assist = assist if assist is not None else {"distractors": ["Samarqand", "Buxoro", "Xiva"]}
        self.calls: list[str] = []

    async def generate_json(self, *, prompt_version, **_):
        from app.services.ai.base import AiResponse
        self.calls.append(prompt_version)
        payload = {
            "question_review.v1": self.review,
            "question_cold_answer.v1": self.cold,
            "question_distractors.v1": self.assist,
        }[prompt_version]
        if isinstance(payload, Exception):
            raise payload
        return AiResponse(data=payload, model="fake", input_tokens=1, output_tokens=1)


@pytest.fixture
def fake_ai(monkeypatch):
    from app.services import question_submission_service as svc

    def install(**kw):
        fake = FakeProvider(**kw)
        monkeypatch.setattr(svc, "get_provider", lambda: fake)
        return fake
    return install


# ═══════════════════════════════════════════════════════════════════════════
# DB-backed
# ═══════════════════════════════════════════════════════════════════════════

def _cleanup(session):
    uids = [USER_A, USER_B]
    session.execute(text("DELETE FROM daily_quiz_swap_log WHERE quiz_id IN (SELECT id FROM daily_quizzes WHERE theme = :t)"), {"t": THEME})
    session.execute(text("DELETE FROM daily_quiz_question_pool WHERE theme = :t"), {"t": THEME})
    session.execute(text("DELETE FROM daily_quiz_questions WHERE quiz_id IN (SELECT id FROM daily_quizzes WHERE theme = :t)"), {"t": THEME})
    session.execute(text("DELETE FROM daily_quizzes WHERE theme = :t"), {"t": THEME})
    session.execute(text("DELETE FROM question_assist_requests WHERE telegram_id = ANY(:u)"), {"u": uids})
    session.execute(text("DELETE FROM question_submissions WHERE telegram_id = ANY(:u)"), {"u": uids})
    session.execute(text("DELETE FROM tanga_transactions WHERE user_id = ANY(:u)"), {"u": uids})
    session.execute(text("DELETE FROM profiles WHERE telegram_id = ANY(:u)"), {"u": uids})
    session.commit()


@pytest.fixture
def db(monkeypatch):
    if not DATABASE_URL:
        pytest.skip("DATABASE_URL not set")
    from app.db.session import SessionLocal
    from app.services import config_service
    config_service.invalidate_config_cache()
    session = SessionLocal()
    _cleanup(session)
    for uid, name in ((USER_A, "Dilnoza"), (USER_B, "Jasur")):
        session.execute(text("""
            INSERT INTO profiles (telegram_id, first_name, tanga_balance, total_xp, timezone)
            VALUES (:uid, :name, 0, 0, 'Asia/Tashkent')
        """), {"uid": uid, "name": name})
    session.commit()
    try:
        yield session
    finally:
        session.rollback()
        _cleanup(session)
        session.close()


def _submit(db, uid=USER_A, **over):
    from app.services.question_submission_service import submit
    db.execute(text("UPDATE question_submissions SET created_at = created_at - INTERVAL '1 minute' WHERE telegram_id = :u"), {"u": uid})
    db.commit()
    return submit(db, uid, _valid(**over))


def _status(db, sid):
    return db.execute(text("SELECT status FROM question_submissions WHERE id = :id"), {"id": sid}).scalar()


_quiz_counter = [0]


def _seed_quiz(db, publish_date: date, status: str = "verified", difficulties=("easy", "easy", "medium", "medium", "hard"),
               tags=None) -> int:
    _quiz_counter[0] += 1
    row = db.execute(text("""
        INSERT INTO daily_quizzes (quiz_number, publish_date, theme, status)
        VALUES (:n, :d, :t, :s) RETURNING id
    """), {"n": 970000 + _quiz_counter[0], "d": publish_date, "t": THEME, "s": status}).fetchone()
    qid = int(row.id)
    for pos, diff in enumerate(difficulties):
        db.execute(text("""
            INSERT INTO daily_quiz_questions
                (quiz_id, position, question_text, options, correct_index, explanation, source, difficulty,
                 verified, verify_model_answer, concept_tag)
            VALUES (:qid, :pos, :qt, CAST(:o AS jsonb), 0, 'e', 's', :diff, TRUE, 0, :tag)
        """), {"qid": qid, "pos": pos, "qt": f"AI savol {qid}-{pos}", "o": json.dumps(["A", "B", "C", "D"]),
               "diff": diff, "tag": (tags or {}).get(pos, f"food_ai_{qid}_{pos}")})
    db.commit()
    return qid


def _approved(db, uid=USER_A, difficulty="easy", tag=None, **over) -> int:
    sid = _submit(db, uid, **over)["id"]
    db.execute(text("""
        UPDATE question_submissions SET status = 'approved', difficulty = :d, concept_tag = :tag, category = 'oziq_ovqat'
        WHERE id = :id
    """), {"d": difficulty, "tag": tag or f"food_user_{sid}", "id": sid})
    db.commit()
    return sid


def _future(days: int) -> date:
    return datetime.now(UTC).date() + timedelta(days=days)


# ── Limits ────────────────────────────────────────────────────────────────

def test_daily_limit_is_three_per_rolling_24h(db):
    from app.services.question_submission_service import SubmissionError, limits

    for i in range(3):
        _submit(db, question_text=f"Birinchi savol matni raqam {i} nima?")
    with pytest.raises(SubmissionError) as e:
        _submit(db, question_text="Toʻrtinchi savol bugun oʻtmasligi kerak?")
    assert e.value.code == "daily_limit" and e.value.status == 429
    assert limits(db, USER_A)["remaining_today"] == 0

    # The bucket is the DB clock: rows older than 24 h stop counting.
    db.execute(text("UPDATE question_submissions SET created_at = NOW() - INTERVAL '25 hours' WHERE telegram_id = :u"), {"u": USER_A})
    db.commit()
    assert limits(db, USER_A)["remaining_today"] == 3
    _submit(db, question_text="Yangi kunda yana yuborish mumkinmi?")


def test_pending_limit_is_ten(db):
    from app.services.question_submission_service import SubmissionError

    for i in range(10):
        db.execute(text("""
            INSERT INTO question_submissions (telegram_id, question_text, options, correct_index, status, created_at)
            VALUES (:u, :q, '["a","b","c","d"]', 0, 'pending_review', NOW() - INTERVAL '3 days')
        """), {"u": USER_A, "q": f"eski savol {i}"})
    db.commit()
    with pytest.raises(SubmissionError) as e:
        _submit(db)
    assert e.value.code == "pending_limit"


def test_submit_throttles_rapid_fire(db):
    from app.services.question_submission_service import SubmissionError, submit

    submit(db, USER_A, _valid())
    with pytest.raises(SubmissionError) as e:
        submit(db, USER_A, _valid(question_text="Darhol ikkinchi savol yuborildi?"))
    assert e.value.code == "too_fast"


def test_invalid_submission_never_creates_a_row(db):
    from app.services.question_submission_service import SubmissionError, submit

    with pytest.raises(SubmissionError):
        submit(db, USER_A, _valid(options=["A", "A", "B", "C"]))
    assert db.execute(text("SELECT COUNT(*) FROM question_submissions WHERE telegram_id = :u"), {"u": USER_A}).scalar() == 0


def test_submit_snapshots_the_display_name(db):
    sid = _submit(db, is_anonymous=True)["id"]
    row = db.execute(text("SELECT attribution_name, is_anonymous, status FROM question_submissions WHERE id = :id"), {"id": sid}).fetchone()
    assert row.attribution_name == "Dilnoza" and row.is_anonymous is True and row.status == "pending_review"


# ── AI assist ─────────────────────────────────────────────────────────────

def test_assist_returns_three_and_has_its_own_cap(db, fake_ai):
    from app.services.question_submission_service import SubmissionError, assist_distractors

    fake_ai()
    for _ in range(5):
        out = asyncio.run(assist_distractors(db, USER_A, "Oʻzbekistonning poytaxti qaysi shahar?", "Toshkent"))
        assert len(out) == 3 and "Toshkent" not in out
    with pytest.raises(SubmissionError) as e:
        asyncio.run(assist_distractors(db, USER_A, "Oʻzbekistonning poytaxti qaysi shahar?", "Toshkent"))
    assert e.value.code == "assist_limit"


def test_assist_failure_does_not_use_up_the_cap(db, fake_ai):
    from app.services.ai.base import AiProviderError
    from app.services.question_submission_service import SubmissionError, assist_distractors, limits

    fake_ai(assist=AiProviderError("boom"))
    with pytest.raises(SubmissionError) as e:
        asyncio.run(assist_distractors(db, USER_A, "Oʻzbekistonning poytaxti qaysi shahar?", "Toshkent"))
    assert e.value.code == "assist_failed"
    assert limits(db, USER_A)["assist_remaining"] == 5


# ── Review ────────────────────────────────────────────────────────────────

def test_review_is_advisory_and_stores_the_verdict(db, fake_ai):
    from app.services.question_submission_service import review_submission

    fake_ai()
    sid = _submit(db)["id"]
    res = asyncio.run(review_submission(db, sid))
    row = db.execute(text("SELECT * FROM question_submissions WHERE id = :id"), {"id": sid}).fetchone()
    assert res["status"] == "pending_review" == row.status        # never auto-approved
    assert row.ai_confidence == "high"
    assert row.category == "oziq_ovqat" and row.concept_tag == "food_honey_never_spoils"
    assert row.ai_verdict["cold_answer"]["outcome"] == "agree"
    assert asyncio.run(review_submission(db, sid)) is None          # already reviewed: no second run


def test_cold_check_catches_a_wrong_answer(db, fake_ai):
    from app.services.question_submission_service import admin_list, review_submission

    fake_ai(cold={"answer_index": 2, "certainty": "sure"})
    wrong = _submit(db)["id"]
    asyncio.run(review_submission(db, wrong))
    fake_ai(review=FakeProvider().review | {"concept_tag": "sea_salt_origin"})
    fine = _submit(db, question_text="Nega dengiz suvi shoʻr boʻladi?")["id"]
    asyncio.run(review_submission(db, fine))
    queue = admin_list(db)
    assert queue[0]["id"] == wrong
    assert queue[0]["ai_verdict"]["flags"][0] == "cold_disagree"


def test_unverifiable_is_kept_and_sorted_up(db, fake_ai):
    from app.services.question_submission_service import admin_list, review_submission

    fake_ai()
    fine = _submit(db)["id"]
    asyncio.run(review_submission(db, fine))
    review = FakeProvider().review | {
        "confidence": "unverifiable", "confidence_reason": "Mahalliy tarix.", "concept_tag": "khiva_minaret",
    }
    fake_ai(review=review, cold={"answer_index": 3, "certainty": "unknown"})
    local = _submit(db, question_text="Xiva Ichan qalʼasidagi eng baland minora qaysi?")["id"]
    asyncio.run(review_submission(db, local))
    row = db.execute(text("SELECT ai_confidence, ai_verdict FROM question_submissions WHERE id = :id"), {"id": local}).fetchone()
    assert row.ai_confidence == "unverifiable"
    assert row.ai_verdict["cold_answer"]["outcome"] == "inconclusive"  # an "unknown" guess isn't a disagreement
    assert [x["id"] for x in admin_list(db)] == [local, fine]


def test_content_screen_auto_rejects(db, fake_ai):
    from app.services.question_submission_service import my_submissions, review_submission

    review = FakeProvider().review | {"content_issue": "promotional", "content_reason": "Kanal reklamasi"}
    fake_ai(review=review)
    sid = _submit(db, question_text="Eng zoʻr kanal qaysi? @mychannel ga obuna boʻling")["id"]
    asyncio.run(review_submission(db, sid))
    assert _status(db, sid) == "rejected"
    mine = my_submissions(db, USER_A)[0]
    assert mine["status_label"] == "Bu safar qoʻshilmadi"
    assert "rejection_reason" not in mine                              # internal reason never exposed


def test_failed_review_retries_then_surfaces(db, fake_ai):
    from app.services.ai.base import AiProviderError
    from app.services.question_submission_service import review_submission

    fake_ai(review=AiProviderError("down"))
    sid = _submit(db)["id"]
    assert asyncio.run(review_submission(db, sid))["retry"] is True
    for _ in range(2):
        db.execute(text("UPDATE question_submissions SET updated_at = NOW() - INTERVAL '10 minutes' WHERE id = :id"), {"id": sid})
        db.commit()
        asyncio.run(review_submission(db, sid, sweep=True))
    row = db.execute(text("SELECT status, ai_verdict, ai_reviewed_at FROM question_submissions WHERE id = :id"), {"id": sid}).fetchone()
    assert row.status == "pending_review" and row.ai_reviewed_at is not None
    assert row.ai_verdict["review_error"] is True


# ── Dedup ─────────────────────────────────────────────────────────────────

def test_duplicate_of_a_recent_quiz_question(db, fake_ai):
    from app.services.question_submission_service import my_submissions, review_submission

    _seed_quiz(db, datetime.now(UTC).date() - timedelta(days=30), status="closed", tags={0: "food_honey_never_spoils"})
    fake_ai()
    sid = _submit(db)["id"]
    asyncio.run(review_submission(db, sid))
    assert _status(db, sid) == "duplicate"
    assert my_submissions(db, USER_A)[0]["status_label"] == "Bu savol allaqachon bazamizda bor"


def test_duplicate_of_another_pending_submission(db, fake_ai):
    from app.services.question_submission_service import review_submission

    fake_ai()
    first = _submit(db, USER_A)["id"]
    asyncio.run(review_submission(db, first))
    second = _submit(db, USER_B, question_text="Asal qanday qilib minglab yil saqlanadi?")["id"]
    asyncio.run(review_submission(db, second))   # same concept tag from the fake
    assert _status(db, first) == "pending_review"
    assert _status(db, second) == "duplicate"


def test_old_question_beyond_window_is_not_a_duplicate(db, fake_ai):
    from app.services.question_submission_service import review_submission

    _seed_quiz(db, datetime.now(UTC).date() - timedelta(days=200), status="closed", tags={0: "food_honey_never_spoils"})
    fake_ai()
    sid = _submit(db)["id"]
    asyncio.run(review_submission(db, sid))
    assert _status(db, sid) == "pending_review"


# ── Swap ──────────────────────────────────────────────────────────────────

def test_swap_into_a_future_quiz_and_displaced_question_goes_to_pool(db):
    from app.services.question_submission_service import swap

    quiz = _seed_quiz(db, _future(301))
    sid = _approved(db, difficulty="easy")
    res = swap(db, quiz, 1, sid, admin_id=42)
    assert res["ok"] and res["user_count"] == 1 and res["mix_warning"] is None

    row = db.execute(text("SELECT origin, submission_id FROM daily_quiz_questions WHERE quiz_id = :q AND position = 1"), {"q": quiz}).fetchone()
    assert row.origin == "user" and row.submission_id == sid
    sub = db.execute(text("SELECT status, scheduled_quiz_id, scheduled_position FROM question_submissions WHERE id = :id"), {"id": sid}).fetchone()
    assert (sub.status, sub.scheduled_quiz_id, sub.scheduled_position) == ("scheduled", quiz, 1)

    pool = db.execute(text("SELECT question_text, status, reason FROM daily_quiz_question_pool WHERE id = :id"), {"id": res["pool_id"]}).fetchone()
    assert pool.question_text == f"AI savol {quiz}-1" and pool.status == "available" and pool.reason == "displaced"
    log = db.execute(text("SELECT action, admin_id, submission_id FROM daily_quiz_swap_log WHERE quiz_id = :q"), {"q": quiz}).fetchone()
    assert (log.action, log.admin_id, log.submission_id) == ("swap", 42, sid)


@pytest.mark.parametrize("days, status", [(0, "verified"), (0, "published"), (-1, "closed"), (5, "published")])
def test_swap_into_live_or_past_quiz_fails(db, days, status):
    from app.services.question_submission_service import SubmissionError, swap

    quiz = _seed_quiz(db, datetime.now(UTC).date() + timedelta(days=days), status=status)
    sid = _approved(db)
    with pytest.raises(SubmissionError) as e:
        swap(db, quiz, 0, sid, admin_id=1)
    assert e.value.code == "quiz_locked"
    assert _status(db, sid) == "approved"                              # nothing changed
    assert db.execute(text("SELECT COUNT(*) FROM daily_quiz_question_pool WHERE theme = :t"), {"t": THEME}).scalar() == 0


def test_two_of_five_cap_holds(db):
    from app.services.question_submission_service import SubmissionError, swap

    quiz = _seed_quiz(db, _future(302))
    swap(db, quiz, 0, _approved(db, USER_A, question_text="Birinchi foydalanuvchi savoli nima?"), 1)
    swap(db, quiz, 1, _approved(db, USER_B, question_text="Ikkinchi foydalanuvchi savoli nima?"), 1)
    third = _approved(db, USER_A, question_text="Uchinchi foydalanuvchi savoli nima?")
    with pytest.raises(SubmissionError) as e:
        swap(db, quiz, 2, third, 1)
    assert e.value.code == "user_cap"
    # Replacing one user question with another stays within the cap.
    res = swap(db, quiz, 1, third, 1)
    assert res["user_count"] == 2


def test_swap_refuses_a_concept_already_in_the_window(db):
    from app.services.question_submission_service import SubmissionError, swap

    quiz = _seed_quiz(db, _future(303), tags={4: "food_same_fact"})
    sid = _approved(db, tag="food_same_fact")
    with pytest.raises(SubmissionError) as e:
        swap(db, quiz, 0, sid, 1)
    assert e.value.code == "duplicate_in_quiz"
    _seed_quiz(db, _future(250), tags={0: "food_other_fact"})
    sid2 = _approved(db, tag="food_other_fact", question_text="Boshqa kunda bor fakt haqida savol?")
    with pytest.raises(SubmissionError) as e:
        swap(db, quiz, 0, sid2, 1)
    assert e.value.code == "duplicate_recent"


def test_swap_needs_an_approved_submission(db):
    from app.services.question_submission_service import SubmissionError, swap

    quiz = _seed_quiz(db, _future(304))
    sid = _submit(db)["id"]                                             # still pending_review
    with pytest.raises(SubmissionError) as e:
        swap(db, quiz, 0, sid, 1)
    assert e.value.code == "bad_status"


def test_swap_warns_on_mix_and_rebalance_fixes_it(db):
    from app.services.question_submission_service import rebalance, swap

    quiz = _seed_quiz(db, _future(305))
    # Leftover AI questions for the rebalance to pick from.
    db.execute(text("""
        INSERT INTO daily_quiz_question_pool (theme, question_text, options, correct_index, explanation, source, difficulty, reason, concept_tag)
        VALUES (:t, 'Zaxira hard savol', '["a","b","c","d"]', 0, 'e', 's', 'hard', 'leftover', 'food_pool_hard')
    """), {"t": THEME})
    db.commit()
    res = swap(db, quiz, 4, _approved(db, difficulty="easy"), 1)       # the hard slot becomes easy
    assert res["mix_warning"] and res["difficulty_counts"] == {"easy": 3, "medium": 2, "hard": 0}

    fixed = rebalance(db, quiz, 1)
    assert fixed["changed"] and fixed["mix_warning"] is None
    origins = db.execute(text("SELECT origin FROM daily_quiz_questions WHERE quiz_id = :q"), {"q": quiz}).fetchall()
    assert sum(1 for o in origins if o.origin == "user") == 1          # the user question was not touched


def test_unswap_restores_the_displaced_question(db):
    from app.services.question_submission_service import swap, unswap

    quiz = _seed_quiz(db, _future(306))
    sid = _approved(db)
    pool_id = swap(db, quiz, 2, sid, 1)["pool_id"]
    unswap(db, quiz, 2, 1)
    row = db.execute(text("SELECT question_text, origin FROM daily_quiz_questions WHERE quiz_id = :q AND position = 2"), {"q": quiz}).fetchone()
    assert row.question_text == f"AI savol {quiz}-2" and row.origin == "ai"
    assert _status(db, sid) == "approved"
    assert db.execute(text("SELECT status FROM daily_quiz_question_pool WHERE id = :id"), {"id": pool_id}).scalar() == "used"
    actions = [r.action for r in db.execute(text("SELECT action FROM daily_quiz_swap_log WHERE quiz_id = :q ORDER BY id"), {"q": quiz})]
    assert actions == ["swap", "unswap"]


def test_reconcile_releases_a_question_removed_from_its_day(db):
    from app.services.question_submission_service import reconcile_quiz, release_for_quiz, swap

    quiz = _seed_quiz(db, _future(307))
    sid = _approved(db)
    swap(db, quiz, 0, sid, 1)
    db.execute(text("DELETE FROM daily_quiz_questions WHERE quiz_id = :q AND position = 0"), {"q": quiz})
    reconcile_quiz(db, quiz)
    db.commit()
    assert _status(db, sid) == "approved"

    sid2 = _approved(db, question_text="Yana bir foydalanuvchi savoli nima?")
    swap(db, quiz, 1, sid2, 1)
    assert release_for_quiz(db, quiz) == 1
    db.commit()
    assert _status(db, sid2) == "approved"


# ── Publication, reward, attribution ──────────────────────────────────────

def _balance(db, uid):
    return db.execute(text("SELECT tanga_balance FROM profiles WHERE telegram_id = :u"), {"u": uid}).scalar()


def test_reward_only_on_publish_and_idempotent_and_no_xp(db, monkeypatch):
    from app.services import daily_quiz_service
    from app.services.question_submission_service import on_quiz_published, swap

    pushed: list[dict] = []

    async def fake_push(messages):
        pushed.extend(messages)
        return len(messages), 0
    monkeypatch.setattr(daily_quiz_service, "_push_batch", fake_push)
    db.execute(text("""UPDATE profiles SET user_settings = '{"expo_push_token": "ExponentPushToken[test]"}' WHERE telegram_id = :u"""), {"u": USER_A})
    db.commit()

    quiz = _seed_quiz(db, _future(1))
    sid = _approved(db)
    swap(db, quiz, 0, sid, 1)
    assert _balance(db, USER_A) == 0                                    # approved + scheduled: nothing paid yet

    # The day arrives.
    db.execute(text("DELETE FROM daily_quizzes WHERE publish_date = :d AND theme <> :t"), {"d": datetime.now(UTC).date(), "t": THEME})
    db.execute(text("UPDATE daily_quizzes SET publish_date = :d, status = 'published' WHERE id = :q"), {"d": datetime.now(UTC).date(), "q": quiz})
    db.commit()
    first = asyncio.run(on_quiz_published(db, quiz))
    second = asyncio.run(on_quiz_published(db, quiz))                   # replayed publish
    assert first["published"] == 1 and first["rewarded"] == 1 and first["sent"] == 1
    assert second["published"] == 0 and second["rewarded"] == 0 and second["sent"] == 0

    assert _balance(db, USER_A) == 25
    ledger = db.execute(text("SELECT COUNT(*) FROM tanga_transactions WHERE user_id = :u AND reason = 'question_published'"), {"u": USER_A}).scalar()
    assert ledger == 1
    prof = db.execute(text("SELECT total_xp, questions_published_count FROM profiles WHERE telegram_id = :u"), {"u": USER_A}).fetchone()
    assert prof.total_xp == 0 and prof.questions_published_count == 1  # no XP, ever
    assert len(pushed) == 1 and pushed[0]["body"].startswith("Sizning savolingiz bugungi 5 SAVOLDA")

    # A data fix that re-flags the row as unpaid can't pay twice either.
    db.execute(text("UPDATE question_submissions SET reward_granted = FALSE WHERE id = :id"), {"id": sid})
    db.commit()
    from app.services.question_submission_service import grant_publication_reward
    grant_publication_reward(db, sid)
    assert _balance(db, USER_A) == 25


def test_attribution_names_and_anonymous(db):
    from app.services.question_submission_service import attributions, swap

    quiz = _seed_quiz(db, _future(308))
    named = _approved(db, USER_A)
    anon = _approved(db, USER_B, question_text="Anonim foydalanuvchi savoli nima?", is_anonymous=True)
    swap(db, quiz, 0, named, 1)
    swap(db, quiz, 1, anon, 1)
    names = sorted(attributions(db, quiz).values())
    assert names == ["Dilnoza", "Sahifalab foydalanuvchisi"]


def test_end_to_end_submission_to_published_quiz(db, fake_ai, monkeypatch):
    """submit -> AI review (advisory) -> admin approve with an edit -> swap into
    tomorrow -> rollover publishes it -> status, reward, attribution, push."""
    from app.services import daily_quiz_service
    from app.services.question_submission_service import (
        approve, attributions, my_submissions, review_submission, swap,
    )

    monkeypatch.setattr(daily_quiz_service, "_push_batch", lambda messages: asyncio.sleep(0, result=(len(messages), 0)))
    fake_ai()
    sid = _submit(db, explanation=None)["id"]
    asyncio.run(review_submission(db, sid))
    approved = approve(db, sid, admin_id=7, edits={"difficulty": "easy"})
    assert approved["status"] == "approved"
    assert approved["explanation"] == "Asalda suv juda kam."            # AI suggestion pre-filled, shown to the admin

    tomorrow = _future(1)
    quiz = _seed_quiz(db, tomorrow)
    swap(db, quiz, 0, sid, 7)
    assert my_submissions(db, USER_A)[0]["status_label"] == f"{tomorrow.strftime('%d.%m')} kuni chiqadi"

    today = datetime.now(UTC).date()
    db.execute(text("DELETE FROM daily_quizzes WHERE publish_date = :d AND theme <> :t"), {"d": today, "t": THEME})
    db.execute(text("UPDATE daily_quizzes SET publish_date = :d WHERE id = :q"), {"d": today, "q": quiz})
    db.commit()
    result = asyncio.run(daily_quiz_service.rollover(db, today))
    assert result["published"] is True

    mine = my_submissions(db, USER_A)[0]
    assert mine["status"] == "published" and mine["quiz_number"] is not None and mine["reward_tanga"] == 25
    assert _balance(db, USER_A) == 25
    assert list(attributions(db, quiz).values()) == ["Dilnoza"]


# ── generate_week: the pool, leftovers, and user rows on a draft day ──────

def _gw_cleanup(db, d: date):
    db.execute(text("DELETE FROM daily_quiz_question_pool WHERE origin_quiz_id IN (SELECT id FROM daily_quizzes WHERE publish_date = :d) OR theme LIKE 'gw_%'"), {"d": d})
    db.execute(text("DELETE FROM daily_quiz_questions WHERE quiz_id IN (SELECT id FROM daily_quizzes WHERE publish_date = :d)"), {"d": d})
    db.execute(text("DELETE FROM daily_quizzes WHERE publish_date = :d"), {"d": d})
    db.commit()


def _pool_row(db, theme, diff, n):
    db.execute(text("""
        INSERT INTO daily_quiz_question_pool (theme, question_text, options, correct_index, explanation, source, difficulty, reason, concept_tag)
        VALUES (:t, :q, '["a","b","c","d"]', 0, 'e', 's', :d, 'displaced', :tag)
    """), {"t": theme, "q": f"Pool {diff} {n}", "d": diff, "tag": f"gwtag_{diff}_{n}"})


def test_generate_week_fills_a_new_day_from_the_pool_first(db, monkeypatch):
    from app.services import category_config, daily_quiz_service

    class NoAi:
        async def generate_json(self, **_):
            raise AssertionError("no AI call needed when the pool covers the day")
    monkeypatch.setattr(daily_quiz_service, "get_provider", lambda: NoAi())

    d = _future(500)
    _gw_cleanup(db, d)
    theme = category_config.get_category_for_date(db, d)["key"]
    try:
        for i, diff in enumerate(["easy", "easy", "medium", "medium", "hard", "easy"]):
            _pool_row(db, theme, diff, i)
        db.commit()
        res = asyncio.run(daily_quiz_service.generate_week(db, d, days_ahead=1))
        assert res["created"][0]["status"] == "verified"
        used = db.execute(text("SELECT COUNT(*) FROM daily_quiz_question_pool WHERE theme = :t AND status = 'used'"), {"t": theme}).scalar()
        left = db.execute(text("SELECT COUNT(*) FROM daily_quiz_question_pool WHERE theme = :t AND status = 'available' AND question_text LIKE 'Pool %'"), {"t": theme}).scalar()
        assert used == 5 and left == 1                                  # the spare stays available, never duplicated
    finally:
        db.execute(text("DELETE FROM daily_quiz_question_pool WHERE question_text LIKE 'Pool %'"))
        db.commit()
        _gw_cleanup(db, d)


def test_generate_week_keeps_a_user_question_on_a_draft_top_up_and_saves_leftovers(db, monkeypatch):
    from app.services import category_config, daily_quiz_service
    from app.services.ai.base import AiResponse
    from app.services.question_submission_service import swap

    d = _future(501)
    _gw_cleanup(db, d)
    theme = category_config.get_category_for_date(db, d)["key"]
    prefix = category_config.get_category_for_date(db, d)["tag_prefix"]
    try:
        quiz = _seed_quiz(db, d, status="verified")
        db.execute(text("UPDATE daily_quizzes SET theme = :t WHERE id = :q"), {"t": theme, "q": quiz})
        db.commit()
        sid = _approved(db, difficulty="easy")
        swap(db, quiz, 0, sid, 1)
        # A later admin delete leaves the day short -> 'draft'.
        db.execute(text("DELETE FROM daily_quiz_questions WHERE quiz_id = :q AND position = 4"), {"q": quiz})
        db.execute(text("UPDATE daily_quizzes SET status = 'draft' WHERE id = :q"), {"q": quiz})
        # Take the swap's displaced question out of play so the top-up has to generate.
        db.execute(text("UPDATE daily_quiz_question_pool SET status = 'used' WHERE origin_quiz_id = :q"), {"q": quiz})
        db.commit()

        def candidates():
            return [{
                "question_text": f"Yangi {diff} {i}", "options": ["a", "b", "c", "d"], "correct_index": 0,
                "explanation": "e", "source": "s", "difficulty": diff, "concept_tag": f"{prefix}_new_{diff}_{i}",
            } for i, diff in enumerate(["hard", "hard", "easy", "medium"])]

        class Fake:
            async def generate_json(self, *, prompt_version, **_):
                if prompt_version.startswith("daily_quiz_gen"):
                    return AiResponse(data={"questions": candidates()}, model="fake")
                if prompt_version.startswith("daily_quiz_verify"):
                    return AiResponse(data={"answer_index": 0}, model="fake")
                return AiResponse(data={
                    "mutually_exclusive": True, "distractors_real": True, "meets_difficulty_floor": True,
                    "single_defensible_answer": True, "banned_content_found": False, "is_term_question": False,
                    "worth_repeating": True, "verdict": "pass", "reasons": [],
                }, model="fake")
        monkeypatch.setattr(daily_quiz_service, "get_provider", lambda: Fake())

        asyncio.run(daily_quiz_service.generate_week(db, d, days_ahead=1))
        status = db.execute(text("SELECT status FROM daily_quizzes WHERE id = :q"), {"q": quiz}).scalar()
        assert status == "verified"
        user_row = db.execute(text("SELECT id, position FROM daily_quiz_questions WHERE quiz_id = :q AND submission_id = :s"), {"q": quiz, "s": sid}).fetchone()
        assert user_row is not None                                     # the user question survived the top-up
        sub = db.execute(text("SELECT status, quiz_question_id, scheduled_position FROM question_submissions WHERE id = :id"), {"id": sid}).fetchone()
        assert sub.status == "scheduled" and sub.quiz_question_id == user_row.id and sub.scheduled_position == user_row.position
        leftovers = db.execute(text("SELECT COUNT(*) FROM daily_quiz_question_pool WHERE origin_quiz_id = :q AND reason = 'leftover'"), {"q": quiz}).scalar()
        assert leftovers >= 1                                           # unselected verified candidates kept, not thrown away
    finally:
        _gw_cleanup(db, d)


def test_a_wrong_or_mythical_marked_answer_never_reads_above_low():
    from app.services.ai.prompts.question_review_v1 import coerce

    assert coerce({"confidence": "high", "marked_answer_verdict": "incorrect"})["confidence"] == "low"
    assert coerce({"confidence": "high", "myth_asserted": True})["confidence"] == "low"
    assert coerce({"confidence": "high", "marked_answer_verdict": "correct"})["confidence"] == "high"
    assert coerce({"confidence": "unverifiable", "marked_answer_verdict": "incorrect"})["confidence"] == "unverifiable"


def test_open_range_overlap_rule():
    from app.services.question_submission_service import open_range_overlap

    assert open_range_overlap(["12 soatdan ko'p", "14-17 soat", "Kamida 10 soat", "8 soatgacha"])
    assert open_range_overlap(["1 kun", "2 kun", "3 kun", "4 kun"]) is None
    assert open_range_overlap(["Toshkent", "Samarqand", "Buxoro", "Xiva"]) is None


def test_queue_rank_puts_a_hot_review_wrong_answer_first():
    from app.services.question_submission_service import queue_rank

    assert queue_rank({"ai_confidence": "low", "ai_verdict": {"marked_answer": "incorrect", "cold_answer": {"outcome": "agree"}}}) == 0


def test_numeric_correct_answer_is_flagged_even_if_the_model_misses_it():
    from app.services.question_submission_service import build_verdict
    from app.services.ai.prompts.question_review_v1 import coerce

    sub = {"options": ["8 soat", "14-17 soat", "20 soat", "24 soat"], "correct_index": 1}
    v = build_verdict(sub, coerce({"answer_is_date_or_statistic": False}), {"outcome": "agree"}, [], [])
    assert "date_or_statistic" in v["flags"] and v["quality"]["date_or_statistic"] is True


def test_contradicting_ai_checks_read_as_unverifiable(db, fake_ai):
    from app.services.question_submission_service import review_submission

    fake_ai(cold={"answer_index": 2, "certainty": "sure"})   # hot review: marked answer correct, "high"
    sid = _submit(db)["id"]
    asyncio.run(review_submission(db, sid))
    row = db.execute(text("SELECT ai_confidence, ai_verdict FROM question_submissions WHERE id = :id"), {"id": sid}).fetchone()
    assert row.ai_confidence == "unverifiable"
    assert row.ai_verdict["flags"][0] == "cold_disagree"
