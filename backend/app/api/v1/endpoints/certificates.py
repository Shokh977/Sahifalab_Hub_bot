"""
certificates.py — Public certificate sharing endpoint.

Routes (prefix /certificates):
  GET  /share/{share_token}   — public certificate page data (no auth needed)
  POST /share/{cert_id}/token — generate share_token for own certificate (auth required)
"""

import os
import secrets
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(tags=["certificates"])


def _opt_auth(authorization: Optional[str] = Header(None)) -> Optional[int]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return decode_token(authorization.split(" ", 1)[1])


def _req_auth(authorization: Optional[str] = Header(None)) -> int:
    tid = _opt_auth(authorization)
    if not tid:
        raise HTTPException(401, "Avtorizatsiya talab qilinadi")
    return tid


@router.get("/share/{share_token}")
def get_shared_certificate(
    share_token: str,
    db: Session = Depends(get_db),
):
    """
    Public endpoint — returns certificate data for the share page.
    No authentication required. Used by /certificate/:token frontend route.
    """
    row = db.execute(text("""
        SELECT
            cc.id,
            cc.certificate_id,
            cc.course_id,
            cc.student_id,
            cc.completed_lessons,
            cc.total_lessons,
            cc.issued_at,
            cc.share_token,
            cc.skill_tags,
            c.title   AS course_name,
            c.thumbnail_url AS course_thumbnail,
            p.first_name    AS student_name,
            p.username      AS student_username,
            p.photo_url     AS student_photo,
            COALESCE(p.level, 1)       AS student_level,
            COALESCE(p.total_xp, 0)   AS student_xp
        FROM course_certificates cc
        LEFT JOIN courses   c ON c.id = cc.course_id
        LEFT JOIN profiles  p ON p.telegram_id = cc.student_id
        WHERE cc.share_token = :token
        LIMIT 1
    """), {"token": share_token}).mappings().fetchone()

    if not row:
        raise HTTPException(404, "Sertifikat topilmadi")

    row = dict(row)

    # Compute score %
    cl = row.get("completed_lessons") or 0
    tl = row.get("total_lessons") or 0
    score_pct = round(cl / tl * 100) if tl else 100

    return {
        "share_token":      share_token,
        "certificate_id":   row["certificate_id"],
        "course_id":        row["course_id"],
        "course_name":      row["course_name"] or "",
        "course_thumbnail": row["course_thumbnail"],
        "student_name":     row["student_name"] or "Foydalanuvchi",
        "student_username": row["student_username"],
        "student_photo":    row["student_photo"],
        "student_level":    int(row["student_level"]),
        "student_xp":       int(row["student_xp"]),
        "score_pct":        score_pct,
        "completed_lessons": cl,
        "total_lessons":    tl,
        "issued_at":        row["issued_at"].isoformat() if row.get("issued_at") else None,
        "skill_tags":       row.get("skill_tags") or [],
    }


@router.post("/share/{cert_id}/token")
def ensure_share_token(
    cert_id:   int,
    db:        Session = Depends(get_db),
    caller_id: int = Depends(_req_auth),
):
    """
    Generate (or return existing) share_token for the caller's certificate.
    Called lazily when user first clicks the share button.
    """
    row = db.execute(text("""
        SELECT id, share_token, student_id
        FROM course_certificates
        WHERE id = :cid
    """), {"cid": cert_id}).mappings().fetchone()

    if not row:
        raise HTTPException(404, "Sertifikat topilmadi")
    if row["student_id"] != caller_id:
        raise HTTPException(403, "Bu sertifikat sizniki emas")

    if row["share_token"]:
        return {"share_token": row["share_token"]}

    # Generate a fresh 12-hex-char token
    token = secrets.token_hex(6)   # 6 bytes = 12 hex chars
    db.execute(text("""
        UPDATE course_certificates
        SET share_token = :token
        WHERE id = :cid
    """), {"token": token, "cid": cert_id})
    db.commit()

    return {"share_token": token}
