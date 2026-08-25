"""
deploy_verify.py — pre/post-deploy verification for the Tanga currency
change (088_tanga_currency, 089_ai_infrastructure).

This backend suffered a 3-day silent outage where focus_sessions stopped
receiving rows entirely, with no error and no log line, caused by a raw-SQL
driver quirk in exactly one of the 13 call sites this change also touches.
This script exists so the next deploy touching that write path is verified
against real numbers, not vibes, and so a bad deploy is caught in minutes,
not days.

Deliberately dependency-light: only sqlalchemy + pg8000 (already pinned in
requirements.txt), no import of app.* modules — during a live incident you
want the fewest possible moving parts between you and the database.

Usage:
    export DATABASE_URL=postgresql://...          # production connection string
    python scripts/deploy_verify.py baseline --out baseline.json
    # ... deploy ...
    python scripts/deploy_verify.py check --baseline baseline.json
    python scripts/deploy_verify.py watch --baseline baseline.json --minutes 60 --interval 5

Exit codes: 0 = all checks pass. 1 = WARN (investigate). 2 = FAIL (rollback
trigger condition met — see DEPLOY_RUNBOOK.md).
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

from sqlalchemy import create_engine, text

# ── Rollback trigger thresholds (spec: "stated as a rule before deploying,
# not judged in the moment") — see DEPLOY_RUNBOOK.md for the full rule text.
MIN_FOCUS_SESSIONS_RATE_RATIO = 0.5   # new rows must be >= 50% of the historical
                                       # rate for this hour-of-day, or FAIL
ZERO_ROWS_GRACE_MINUTES = 30          # zero new focus_sessions rows within this
                                       # many minutes of a normally-active hour = FAIL
LEDGER_SAMPLE_SIZE = 25


def _get_engine():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("FATAL: DATABASE_URL not set.", file=sys.stderr)
        sys.exit(2)
    if url.startswith("postgresql://") and "+pg8000" not in url:
        url = url.replace("postgresql://", "postgresql+pg8000://", 1)
    return create_engine(url)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ── Baseline ──────────────────────────────────────────────────────────────

def cmd_baseline(args):
    engine = _get_engine()
    with engine.connect() as conn:
        focus_24h = conn.execute(text(
            "SELECT COUNT(*) FROM focus_sessions WHERE created_at >= NOW() - INTERVAL '24 hours'"
        )).scalar()
        focus_1h = conn.execute(text(
            "SELECT COUNT(*) FROM focus_sessions WHERE created_at >= NOW() - INTERVAL '1 hour'"
        )).scalar()
        max_id = conn.execute(text("SELECT COALESCE(MAX(id), 0) FROM focus_sessions")).scalar()
        tanga_tx_count = conn.execute(text("SELECT COUNT(*) FROM tanga_transactions")).scalar()

        # Historical hourly rate for THIS hour-of-day, averaged over the last
        # 7 days (excluding the last 2h, to not include the deploy window
        # itself if baseline is captured right before deploying).
        hourly_rate = conn.execute(text("""
            SELECT COALESCE(AVG(cnt), 0) FROM (
                SELECT DATE_TRUNC('hour', created_at) AS hr, COUNT(*) AS cnt
                FROM focus_sessions
                WHERE created_at >= NOW() - INTERVAL '8 days'
                  AND created_at <  NOW() - INTERVAL '2 hours'
                  AND EXTRACT(HOUR FROM created_at) = EXTRACT(HOUR FROM NOW())
                GROUP BY hr
            ) sub
        """)).scalar()

        sample = conn.execute(text("""
            SELECT p.telegram_id, p.tanga_balance,
                   COALESCE((SELECT SUM(delta) FROM tanga_transactions t WHERE t.user_id = p.telegram_id), 0) AS ledger_sum
            FROM profiles p
            WHERE p.status = 'active'
            ORDER BY p.telegram_id DESC
            LIMIT :n
        """), {"n": LEDGER_SAMPLE_SIZE}).fetchall()

        sample_rows = [
            {"telegram_id": r.telegram_id, "tanga_balance": r.tanga_balance, "ledger_sum": r.ledger_sum,
             "matches": r.tanga_balance == r.ledger_sum}
            for r in sample
        ]
        mismatches = [r for r in sample_rows if not r["matches"]]

    baseline = {
        "captured_at": _now_utc().isoformat(),
        "focus_sessions_last_24h": focus_24h,
        "focus_sessions_last_1h": focus_1h,
        "focus_sessions_max_id": max_id,
        "tanga_transactions_count": tanga_tx_count,
        "historical_hourly_rate_this_hour": float(hourly_rate),
        "ledger_sample": sample_rows,
        "ledger_sample_mismatches_at_baseline": len(mismatches),
    }

    print(json.dumps(baseline, indent=2))
    if args.out:
        with open(args.out, "w") as f:
            json.dump(baseline, f, indent=2)
        print(f"\nBaseline written to {args.out}", file=sys.stderr)

    if mismatches:
        print(
            f"\nWARNING: {len(mismatches)} users already have tanga_balance != ledger sum "
            "BEFORE this deploy — investigate separately, this is pre-existing drift, "
            "not something this deploy caused.",
            file=sys.stderr,
        )
    return 0


# ── Post-deploy check ────────────────────────────────────────────────────

def cmd_check(args):
    with open(args.baseline) as f:
        baseline = json.load(f)

    engine = _get_engine()
    with engine.connect() as conn:
        minutes_since_baseline = max(
            1.0,
            (_now_utc() - datetime.fromisoformat(baseline["captured_at"])).total_seconds() / 60.0,
        )

        new_focus_sessions = conn.execute(text(
            "SELECT COUNT(*) FROM focus_sessions WHERE id > :max_id"
        ), {"max_id": baseline["focus_sessions_max_id"]}).scalar()

        new_tanga_tx = conn.execute(text(
            "SELECT COUNT(*) FROM tanga_transactions"
        )).scalar() - baseline["tanga_transactions_count"]

        # Only flag users whose balance/ledger MATCHED at baseline and have
        # since diverged — a user already mismatched before this deploy is
        # pre-existing drift (reported separately by `baseline`), not
        # something this deploy caused, and re-flagging it here would cry
        # wolf on every check for the rest of the watch window.
        baseline_matching_ids = [r["telegram_id"] for r in baseline["ledger_sample"] if r["matches"]]
        mismatches = []
        if baseline_matching_ids:
            rows = conn.execute(text("""
                SELECT p.telegram_id, p.tanga_balance,
                       COALESCE((SELECT SUM(delta) FROM tanga_transactions t WHERE t.user_id = p.telegram_id), 0) AS ledger_sum
                FROM profiles p
                WHERE p.telegram_id = ANY(:ids)
            """), {"ids": baseline_matching_ids}).fetchall()
            mismatches = [r for r in rows if r.tanga_balance != r.ledger_sum]

    observed_rate_per_hour = new_focus_sessions / (minutes_since_baseline / 60.0)
    expected_rate = baseline["historical_hourly_rate_this_hour"]
    rate_ratio = (observed_rate_per_hour / expected_rate) if expected_rate > 0 else None

    status = "PASS"
    reasons = []

    # Rule 1 (spec's explicit example): zero new rows within the grace
    # window during what history says is a normally-active hour = FAIL.
    if (
        minutes_since_baseline >= ZERO_ROWS_GRACE_MINUTES
        and new_focus_sessions == 0
        and expected_rate >= 1.0
    ):
        status = "FAIL"
        reasons.append(
            f"ZERO new focus_sessions rows in {minutes_since_baseline:.0f} minutes, "
            f"but history says ~{expected_rate:.1f}/hour is normal for this hour. "
            "This is the exact signature of the prior outage."
        )
    elif rate_ratio is not None and rate_ratio < MIN_FOCUS_SESSIONS_RATE_RATIO and minutes_since_baseline >= 15:
        status = "FAIL"
        reasons.append(
            f"focus_sessions rate is {rate_ratio:.0%} of the historical baseline for this hour "
            f"(observed {observed_rate_per_hour:.1f}/hr vs expected {expected_rate:.1f}/hr)."
        )

    if new_tanga_tx == 0 and new_focus_sessions > 0:
        status = "FAIL" if status == "PASS" else status
        reasons.append(
            f"{new_focus_sessions} new focus_sessions rows but ZERO new tanga_transactions rows — "
            "the study write path is healthy but Tanga grants are not happening at all."
        )

    if mismatches:
        status = "WARN" if status == "PASS" else status
        reasons.append(
            f"{len(mismatches)}/{len(baseline_matching_ids)} previously-matching sampled users now have "
            "tanga_balance != ledger sum (newly diverged since baseline)."
        )

    result = {
        "checked_at": _now_utc().isoformat(),
        "minutes_since_baseline": round(minutes_since_baseline, 1),
        "new_focus_sessions": new_focus_sessions,
        "new_tanga_transactions": new_tanga_tx,
        "observed_focus_sessions_rate_per_hour": round(observed_rate_per_hour, 2),
        "expected_focus_sessions_rate_per_hour": round(expected_rate, 2),
        "rate_ratio": round(rate_ratio, 2) if rate_ratio is not None else None,
        "ledger_sample_mismatches": len(mismatches),
        "status": status,
        "reasons": reasons,
    }
    print(json.dumps(result, indent=2))

    if status == "FAIL":
        print("\n>>> ROLLBACK TRIGGER CONDITION MET. See DEPLOY_RUNBOOK.md. <<<", file=sys.stderr)
        return 2
    if status == "WARN":
        return 1
    return 0


def cmd_watch(args):
    end_time = time.monotonic() + args.minutes * 60
    exit_code = 0
    while time.monotonic() < end_time:
        code = cmd_check(args)
        exit_code = max(exit_code, code)
        if code == 2:
            print("\nFAIL status reached — stopping watch loop early.", file=sys.stderr)
            return code
        print(f"--- sleeping {args.interval} minutes ---\n", file=sys.stderr)
        time.sleep(args.interval * 60)
    return exit_code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p_baseline = sub.add_parser("baseline", help="Capture the pre-deploy baseline")
    p_baseline.add_argument("--out", help="Write baseline JSON to this file")
    p_baseline.set_defaults(func=cmd_baseline)

    p_check = sub.add_parser("check", help="Run one post-deploy check against a saved baseline")
    p_check.add_argument("--baseline", required=True, help="Path to baseline JSON from `baseline`")
    p_check.set_defaults(func=cmd_check)

    p_watch = sub.add_parser("watch", help="Run `check` repeatedly for the first N minutes post-deploy")
    p_watch.add_argument("--baseline", required=True)
    p_watch.add_argument("--minutes", type=int, default=60, help="Total watch duration (default 60)")
    p_watch.add_argument("--interval", type=int, default=5, help="Minutes between checks (default 5)")
    p_watch.set_defaults(func=cmd_watch)

    args = parser.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
