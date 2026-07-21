"""Single source of truth for "is this telegram_id an admin?".

Historically this check was reimplemented per-endpoint-file: some looked only at
the ADMIN_TELEGRAM_IDS env var, some only at an AdminUser table, some at
Profile.role. A user promoted to admin via POST /auth/admin/users/{id}/role
(which sets Profile.role="admin") would pass some of those checks and silently
404 on others. is_role_admin() is meant to be OR'd into every existing check so
a role-based promotion works everywhere, without changing any endpoint's
existing behavior for already-recognized admins.
"""
from sqlalchemy.orm import Session

from app.models.models import Profile


def is_role_admin(db: Session, telegram_id: int) -> bool:
    profile = db.query(Profile).filter(Profile.telegram_id == telegram_id).first()
    return bool(profile and profile.role == "admin")
