"""
jobs.py — Job listings API.

Routes (prefix /jobs):
  GET  /                    — list active jobs (paginated, filterable)
  GET  /mine                — own job postings (auth required)
  GET  /matched             — jobs matched to caller's skills, sorted by match %
  GET  /{job_id}            — single job detail
  POST /                    — create job posting (auth required)
  PATCH /{job_id}           — update own job posting
  DELETE /{job_id}          — deactivate own job posting (soft delete)

Applications:
  GET  /{job_id}/applicants — list applicants (poster only)
  POST /{job_id}/apply      — apply to job
  PATCH /{job_id}/applicants/{app_id} — update applicant status (poster only)

Skills autocomplete:
  GET  /skills/autocomplete?q=… — top matching skill names from DB
"""

import json
import logging
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.social_models import Skill
from app.services.auth_service import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(tags=["jobs"])

# ── Auth ──────────────────────────────────────────────────────────────────────

def _opt_auth(authorization: Optional[str] = Header(None)) -> Optional[int]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return decode_token(authorization.split(" ", 1)[1])


def _req_auth(authorization: Optional[str] = Header(None)) -> int:
    tid = _opt_auth(authorization)
    if not tid:
        raise HTTPException(401, "Avtorizatsiya talab qilinadi")
    return tid


# ── Schemas ───────────────────────────────────────────────────────────────────

class JobCreate(BaseModel):
    title:           str
    company_name:    str
    description:     str
    location:        Optional[str] = None
    job_type:        str = "full_time"
    salary_min:      Optional[int] = None
    salary_max:      Optional[int] = None
    required_skills: list[str] = []
    expires_at:      Optional[str] = None   # ISO date string


class JobUpdate(BaseModel):
    title:           Optional[str] = None
    company_name:    Optional[str] = None
    description:     Optional[str] = None
    location:        Optional[str] = None
    job_type:        Optional[str] = None
    salary_min:      Optional[int] = None
    salary_max:      Optional[int] = None
    required_skills: Optional[list[str]] = None
    is_active:       Optional[bool] = None
    expires_at:      Optional[str] = None


class ApplicationCreate(BaseModel):
    message: Optional[str] = None


class ApplicationUpdate(BaseModel):
    status: str   # viewed | shortlisted | rejected


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_skills(db: Session, user_id: int) -> set[str]:
    """Return set of lower-cased skill names for a user."""
    rows = (
        db.query(Skill.skill_name)
        .filter(Skill.user_id == user_id)
        .all()
    )
    return {r[0].lower() for r in rows}


def _match_pct(job_skills: list[str], user_skills: set[str]) -> int:
    if not job_skills:
        return 100
    matched = sum(1 for s in job_skills if s.lower() in user_skills)
    return round(matched / len(job_skills) * 100)


def _enrich_job(row: dict, user_skills: set[str]) -> dict:
    req = row.get("required_skills") or []
    if isinstance(req, str):
        try:
            req = json.loads(req)
        except Exception:
            req = []
    skill_matches = [
        {"name": s, "has": s.lower() in user_skills}
        for s in req
    ]
    return {
        **row,
        "required_skills": req,
        "skill_matches": skill_matches,
        "match_pct": _match_pct(req, user_skills),
    }


# ══════════════════════════════════════════════════════════════════════════════
# LIST / DETAIL
# ══════════════════════════════════════════════════════════════════════════════

@router.get("")
def list_jobs(
    q:          Optional[str] = Query(None),
    location:   Optional[str] = Query(None),
    job_type:   Optional[str] = Query(None),
    skill:      Optional[str] = Query(None),
    page:       int = Query(1, ge=1),
    page_size:  int = Query(20, ge=1, le=50),
    db:         Session = Depends(get_db),
    viewer_id:  Optional[int] = Depends(_opt_auth),
):
    """List active job postings with optional filters and skill-match overlay."""
    offset = (page - 1) * page_size

    filters = ["j.is_active = TRUE"]
    params: dict = {"limit": page_size, "offset": offset}

    if q:
        filters.append("(j.title ILIKE :q OR j.company_name ILIKE :q OR j.description ILIKE :q)")
        params["q"] = f"%{q}%"
    if location:
        filters.append("j.location ILIKE :loc")
        params["loc"] = f"%{location}%"
    if job_type:
        filters.append("j.job_type = :jtype")
        params["jtype"] = job_type
    if skill:
        filters.append("j.required_skills @> :skill_json::jsonb")
        params["skill_json"] = json.dumps([skill])

    where = " AND ".join(filters)

    rows = db.execute(text(f"""
        SELECT j.id, j.title, j.company_name, j.location, j.job_type,
               j.salary_min, j.salary_max, j.salary_currency,
               j.required_skills, j.created_at, j.expires_at,
               j.posted_by,
               p.first_name AS poster_name,
               p.photo_url  AS poster_photo,
               p.site_username AS poster_username,
               (SELECT COUNT(*) FROM job_applications a WHERE a.job_id = j.id) AS applicants_count
        FROM jobs j
        LEFT JOIN profiles p ON p.telegram_id = j.posted_by
        WHERE {where}
        ORDER BY j.created_at DESC
        LIMIT :limit OFFSET :offset
    """), params).mappings().fetchall()

    user_skills = _get_user_skills(db, viewer_id) if viewer_id else set()

    total_row = db.execute(text(f"""
        SELECT COUNT(*) FROM jobs j WHERE {where}
    """), {k: v for k, v in params.items() if k not in ("limit", "offset")}).scalar()

    return {
        "jobs": [_enrich_job(dict(r), user_skills) for r in rows],
        "total": int(total_row or 0),
        "page": page,
        "page_size": page_size,
    }


@router.get("/mine")
def my_jobs(
    page:      int = Query(1, ge=1),
    db:        Session = Depends(get_db),
    caller_id: int = Depends(_req_auth),
):
    """Caller's own job postings (active + inactive)."""
    offset = (page - 1) * 20
    rows = db.execute(text("""
        SELECT j.id, j.title, j.company_name, j.location, j.job_type,
               j.salary_min, j.salary_max, j.is_active, j.created_at, j.expires_at,
               j.required_skills,
               (SELECT COUNT(*) FROM job_applications a WHERE a.job_id = j.id) AS applicants_count
        FROM jobs j
        WHERE j.posted_by = :uid
        ORDER BY j.created_at DESC
        LIMIT 20 OFFSET :offset
    """), {"uid": caller_id, "offset": offset}).mappings().fetchall()

    return [dict(r) for r in rows]


@router.get("/matched")
def matched_jobs(
    page:      int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db:        Session = Depends(get_db),
    caller_id: int = Depends(_req_auth),
):
    """Jobs pre-filtered and sorted by match % to caller's skills."""
    user_skills = _get_user_skills(db, caller_id)

    if not user_skills:
        return {"jobs": [], "total": 0, "message": "Ko'nikmalar qo'shing — mos ish o'rinlari topilsin!"}

    # Build a SQL array literal for the overlap check
    skills_arr = json.dumps(list(user_skills))

    rows = db.execute(text("""
        SELECT j.id, j.title, j.company_name, j.location, j.job_type,
               j.salary_min, j.salary_max, j.salary_currency,
               j.required_skills, j.created_at, j.expires_at,
               j.posted_by,
               p.first_name AS poster_name,
               p.photo_url  AS poster_photo,
               p.site_username AS poster_username,
               (SELECT COUNT(*) FROM job_applications a WHERE a.job_id = j.id) AS applicants_count
        FROM jobs j
        LEFT JOIN profiles p ON p.telegram_id = j.posted_by
        WHERE j.is_active = TRUE
          AND j.required_skills != '[]'::jsonb
        ORDER BY j.created_at DESC
        LIMIT 200
    """)).mappings().fetchall()

    enriched = [_enrich_job(dict(r), user_skills) for r in rows]
    # Only return jobs with >= 1 matching skill, sorted by match %
    matched = [j for j in enriched if j["match_pct"] > 0]
    matched.sort(key=lambda x: x["match_pct"], reverse=True)

    offset = (page - 1) * page_size
    return {
        "jobs": matched[offset: offset + page_size],
        "total": len(matched),
        "page": page,
        "page_size": page_size,
    }


@router.get("/skills/autocomplete")
def autocomplete_skills(
    q:  str = Query("", min_length=1),
    db: Session = Depends(get_db),
):
    """Return top-20 distinct skill names matching the query prefix."""
    rows = db.execute(text("""
        SELECT DISTINCT skill_name
        FROM skills
        WHERE lower(skill_name) LIKE lower(:q) || '%'
        ORDER BY skill_name
        LIMIT 20
    """), {"q": q}).fetchall()
    return [r[0] for r in rows]


@router.get("/{job_id}")
def get_job(
    job_id:    int,
    db:        Session = Depends(get_db),
    viewer_id: Optional[int] = Depends(_opt_auth),
):
    row = db.execute(text("""
        SELECT j.id, j.title, j.company_name, j.description, j.location, j.job_type,
               j.salary_min, j.salary_max, j.salary_currency,
               j.required_skills, j.created_at, j.expires_at, j.is_active,
               j.posted_by,
               p.first_name AS poster_name,
               p.photo_url  AS poster_photo,
               p.site_username AS poster_username,
               (SELECT COUNT(*) FROM job_applications a WHERE a.job_id = j.id) AS applicants_count,
               (SELECT status FROM job_applications
                WHERE job_id = j.id AND applicant_id = :vid LIMIT 1) AS my_application_status
        FROM jobs j
        LEFT JOIN profiles p ON p.telegram_id = j.posted_by
        WHERE j.id = :jid
    """), {"jid": job_id, "vid": viewer_id or 0}).mappings().fetchone()

    if not row:
        raise HTTPException(404, "Ish o'rni topilmadi")

    user_skills = _get_user_skills(db, viewer_id) if viewer_id else set()
    return _enrich_job(dict(row), user_skills)


# ══════════════════════════════════════════════════════════════════════════════
# CREATE / UPDATE / DELETE
# ══════════════════════════════════════════════════════════════════════════════

@router.post("")
def create_job(
    body:      JobCreate,
    db:        Session = Depends(get_db),
    caller_id: int = Depends(_req_auth),
):
    """Create a new job posting."""
    if body.job_type not in ("full_time", "part_time", "remote", "freelance", "internship"):
        raise HTTPException(400, "Noto'g'ri ish turi")

    expires_at = None
    if body.expires_at:
        try:
            expires_at = datetime.fromisoformat(body.expires_at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(400, "Noto'g'ri expires_at formati (ISO 8601 talab qilinadi)")

    row = db.execute(text("""
        INSERT INTO jobs
            (posted_by, title, company_name, description, location, job_type,
             salary_min, salary_max, required_skills, expires_at)
        VALUES
            (:uid, :title, :company, :desc, :loc, :jtype,
             :smin, :smax, :skills::jsonb, :exp)
        RETURNING id, title, company_name, location, job_type,
                  salary_min, salary_max, required_skills, created_at
    """), {
        "uid":     caller_id,
        "title":   body.title.strip(),
        "company": body.company_name.strip(),
        "desc":    body.description.strip(),
        "loc":     body.location,
        "jtype":   body.job_type,
        "smin":    body.salary_min,
        "smax":    body.salary_max,
        "skills":  json.dumps(body.required_skills),
        "exp":     expires_at,
    }).mappings().fetchone()

    db.commit()

    # Log activity
    try:
        from app.services.integration_service import log_activity
        log_activity(db, caller_id, "job_posted",
                     reference_id=str(row["id"]), reference_type="job",
                     metadata={"title": body.title})
    except Exception:
        pass

    return dict(row)


@router.patch("/{job_id}")
def update_job(
    job_id:    int,
    body:      JobUpdate,
    db:        Session = Depends(get_db),
    caller_id: int = Depends(_req_auth),
):
    existing = db.execute(text(
        "SELECT posted_by FROM jobs WHERE id = :jid"
    ), {"jid": job_id}).fetchone()
    if not existing:
        raise HTTPException(404, "Ish o'rni topilmadi")
    if existing[0] != caller_id:
        raise HTTPException(403, "Bu e'lon sizniki emas")

    fields = body.model_dump(exclude_none=True)
    if not fields:
        return {"ok": True}

    set_clauses = []
    params: dict = {"jid": job_id}

    for key, val in fields.items():
        if key == "required_skills":
            set_clauses.append("required_skills = :skills::jsonb")
            params["skills"] = json.dumps(val)
        elif key == "expires_at" and val:
            set_clauses.append("expires_at = :exp")
            try:
                params["exp"] = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
            except ValueError:
                raise HTTPException(400, "Noto'g'ri expires_at formati")
        else:
            set_clauses.append(f"{key} = :{key}")
            params[key] = val

    db.execute(text(f"""
        UPDATE jobs SET {', '.join(set_clauses)} WHERE id = :jid
    """), params)
    db.commit()
    return {"ok": True}


@router.delete("/{job_id}")
def delete_job(
    job_id:    int,
    db:        Session = Depends(get_db),
    caller_id: int = Depends(_req_auth),
):
    existing = db.execute(text(
        "SELECT posted_by FROM jobs WHERE id = :jid"
    ), {"jid": job_id}).fetchone()
    if not existing:
        raise HTTPException(404, "Ish o'rni topilmadi")
    if existing[0] != caller_id:
        raise HTTPException(403, "Bu e'lon sizniki emas")

    db.execute(text("UPDATE jobs SET is_active = FALSE WHERE id = :jid"), {"jid": job_id})
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# APPLICATIONS
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/{job_id}/apply")
def apply_to_job(
    job_id:    int,
    body:      ApplicationCreate,
    db:        Session = Depends(get_db),
    caller_id: int = Depends(_req_auth),
):
    job = db.execute(text(
        "SELECT posted_by, is_active FROM jobs WHERE id = :jid"
    ), {"jid": job_id}).fetchone()
    if not job:
        raise HTTPException(404, "Ish o'rni topilmadi")
    if not job[1]:
        raise HTTPException(400, "Bu e'lon yopilgan")
    if job[0] == caller_id:
        raise HTTPException(400, "O'z e'lonингizga ariza topshira olmaysiz")

    try:
        db.execute(text("""
            INSERT INTO job_applications (job_id, applicant_id, message)
            VALUES (:jid, :uid, :msg)
        """), {"jid": job_id, "uid": caller_id, "msg": body.message})
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "Siz allaqachon ariza topshirgansiz")

    return {"ok": True}


@router.get("/{job_id}/applicants")
def list_applicants(
    job_id:    int,
    db:        Session = Depends(get_db),
    caller_id: int = Depends(_req_auth),
):
    job = db.execute(text(
        "SELECT posted_by FROM jobs WHERE id = :jid"
    ), {"jid": job_id}).fetchone()
    if not job:
        raise HTTPException(404, "Ish o'rni topilmadi")
    if job[0] != caller_id:
        raise HTTPException(403, "Faqat e'lon egasi ko'ra oladi")

    rows = db.execute(text("""
        SELECT a.id, a.applicant_id, a.message, a.status, a.created_at,
               p.first_name, p.site_username AS username, p.photo_url,
               COALESCE(p.headline, '') AS headline,
               COALESCE(p.level, 1) AS level
        FROM job_applications a
        JOIN profiles p ON p.telegram_id = a.applicant_id
        WHERE a.job_id = :jid
        ORDER BY a.created_at DESC
    """), {"jid": job_id}).mappings().fetchall()

    return [dict(r) for r in rows]


@router.patch("/{job_id}/applicants/{app_id}")
def update_applicant_status(
    job_id:    int,
    app_id:    int,
    body:      ApplicationUpdate,
    db:        Session = Depends(get_db),
    caller_id: int = Depends(_req_auth),
):
    if body.status not in ("viewed", "shortlisted", "rejected"):
        raise HTTPException(400, "Noto'g'ri holat")

    job = db.execute(text(
        "SELECT posted_by FROM jobs WHERE id = :jid"
    ), {"jid": job_id}).fetchone()
    if not job or job[0] != caller_id:
        raise HTTPException(403, "Ruxsat yo'q")

    db.execute(text("""
        UPDATE job_applications SET status = :status
        WHERE id = :aid AND job_id = :jid
    """), {"status": body.status, "aid": app_id, "jid": job_id})
    db.commit()
    return {"ok": True}
