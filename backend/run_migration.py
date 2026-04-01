"""
run_migration.py — apply a SQL migration file to Supabase
via the Management API (uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).

Searches for .env in:  backend/.env  →  (project root)/.env

Usage (from repo root or backend/ folder):
    py backend/run_migration.py backend/migrations/006_teacher_profiles.sql
"""
import sys
import os
import pathlib
import asyncio
import httpx
from dotenv import load_dotenv

# ── Load .env — check backend/.env first, then root .env ─────────────────────
ROOT = pathlib.Path(__file__).parent
for candidate in [ROOT / ".env", ROOT.parent / ".env"]:
    if candidate.exists():
        load_dotenv(candidate)
        print(f"[✓] Loaded .env from {candidate}")
        break
else:
    print("[!] No .env file found — using system environment variables")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("[✗] SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set.")
    sys.exit(1)

# Extract project ref from URL: https://{ref}.supabase.co
project_ref = SUPABASE_URL.replace("https://", "").split(".")[0]
print(f"[✓] Project ref: {project_ref}")

# ── Resolve the migration file ────────────────────────────────────────────────
if len(sys.argv) < 2:
    print("Usage: py run_migration.py <path-to-migration.sql>")
    sys.exit(1)

sql_path = pathlib.Path(sys.argv[1])
if not sql_path.is_absolute():
    sql_path = pathlib.Path.cwd() / sql_path

if not sql_path.exists():
    print(f"[✗] File not found: {sql_path}")
    sys.exit(1)

sql = sql_path.read_text(encoding="utf-8")
print(f"[✓] Read migration: {sql_path.name} ({len(sql)} chars)")


# ── Call Supabase Management API ──────────────────────────────────────────────
async def run():
    mgmt_url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    print(f"\n[→] Sending SQL to Supabase Management API …")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(mgmt_url, json={"query": sql}, headers=headers)

    print(f"[←] HTTP {resp.status_code}")

    if resp.status_code in (200, 201):
        print("[✓] Migration applied successfully!")
        try:
            data = resp.json()
            if data:
                print(f"    Response: {str(data)[:200]}")
        except Exception:
            pass
        return True

    # Management API needs PAT — fall back to clear instructions
    print(f"[!] Management API returned {resp.status_code}: {resp.text[:300]}")
    print()
    print("─" * 60)
    print("  MANUAL FALLBACK: Run the SQL in the Supabase Dashboard")
    print("─" * 60)
    print(f"  1. Open: https://supabase.com/dashboard/project/{project_ref}/sql/new")
    print("  2. Paste the content of:")
    print(f"     {sql_path}")
    print("  3. Click  Run  (or press Ctrl+Enter)")
    print("─" * 60)
    return False


asyncio.run(run())
