"""
legacy_xp_migration.py — One-time verification & migration runner.

Run this ONCE after deploying 038_xp_gamification.sql to Supabase to
confirm the migration applied correctly and print a summary report.

What it verifies:
  1. calculate_level_from_xp() function exists and gives correct results
  2. add_xp() function exists
  3. xp_logs table exists
  4. user_badges table exists
  5. total_focus_minutes backfill was applied
  6. Level recalculation succeeded (no one has level 0 or None)
  7. Deep Work Master badges were granted to qualifying users

Usage:
  cd "d:\\My Data\\Coding\\SAHIFALAB\\Telegram App"
  python backend/migrations/legacy_xp_migration.py

Requires: DATABASE_URL environment variable (Postgres connection string)
  e.g.  DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
"""

import os
import sys

# ── Load .env if python-dotenv is available ───────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv("backend/.env")
except ImportError:
    pass

DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")

if not DATABASE_URL:
    print("❌  DATABASE_URL not set. Export it before running this script.")
    print("    Example: $env:DATABASE_URL = 'postgresql://postgres:pass@host:5432/postgres'")
    sys.exit(1)

try:
    import psycopg2
except ImportError:
    print("❌  psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)


# ── Level formula mirror (must match SQL calculate_level_from_xp) ─────────────

def calculate_level_from_xp(xp: int) -> int:
    lv = 1
    while (100.0 * (lv + 1) ** 2.5) <= xp:
        lv += 1
        if lv >= 27:
            break
    return lv


# ── Test vectors (expected values per spec) ───────────────────────────────────

FORMULA_TESTS = [
    (0,       1),
    (100,     1),
    (565,     1),
    (566,     2),
    (31_623,  10),
    (31_622,  9),
    (378_845, 27),
    (999_999, 27),   # capped at 27
]


def run():
    print("═" * 60)
    print("  038_xp_gamification — Legacy Migration Verification")
    print("═" * 60)

    # ── 1. Verify local formula ────────────────────────────────────────────
    print("\n[1] Formula sanity checks …")
    all_ok = True
    for xp, expected in FORMULA_TESTS:
        got = calculate_level_from_xp(xp)
        ok = got == expected
        if not ok:
            all_ok = False
        mark = "✅" if ok else "❌"
        print(f"    {mark}  xp={xp:>8,}  expected={expected:>2}  got={got:>2}")
    if all_ok:
        print("    Local formula matches spec ✓")

    # ── 2. Connect to Postgres ─────────────────────────────────────────────
    print(f"\n[2] Connecting to Postgres …")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur  = conn.cursor()
        print("    Connected ✓")
    except Exception as e:
        print(f"    ❌ Connection failed: {e}")
        sys.exit(1)

    # ── 3. Verify SQL function: calculate_level_from_xp ───────────────────
    print("\n[3] Verifying calculate_level_from_xp() in Postgres …")
    cur.execute("""
        SELECT routine_name FROM information_schema.routines
        WHERE routine_name = 'calculate_level_from_xp'
          AND routine_type = 'FUNCTION'
    """)
    if cur.fetchone():
        # Run test vector via SQL
        errors = []
        for xp, expected in FORMULA_TESTS:
            cur.execute("SELECT calculate_level_from_xp(%s)", (xp,))
            got = cur.fetchone()[0]
            if got != expected:
                errors.append(f"xp={xp} expected={expected} got={got}")
        if errors:
            print(f"    ❌ Mismatch(es): {errors}")
        else:
            print("    ✅ calculate_level_from_xp() matches all test vectors")
    else:
        print("    ❌ Function NOT FOUND — run 038_xp_gamification.sql first!")

    # ── 4. Verify SQL function: add_xp ────────────────────────────────────
    print("\n[4] Verifying add_xp() in Postgres …")
    cur.execute("""
        SELECT routine_name FROM information_schema.routines
        WHERE routine_name = 'add_xp'
          AND routine_type = 'FUNCTION'
    """)
    print("    ✅ add_xp() exists" if cur.fetchone()
          else "    ❌ add_xp() NOT FOUND")

    # ── 5. Verify tables ──────────────────────────────────────────────────
    print("\n[5] Verifying new tables …")
    for table in ("xp_logs", "user_badges"):
        cur.execute(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = %s)",
            (table,)
        )
        exists = cur.fetchone()[0]
        print(f"    {'✅' if exists else '❌'} {table}")

    # ── 6. Profile column check ────────────────────────────────────────────
    print("\n[6] Verifying new columns on profiles …")
    for col in ("total_focus_minutes", "daily_quiz_xp", "daily_quiz_xp_reset_at"):
        cur.execute(
            "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name=%s)",
            (col,)
        )
        exists = cur.fetchone()[0]
        print(f"    {'✅' if exists else '❌'} profiles.{col}")

    # ── 7. Level recalculation summary ────────────────────────────────────
    print("\n[7] Level distribution (post-migration) …")
    cur.execute("""
        SELECT level, COUNT(*) AS cnt
        FROM   profiles
        GROUP BY level
        ORDER BY level
    """)
    rows = cur.fetchall()
    if not rows:
        print("    (no profiles found)")
    else:
        for lv, cnt in rows:
            bar = "█" * min(cnt, 40)
            print(f"    Lv {lv:>2}: {bar} ({cnt:,})")

    cur.execute("SELECT COUNT(*) FROM profiles WHERE level IS NULL OR level < 1")
    bad = cur.fetchone()[0]
    print(f"\n    {'✅' if bad == 0 else f'❌ {bad} profiles with invalid level'}")

    # ── 8. Deep Work Master badge summary ─────────────────────────────────
    print("\n[8] Deep Work Master badge …")
    cur.execute("SELECT COUNT(*) FROM user_badges WHERE badge_key = 'deep_work_master'")
    granted = cur.fetchone()[0]
    cur.execute("""
        SELECT COUNT(*) FROM profiles
        WHERE  total_focus_minutes >= 1500
            OR COALESCE(focus_seconds, 0) >= 90000
    """)
    qualifying = cur.fetchone()[0]
    print(f"    Qualifying users : {qualifying:,}")
    print(f"    Badges granted   : {granted:,}")
    if qualifying > 0 and granted < qualifying:
        print("    ⚠️  Some qualifying users are missing the badge — re-run the SQL INSERT.")
    elif granted >= qualifying and qualifying > 0:
        print("    ✅ All qualifying users have the badge")

    # ── 9. XP sanity check ────────────────────────────────────────────────
    print("\n[9] XP vs level consistency check (spot-check 10 rows) …")
    cur.execute("""
        SELECT telegram_id, total_xp, level,
               calculate_level_from_xp(COALESCE(total_xp, 0)) AS expected_level
        FROM   profiles
        WHERE  calculate_level_from_xp(COALESCE(total_xp, 0)) != COALESCE(level, 1)
        LIMIT  10
    """)
    mismatches = cur.fetchall()
    if mismatches:
        print(f"    ⚠️  {len(mismatches)} level mismatch(es) found:")
        for uid, xp, lv, expected_lv in mismatches:
            print(f"       uid={uid}  xp={xp:,}  level={lv}  expected={expected_lv}")
        print("    Re-run: UPDATE profiles SET level = calculate_level_from_xp(COALESCE(total_xp, 0));")
    else:
        print("    ✅ All levels match calculate_level_from_xp()")

    cur.close()
    conn.close()
    print("\n" + "═" * 60)
    print("  Migration verification complete.")
    print("═" * 60 + "\n")


if __name__ == "__main__":
    run()
