"""Add role, status, photo_url, app_created_at, app_last_login to profiles

Revision ID: 004
Revises: 003
Create Date: 2026-04-01

Adds:
  - role      text  NOT NULL DEFAULT 'student'   (student | teacher | admin)
  - status    text  NOT NULL DEFAULT 'active'    (active | suspended | pending)
  - photo_url text  NULLABLE
  - app_created_at  timestamptz NULLABLE
  - app_last_login  timestamptz NULLABLE
"""
from alembic import op
import sqlalchemy as sa

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    # profiles lives in Supabase (Postgres), so we use execute() for raw SQL
    # when the table is managed outside Alembic models.
    op.execute("""
        ALTER TABLE public.profiles
          ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'student';
    """)
    op.execute("""
        ALTER TABLE public.profiles
          ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
    """)
    op.execute("""
        ALTER TABLE public.profiles
          ADD COLUMN IF NOT EXISTS photo_url text;
    """)
    op.execute("""
        ALTER TABLE public.profiles
          ADD COLUMN IF NOT EXISTS app_created_at timestamptz;
    """)
    op.execute("""
        ALTER TABLE public.profiles
          ADD COLUMN IF NOT EXISTS app_last_login timestamptz;
    """)
    op.execute("""
        ALTER TABLE public.profiles
          DROP CONSTRAINT IF EXISTS profiles_role_check;
        ALTER TABLE public.profiles
          ADD CONSTRAINT profiles_role_check
            CHECK (role IN ('student', 'teacher', 'admin'));
    """)
    op.execute("""
        ALTER TABLE public.profiles
          DROP CONSTRAINT IF EXISTS profiles_status_check;
        ALTER TABLE public.profiles
          ADD CONSTRAINT profiles_status_check
            CHECK (status IN ('active', 'suspended', 'pending'));
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_profiles_role   ON public.profiles (role);
        CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles (status);
    """)
    # Back-fill known admin
    op.execute("""
        UPDATE public.profiles
        SET role = 'admin'
        WHERE telegram_id = 807466591 AND role = 'student';
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_profiles_status;")
    op.execute("DROP INDEX IF EXISTS idx_profiles_role;")
    op.execute("ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;")
    op.execute("ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;")
    op.execute("ALTER TABLE public.profiles DROP COLUMN IF EXISTS app_last_login;")
    op.execute("ALTER TABLE public.profiles DROP COLUMN IF EXISTS app_created_at;")
    op.execute("ALTER TABLE public.profiles DROP COLUMN IF EXISTS photo_url;")
    op.execute("ALTER TABLE public.profiles DROP COLUMN IF EXISTS status;")
    op.execute("ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;")
