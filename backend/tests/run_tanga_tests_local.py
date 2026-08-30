"""
run_tanga_tests_local.py — stands up a throwaway embedded Postgres (via the
`pgserver` package — no Docker required), applies schema_bootstrap.sql +
the real 088/089 migrations, points DATABASE_URL at it, and runs the Tanga/
AI/freeze test suite with pytest. Prints real output; exits non-zero on any
failure.

This is the no-Docker fallback for local/dev machines. CI uses a real
Postgres service container instead (see .github/workflows/backend-tests.yml)
— this script exists so the suite is runnable on a machine that has neither
Docker nor a system Postgres install.

Usage:
    pip install -r requirements.txt pgserver pytest
    python tests/run_tanga_tests_local.py

Windows note: `zoneinfo` has no bundled tzdata on Windows (unlike Linux,
where this backend actually deploys) — if you see ZoneInfoNotFoundError,
`pip install tzdata` too. Not needed in CI/prod (Debian's python:3.11-slim
image resolves Asia/Tashkent fine).
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = BACKEND_DIR / "migrations"
TESTS_DIR = BACKEND_DIR / "tests"


def main() -> int:
    import pgserver

    pgdata = Path(tempfile.mkdtemp(prefix="sahifalab_test_pg_"))
    print(f"[run_tanga_tests_local] starting embedded Postgres at {pgdata}")
    db = pgserver.get_server(pgdata)
    try:
        database_url = db.get_uri()
        print(f"[run_tanga_tests_local] Postgres up: {database_url}")

        for sql_file in [
            TESTS_DIR / "schema_bootstrap.sql",
            MIGRATIONS_DIR / "082_focus_session_integrity.sql",
            MIGRATIONS_DIR / "083_taper_focus_xp.sql",
            MIGRATIONS_DIR / "088_tanga_currency.sql",
            MIGRATIONS_DIR / "089_ai_infrastructure.sql",
            MIGRATIONS_DIR / "090_daily_quiz.sql",
            MIGRATIONS_DIR / "092_tanga_economy_rework.sql",
            MIGRATIONS_DIR / "093_server_derived_day_bucket.sql",
            MIGRATIONS_DIR / "094_daily_quiz_auto_publish.sql",
        ]:
            print(f"[run_tanga_tests_local] applying {sql_file.name}")
            sql = sql_file.read_text(encoding="utf-8")
            out = db.psql(sql)
            print(out)

        env = os.environ.copy()
        env["DATABASE_URL"] = database_url

        test_files = [
            "tests/test_tanga_service.py",
            "tests/test_ai_limiter.py",
            "tests/test_tanga_reconciliation.py",
            "tests/test_price_config_guard.py",
            "tests/test_freeze_endpoint_idempotency.py",
            "tests/test_daily_quiz_service.py",
            "tests/test_tanga_economy_rework.py",
            "tests/test_day_bucket_resolution.py",
            # Pre-existing, pure-unit (no DB needed) — folded in because this
            # is the repo's first CI workflow ever; free extra coverage.
            "tests/test_freeze_service.py",
            "tests/test_streak_state.py",
            "tests/test_user_time.py",
        ]
        cmd = [sys.executable, "-m", "pytest", "-v", "-rA", *test_files]
        print(f"[run_tanga_tests_local] running: {' '.join(cmd)}")
        result = subprocess.run(cmd, cwd=str(BACKEND_DIR), env=env)
        return result.returncode
    finally:
        print("[run_tanga_tests_local] tearing down embedded Postgres")
        db.cleanup()


if __name__ == "__main__":
    sys.exit(main())
