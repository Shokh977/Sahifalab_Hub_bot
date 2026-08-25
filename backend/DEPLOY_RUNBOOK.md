# Deploy runbook — Tanga currency + AI feature layer (088/089)

Context: this backend suffered a 3-day silent outage in which `focus_sessions`
stopped receiving rows entirely, with no error and no log line. Root cause
was a raw-SQL driver quirk (`pg8000` chokes on a bare `%` in `text()` SQL)
inside `record_study_activity()` — one of the 13 call sites this change also
touches. This runbook exists so the same class of failure is caught in
minutes, not days.

**Before you deploy, all of these must be true:**
- [ ] `python tests/run_tanga_tests_local.py` (or CI — `.github/workflows/backend-tests.yml`) passes against a real Postgres. **53/53** as of this writing (23 Tanga/AI/freeze-idempotency + 30 pre-existing freeze-service/streak-state/user-time unit tests, folded into the same run since this is the repo's first CI workflow).
- [ ] `TANGA_MIRROR_MODE` (`app_config.tanga_mirror_mode`) is `"A"` — confirm with `SELECT value FROM app_config WHERE key = 'tanga_mirror_mode'`. Phase B is a later, separate decision.
- [ ] `CRON_SECRET` is set in the deploy environment (the reconciliation job and volume-check alert are no-ops without it).
- [ ] `ADMIN_TELEGRAM_IDS` and `TELEGRAM_BOT_TOKEN` are set — this is the paging channel for the standing volume alert (see below). Without them, an alert only logs at CRITICAL level and nobody is paged.
- [ ] `GEMINI_API_KEY` is set on Railway (billing/Tier 1 confirmed — Uzbek quality gate has passed on both text and multimodal input).
- [ ] Real prices are applied (`explanation`:10, `flashcard_gen`:25, `tutor_session`:10, 3 free/day, 20 hard cap) — no longer placeholders.
- [ ] **New**: `app.main.startup_event` now hard-fails boot (outside `DEBUG`) if `app_config.ai_dual_gate.prices` doesn't exactly match the feature set `app.services.ai.limiter._FEATURE_TO_REASON` expects — this is the guard against the price-key-mismatch bug that shipped silently twice already. If the app refuses to start with an `ai_dual_gate.prices is misconfigured` error, that's this check working as intended — fix the config, don't bypass it.

---

## 1. Deploy window

Target audience is mostly `Asia/Tashkent` (UTC+5) and `Asia/Seoul` (UTC+9).
Solving for a window that is late-night/pre-dawn in **both**:

| UTC | Tashkent | Seoul |
|---|---|---|
| 19:00 | 00:00 | 04:00 |
| 21:00 | 02:00 | 06:00 |

**Deploy at 19:00–21:00 UTC, target 19:30 UTC** (00:30 Tashkent, 04:30 Seoul)
— both cities are in their lowest-traffic window. This is derived from the
UTC offsets, not measured traffic data; if you have real hourly traffic
analytics, prefer that over this calculation.

## 1b. Known-good baseline (captured 2026-08-25, outage resolved)

`focus_sessions` at `max_id` 1936 (was 1147 at the outage cliff), 49 rows in
the last 24h, 5 in the last hour, latest `session_date` 2026-08-25. Write
path confirmed healthy. Deployment baseline for `deploy_verify.py`:
**~5 sessions/hour, ~49/day, historical band 30–112/day.** Re-run
`deploy_verify.py baseline` immediately before the actual deploy — this
number is a sanity check for "does the number I'm about to compare against
look like a normal day," not a substitute for a fresh capture.

## 2. Pre-deploy baseline

```
export DATABASE_URL=postgresql://...   # production, read access is enough
python scripts/deploy_verify.py baseline --out baseline.json
```

Read the output. If `ledger_sample_mismatches_at_baseline` is non-zero,
that's **pre-existing** drift — investigate it separately, but it does not
block this deploy (it didn't get worse because of this change).

## 3. Deploy

Deploy through your normal Railway flow. Do not skip the baseline step
above — `check`/`watch` below are meaningless without it.

## 4. Post-deploy verification (first hour)

```
python scripts/deploy_verify.py watch --baseline baseline.json --minutes 60 --interval 5
```

This checks, every 5 minutes for an hour:
- New `focus_sessions` rows are appearing at a rate consistent with the
  historical rate for this hour-of-day (averaged over the last 7 days).
- New `tanga_transactions` rows are appearing (specifically: if
  `focus_sessions` grew but `tanga_transactions` didn't, that's flagged —
  it means the study write path is healthy but Tanga grants aren't happening).
- `tanga_balance == SUM(tanga_transactions.delta)` holds for the same
  sampled users captured at baseline (only flags **newly** broken
  invariants, not pre-existing drift already reported in step 2).

Exit codes: `0` = PASS, `1` = WARN (investigate, don't panic), `2` = FAIL
(rollback trigger — see below). The script prints its reasoning every time;
read it, don't just check the exit code.

**What this script does NOT check** — do this manually, in parallel:
- **4xx/5xx rate on endpoints the old (already-shipped) client calls** —
  specifically `GET /api/streaks/detail`, `POST /api/streaks/freeze/purchase`,
  `POST /api/focus/complete`, `GET /api/auth/me`. This backend has no
  request-level metrics table this script can query; check Railway's
  dashboard → your service → Metrics/Observability tab for HTTP status
  code rates, or your logging provider if one is wired up. A spike here
  with `deploy_verify.py` still showing PASS is itself a signal — it means
  requests are failing before they'd ever write a `focus_sessions` row.

## 5. Rollback trigger — decide now, not during an incident

**Roll back immediately if any of these are true, no judgment call needed:**

1. `deploy_verify.py check`/`watch` returns exit code `2` (FAIL) at any point.
   Concretely: **zero new `focus_sessions` rows within 30 minutes** during
   an hour the 7-day history says is normally active, or the observed rate
   drops below 50% of the historical rate for that hour after 15+ minutes.
2. A visible spike in 4xx/5xx on the old-client endpoints listed above.
3. `focus_sessions` growing but `tanga_transactions` staying flat for more
   than 15 minutes (Tanga grants silently not happening — the reconciliation
   job will eventually catch these, but a live total outage of grants means
   something is structurally broken, not just occasionally failing).

**If none of the above — do not roll back on a single WARN.** A WARN status
(e.g. one sampled user's ledger drifted) means "look at this," not "revert."

### Rollback command

**Recommended: redeploy the previous application version, leave the schema
in place.** The 088/089 schema is purely additive (new columns/tables); the
previous app code never references any of it, so this is instant, requires
no DB write, and loses zero data.

- Railway dashboard: Deployments tab → select the deployment immediately
  before this one → **Redeploy**.
- Railway CLI: `railway redeploy <previous-deployment-id>` (get the id from
  `railway status` or the dashboard). Confirm the exact subcommand against
  your installed Railway CLI version — verify with `railway --help` before
  running this during an incident, not for the first time during one.

**Do NOT run `migrations/rollback/088_089_DOWN.sql` as your rollback plan.**
It drops the `tanga_transactions` ledger and `ai_usage_log` permanently.
See the warning header in that file. It exists only for the rare case you
specifically need the schema gone, not as an incident response tool.

### Migration reversibility — the honest answer

Structurally, yes: 088/089 only `ADD COLUMN`/`CREATE TABLE`, and
`migrations/rollback/088_089_DOWN.sql` will cleanly reverse them at the
schema level. **But reversing the schema after real traffic has flowed
through it destroys the ledger data for that window** — every spend/grant
that happened goes with it, and `total_xp` is not recalculated to
compensate any Tanga that was spent. That's why the recommended rollback is
an app redeploy, not a migration reversal — the schema being additive means
you don't need to reverse it to be safe.

## 6. Standing alert

`POST /api/cron/focus-sessions-volume-check`, scheduled daily at 07:00 UTC
(`app/main.py::_start_cron_scheduler`), compares yesterday's `focus_sessions`
count to the day before. A drop of more than 50% pages every
`ADMIN_TELEGRAM_IDS` via direct Telegram message (`app/services/
volume_alert_service.py`) — same channel already used for moderation and
payout alerts in this codebase. If `ADMIN_TELEGRAM_IDS`/`TELEGRAM_BOT_TOKEN`
aren't set, it only logs at CRITICAL level and **nobody is paged** — this is
listed in the pre-deploy checklist above for exactly that reason.

This is the fix for "the previous outage ran undetected for three days":
now something is watching every single day, not just for the first hour
after a deploy.

## 7. Reconciliation job

`POST /api/cron/tanga-reconciliation`, scheduled every 15 minutes, retries
Tanga grants for `focus_sessions` rows whose live grant failed after the
session already committed. Idempotent on `study_activity:{session_id}` — it
can never double-grant, even if it races a live in-flight request. See
`app/services/tanga_reconciliation.py`. Verified via
`tests/test_tanga_reconciliation.py` (finds the orphan, grants once, second
run is a no-op).
