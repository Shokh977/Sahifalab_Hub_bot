"""
admin_reports.py — Admin moderation queue for post/user reports (content_reports).

Mounted at /api/admin/reports. Admin-only (verify_admin, reused from admin.py).

Before this file existed, POST /api/v1/social/reports (social_routes.py) wrote
into content_reports correctly, but nothing anywhere ever read that table back
— no admin endpoint, no admin UI page. Reports submitted via "shikoyat qilish"
on a post or a profile were silently invisible to moderators. This mirrors
admin_decks.py's existing reports-queue pattern (GET /reports + POST actions)
applied to content_reports instead of deck_reports.

GET  /            — pending reports, newest first, with reporter + target summaries
POST /{id}/resolve — mark reviewed (moderator took action elsewhere, e.g. removed the post)
POST /{id}/dismiss — mark dismissed (no action needed)
"""
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.v1.endpoints.admin import verify_admin
from app.models.admin_models import AdminUser

router = APIRouter()

_STATUSES = {"pending", "reviewed", "dismissed"}


@router.get("")
async def list_reports(
    status: str = Query("pending"),
    page:   int = Query(1, ge=1),
    limit:  int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    if status not in _STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Choose from: {sorted(_STATUSES)}")

    offset = (page - 1) * limit
    rows = db.execute(
        text("""
            SELECT rep.id, rep.target_type, rep.target_id, rep.reason, rep.details,
                   rep.status, rep.created_at, rep.reviewed_by, rep.reviewed_at,
                   p.telegram_id AS reporter_id, p.first_name AS reporter_name
            FROM content_reports rep
            LEFT JOIN profiles p ON p.telegram_id = rep.reporter_id
            WHERE rep.status = :status
            ORDER BY rep.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"status": status, "limit": limit, "offset": offset},
    ).fetchall()

    total = db.execute(
        text("SELECT COUNT(*) FROM content_reports WHERE status = :status"),
        {"status": status},
    ).scalar()

    # Batch-fetch target summaries — a post row for target_type='post',
    # a profile row for target_type='user' — one query per kind, not per row.
    post_ids = [int(r.target_id) for r in rows if r.target_type == "post"]
    user_ids = [int(r.target_id) for r in rows if r.target_type == "user"]

    posts_by_id: dict[int, dict] = {}
    if post_ids:
        post_rows = db.execute(
            text("""
                SELECT po.id, po.content, po.author_id, pr.first_name AS author_name
                FROM posts po
                LEFT JOIN profiles pr ON pr.telegram_id = po.author_id
                WHERE po.id = ANY(:ids)
            """),
            {"ids": post_ids},
        ).fetchall()
        posts_by_id = {
            int(p.id): {
                "id":      int(p.id),
                "content": (p.content or "")[:280],
                "author":  {"id": int(p.author_id), "name": p.author_name or ""} if p.author_id is not None else None,
            }
            for p in post_rows
        }

    users_by_id: dict[int, dict] = {}
    if user_ids:
        user_rows = db.execute(
            text("SELECT telegram_id, first_name, photo_url FROM profiles WHERE telegram_id = ANY(:ids)"),
            {"ids": user_ids},
        ).fetchall()
        users_by_id = {
            int(u.telegram_id): {"id": int(u.telegram_id), "name": u.first_name or "", "photo_url": u.photo_url}
            for u in user_rows
        }

    def _target(r) -> Optional[dict]:
        tid = int(r.target_id)
        if r.target_type == "post":
            return posts_by_id.get(tid) or {"id": tid, "content": None, "author": None, "deleted": True}
        return users_by_id.get(tid) or {"id": tid, "name": None, "photo_url": None, "deleted": True}

    items = [
        {
            "id":          int(r.id),
            "target_type": r.target_type,
            "target_id":   int(r.target_id),
            "reason":      r.reason,
            "details":     r.details,
            "status":      r.status,
            "created_at":  r.created_at.isoformat() if r.created_at else None,
            "reviewed_by": int(r.reviewed_by) if r.reviewed_by is not None else None,
            "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
            "reporter":    {"id": int(r.reporter_id), "name": r.reporter_name or ""} if r.reporter_id is not None else None,
            "target":      _target(r),
        }
        for r in rows
    ]

    return {"reports": items, "total": int(total or 0), "page": page, "limit": limit}


def _set_status(db: Session, report_id: int, new_status: str, admin: AdminUser) -> None:
    result = db.execute(
        text("""
            UPDATE content_reports SET
                status = :status, reviewed_by = :admin, reviewed_at = :now
            WHERE id = :id AND status = 'pending'
        """),
        {"id": report_id, "status": new_status, "admin": admin.telegram_id, "now": datetime.now(UTC)},
    )
    if result.rowcount == 0:
        existing = db.execute(text("SELECT id FROM content_reports WHERE id = :id"), {"id": report_id}).fetchone()
        db.rollback()
        if not existing:
            raise HTTPException(status_code=404, detail="Report not found")
        raise HTTPException(status_code=400, detail="Report already reviewed")
    db.commit()


@router.post("/{report_id}/resolve")
async def resolve_report(
    report_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """Moderator took action (e.g. removed the post, warned/blocked the user) elsewhere."""
    _set_status(db, report_id, "reviewed", admin)
    return {"ok": True}


@router.post("/{report_id}/dismiss")
async def dismiss_report(
    report_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """No action needed."""
    _set_status(db, report_id, "dismissed", admin)
    return {"ok": True}
