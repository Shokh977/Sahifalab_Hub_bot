"""
planner.py — Workspace Planner (Ish Joyi) endpoints.

CRUD for Kanban tasks + personal notes.
When a task is moved to "done", calls add_xp() for +20 XP reward.

POST   /api/planner/tasks               — create task
GET    /api/planner/tasks/{telegram_id}  — list all tasks for user
PUT    /api/planner/tasks/{task_id}      — update task (title, status, priority, sort)
DELETE /api/planner/tasks/{task_id}      — delete task
POST   /api/planner/tasks/reorder       — batch reorder tasks

POST   /api/planner/notes               — create note
GET    /api/planner/notes/{telegram_id}  — list all notes for user
PUT    /api/planner/notes/{note_id}      — update note
DELETE /api/planner/notes/{note_id}      — delete note
"""

import logging
from datetime import datetime, UTC
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.session import get_db
from app.models.models import PlannerTask, PlannerNote
from app.services.auth_service import decode_token

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Auth helper ───────────────────────────────────────────────────────────────

async def _require_token(authorization: Optional[str] = Header(None)) -> int:
    """Extract telegram_id from Bearer JWT. Raises 401 on failure."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Avtorizatsiya talab qilinadi")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Noto'g'ri avtorizatsiya")
    tid = decode_token(parts[1])
    if not tid:
        raise HTTPException(status_code=401, detail="Token muddati tugagan")
    return tid


# ── Request schemas ───────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    telegram_id:      Optional[int] = None  # ignored — caller_id from JWT is used
    title:            str
    description:      Optional[str] = None
    status:           str = "todo"
    priority:         str = "medium"
    sort_order:       int = 0
    linked_course_id: Optional[int] = None
    linked_lesson_id: Optional[int] = None
    scheduled_at:     Optional[datetime] = None
    duration_minutes: int = 30


class TaskUpdate(BaseModel):
    title:            Optional[str] = None
    description:      Optional[str] = None
    status:           Optional[str] = None
    priority:         Optional[str] = None
    sort_order:       Optional[int] = None
    linked_course_id: Optional[int] = None
    linked_lesson_id: Optional[int] = None
    scheduled_at:     Optional[datetime] = None
    duration_minutes: Optional[int] = None


class ReorderItem(BaseModel):
    id:         int
    status:     str
    sort_order: int


class ReorderRequest(BaseModel):
    telegram_id: int
    items:       List[ReorderItem]


class NoteCreate(BaseModel):
    telegram_id: Optional[int] = None  # ignored — caller_id from JWT is used
    title:       str = ""
    content:     str = ""


class NoteUpdate(BaseModel):
    title:   Optional[str] = None
    content: Optional[str] = None


# ── Helper: serialize a task row ──────────────────────────────────────────────

def _task_dict(t: PlannerTask) -> dict:
    return {
        "id":               t.id,
        "user_id":          t.user_id,
        "title":            t.title,
        "description":      t.description,
        "status":           t.status,
        "priority":         t.priority,
        "sort_order":       t.sort_order,
        "linked_course_id": t.linked_course_id,
        "linked_lesson_id": t.linked_lesson_id,
        "xp_claimed":       t.xp_claimed,
        "scheduled_at":     t.scheduled_at.isoformat() if t.scheduled_at else None,
        "duration_minutes": t.duration_minutes if t.duration_minutes is not None else 30,
        "created_at":       t.created_at.isoformat() if t.created_at else None,
        "updated_at":       t.updated_at.isoformat() if t.updated_at else None,
    }


def _note_dict(n: PlannerNote) -> dict:
    return {
        "id":         n.id,
        "user_id":    n.user_id,
        "title":      n.title,
        "content":    n.content,
        "sort_order": n.sort_order,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  TASKS
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/tasks")
async def create_task(body: TaskCreate, db: Session = Depends(get_db), caller_id: int = Depends(_require_token)):
    task = PlannerTask(
        user_id=caller_id,
        title=body.title,
        description=body.description,
        status=body.status,
        priority=body.priority,
        sort_order=body.sort_order,
        linked_course_id=body.linked_course_id,
        linked_lesson_id=body.linked_lesson_id,
        scheduled_at=body.scheduled_at,
        duration_minutes=body.duration_minutes,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _task_dict(task)


@router.get("/tasks/{telegram_id}")
async def list_tasks(telegram_id: int, db: Session = Depends(get_db), caller_id: int = Depends(_require_token)):
    # Only allow users to list their own tasks
    if caller_id != telegram_id:
        raise HTTPException(status_code=403, detail="Faqat o'z vazifalaringizni ko'rishingiz mumkin")
    tasks = (
        db.query(PlannerTask)
        .filter(PlannerTask.user_id == telegram_id)
        .order_by(PlannerTask.sort_order.asc(), PlannerTask.created_at.desc())
        .all()
    )
    return [_task_dict(t) for t in tasks]


@router.put("/tasks/{task_id}")
async def update_task(task_id: int, body: TaskUpdate, db: Session = Depends(get_db), caller_id: int = Depends(_require_token)):
    task = db.query(PlannerTask).filter(PlannerTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.user_id != caller_id:
        raise HTTPException(status_code=403, detail="Bu sizning vazifangiz emas")

    old_status = task.status
    update_data = body.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task, key, value)

    db.commit()
    db.refresh(task)

    # ── Award 20 XP when task moves to "done" (once only) ───────────────
    xp_awarded = 0
    if old_status != "done" and task.status == "done" and not task.xp_claimed:
        try:
            row = db.execute(
                text("SELECT new_xp, new_level, xp_added FROM add_xp(:uid, 'DEEP_WORK', 20, NULL)"),
                {"uid": task.user_id},
            ).fetchone()
            if row:
                xp_awarded = int(row.xp_added)
            task.xp_claimed = True
            db.commit()
            # tanga-economy-rework (092): the Tanga mirror here is removed —
            # planner-task completion is not one of the events in the new
            # earning table. XP is unchanged.
        except Exception:
            db.rollback()
            logger.error(
                "Planner task-done XP award failed for user_id=%s task_id=%s amount=20 source=DEEP_WORK",
                task.user_id, task.id, exc_info=True,
            )

    result = _task_dict(task)
    result["xp_awarded"] = xp_awarded
    return result


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: int, db: Session = Depends(get_db), caller_id: int = Depends(_require_token)):
    task = db.query(PlannerTask).filter(PlannerTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.user_id != caller_id:
        raise HTTPException(status_code=403, detail="Bu sizning vazifangiz emas")
    db.delete(task)
    db.commit()
    return {"ok": True}


@router.post("/tasks/reorder")
async def reorder_tasks(body: ReorderRequest, db: Session = Depends(get_db), caller_id: int = Depends(_require_token)):
    """Batch update sort_order and status for all tasks after a drag-drop."""
    xp_awarded = 0

    for item in body.items:
        task = (
            db.query(PlannerTask)
            .filter(PlannerTask.id == item.id, PlannerTask.user_id == caller_id)
            .first()
        )
        if task:
            old_status = task.status
            task.status = item.status
            task.sort_order = item.sort_order

            # Award XP on first move to "done" (once per task)
            if old_status != "done" and item.status == "done" and not task.xp_claimed:
                try:
                    row = db.execute(
                        text("SELECT xp_added FROM add_xp(:uid, 'DEEP_WORK', 20, NULL)"),
                        {"uid": caller_id},
                    ).fetchone()
                    # tanga-economy-rework (092): the Tanga mirror here is
                    # removed — planner-task completion is not one of the
                    # events in the new earning table. XP is unchanged.
                    if row and int(row.xp_added) > 0:
                        xp_awarded += int(row.xp_added)
                    task.xp_claimed = True
                except Exception:
                    logger.error(
                        "Planner reorder-done XP award failed for user_id=%s task_id=%s amount=20 source=DEEP_WORK",
                        caller_id, task.id, exc_info=True,
                    )

    db.commit()
    return {"ok": True, "xp_awarded": xp_awarded}


# ══════════════════════════════════════════════════════════════════════════════
#  NOTES
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/notes")
async def create_note(body: NoteCreate, db: Session = Depends(get_db), caller_id: int = Depends(_require_token)):
    note = PlannerNote(
        user_id=caller_id,
        title=body.title,
        content=body.content,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return _note_dict(note)


@router.get("/notes/{telegram_id}")
async def list_notes(telegram_id: int, db: Session = Depends(get_db), caller_id: int = Depends(_require_token)):
    if caller_id != telegram_id:
        raise HTTPException(status_code=403, detail="Faqat o'z qaydlaringizni ko'rishingiz mumkin")
    notes = (
        db.query(PlannerNote)
        .filter(PlannerNote.user_id == telegram_id)
        .order_by(PlannerNote.sort_order.asc(), PlannerNote.created_at.desc())
        .all()
    )
    return [_note_dict(n) for n in notes]


@router.put("/notes/{note_id}")
async def update_note(note_id: int, body: NoteUpdate, db: Session = Depends(get_db), caller_id: int = Depends(_require_token)):
    note = db.query(PlannerNote).filter(PlannerNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.user_id != caller_id:
        raise HTTPException(status_code=403, detail="Bu sizning qaydingiz emas")

    update_data = body.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(note, key, value)

    db.commit()
    db.refresh(note)
    return _note_dict(note)


@router.delete("/notes/{note_id}")
async def delete_note(note_id: int, db: Session = Depends(get_db), caller_id: int = Depends(_require_token)):
    note = db.query(PlannerNote).filter(PlannerNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.user_id != caller_id:
        raise HTTPException(status_code=403, detail="Bu sizning qaydingiz emas")
    db.delete(note)
    db.commit()
    return {"ok": True}
