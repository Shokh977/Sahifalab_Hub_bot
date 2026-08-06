-- ═══════════════════════════════════════════════════════════════════════════════
-- 084_admin_suspension_reason.sql
-- Admin "block user" fix: POST /api/admin/users/{id}/suspend (admin.py) was
-- writing profiles.is_active / profiles.suspension_reason — neither column
-- exists on the real profiles table (that schema only has `status`, per
-- 004_roles_status.sql), and nothing in the codebase reads `is_active`, so
-- the suspend action was a silent no-op: the user stayed fully logged in,
-- since email_login() and every other gate check `profiles.status`, not
-- `is_active`. This migration adds `suspension_reason` so admin.py can start
-- writing profiles.status (already real) + this column (a genuine gap) instead.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
