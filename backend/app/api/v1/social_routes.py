"""
Social API routes — posts, likes, comments, follows, feed, discovery.
"""

import asyncio
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.schemas.social_schemas import PostCreate, PostUpdate, CommentCreate, CommentUpdate, BulkViewRequest
from app.services import social_service as svc
from app.api.v1.endpoints.notifications import send_notification


def _fire_notification(user_id: int, notif_type: str, category: str = "SOCIAL", meta: dict = {}):
    """Fire-and-forget notification from sync context."""
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(send_notification(user_id, notif_type, category, meta))
    except RuntimeError:
        pass  # no event loop — skip silently

router = APIRouter(prefix="/social", tags=["social"])


# ── Auth helper ──────────────────────────────────────────────────────────────

def _get_user_id(authorization: str = None) -> int:
    """Extract telegram_id from Bearer token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing auth token")
    payload = decode_token(authorization.split(" ")[1])
    if not payload:
        raise HTTPException(401, "Invalid token")
    return int(payload.get("sub", 0))


def _require_auth(authorization: str = Depends(lambda: None)):
    """Dependency stub — actual extraction done in each endpoint from header."""
    pass


from fastapi import Header

def get_current_user_id(authorization: str = Header(None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    payload = decode_token(authorization.split(" ", 1)[1])
    if not payload or "sub" not in payload:
        raise HTTPException(401, "Invalid token")
    return int(payload["sub"])


# ── Posts ────────────────────────────────────────────────────────────────────

@router.post("/posts")
def create_post(
    body: PostCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    if not body.content.strip() and not body.image_url:
        raise HTTPException(400, "Post must have text or an image")
    return svc.create_post(db, user_id, body.content.strip(), body.image_url)


@router.get("/posts/feed")
def feed(
    before_timestamp: Optional[str] = Query(None, description="ISO datetime cursor for pagination"),
    page_size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    cursor_dt: Optional[datetime] = None
    if before_timestamp:
        try:
            cursor_dt = datetime.fromisoformat(before_timestamp.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(400, "Invalid before_timestamp format")
    return svc.get_feed(db, user_id, cursor_dt, page_size)


@router.get("/posts/explore")
def explore(
    before_timestamp: Optional[str] = Query(None, description="ISO datetime cursor for pagination"),
    page_size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    cursor_dt: Optional[datetime] = None
    if before_timestamp:
        try:
            cursor_dt = datetime.fromisoformat(before_timestamp.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(400, "Invalid before_timestamp format")
    return svc.get_explore(db, user_id, cursor_dt, page_size)


@router.get("/posts/{post_id}")
def get_post(
    post_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    result = svc.get_post(db, post_id, user_id)
    if not result:
        raise HTTPException(404, "Post not found")
    return result


@router.delete("/posts/{post_id}")
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    if not svc.delete_post(db, post_id, user_id):
        raise HTTPException(404, "Post not found or not yours")
    return {"ok": True}


# ── Views / Reposts / Shares ─────────────────────────────────────────────────
@router.post("/posts/views/bulk")
def bulk_view(
    body: BulkViewRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Batch increment views_count for all supplied post IDs in one DB UPDATE.

    Called by the client-side view-buffer every 10 s or when the buffer hits 10 IDs.
    """
    svc.increment_views_bulk(db, body.post_ids)
    return {"ok": True}

@router.post("/posts/{post_id}/view")
def increment_view(
    post_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Raw view counter increment — called after 2s IntersectionObserver dwell."""
    svc.increment_post_views(db, post_id)
    return {"ok": True}


@router.post("/posts/{post_id}/repost")
def repost(
    post_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    if not svc.repost_post(db, post_id, user_id):
        raise HTTPException(400, "Already reposted or post not found")
    return {"ok": True}


@router.delete("/posts/{post_id}/repost")
def unrepost(
    post_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    svc.unrepost_post(db, post_id, user_id)
    return {"ok": True}


@router.post("/posts/{post_id}/share")
def share_post(
    post_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Increment shares_count — called only when share action completes."""
    svc.increment_post_shares(db, post_id)
    return {"ok": True}


@router.patch("/posts/{post_id}")
def edit_post(
    post_id: int,
    body: PostUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    result = svc.edit_post(db, post_id, user_id, body.content.strip())
    if not result:
        raise HTTPException(404, "Post not found or not yours")
    return result


# ── Likes ────────────────────────────────────────────────────────────────────

@router.post("/posts/{post_id}/like")
def like_post(
    post_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    svc.like_post(db, post_id, user_id)
    # Notify post author (skip if liking own post)
    post = svc.get_post(db, post_id, user_id)
    if post and post.get("author", {}).get("telegram_id") and post["author"]["telegram_id"] != user_id:
        _fire_notification(post["author"]["telegram_id"], "like", "SOCIAL", {"actor_id": user_id, "post_id": post_id})
    return {"ok": True}


@router.delete("/posts/{post_id}/like")
def unlike_post(
    post_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    svc.unlike_post(db, post_id, user_id)
    return {"ok": True}


# ── Comments ─────────────────────────────────────────────────────────────────

@router.get("/posts/{post_id}/comments")
def get_comments(
    post_id: int,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return svc.get_comments(db, post_id, page)


@router.post("/posts/{post_id}/comments")
def create_comment(
    post_id: int,
    body: CommentCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    result = svc.create_comment(db, post_id, user_id, body.content.strip())
    # Notify post author (skip if commenting on own post)
    post = svc.get_post(db, post_id, user_id)
    if post and post.get("author", {}).get("telegram_id") and post["author"]["telegram_id"] != user_id:
        _fire_notification(post["author"]["telegram_id"], "comment", "SOCIAL", {"actor_id": user_id, "post_id": post_id})
    return result


@router.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    if not svc.delete_comment(db, comment_id, user_id):
        raise HTTPException(404, "Comment not found or not yours")
    return {"ok": True}


@router.patch("/comments/{comment_id}")
def edit_comment(
    comment_id: int,
    body: CommentUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    result = svc.edit_comment(db, comment_id, user_id, body.content.strip())
    if not result:
        raise HTTPException(404, "Comment not found or not yours")
    return result


# ── Follows ──────────────────────────────────────────────────────────────────

@router.post("/users/{target_id}/follow")
def follow_user(
    target_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    if not svc.follow_user(db, user_id, target_id):
        raise HTTPException(400, "Cannot follow (already following or self)")
    if user_id != target_id:
        _fire_notification(target_id, "follow", "SOCIAL", {"actor_id": user_id})
    return {"ok": True}


@router.delete("/users/{target_id}/follow")
def unfollow_user(
    target_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    svc.unfollow_user(db, user_id, target_id)
    return {"ok": True}


@router.get("/users/{target_id}/followers")
def get_followers(
    target_id: int,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return svc.get_followers(db, target_id, page)


@router.get("/users/{target_id}/following")
def get_following(
    target_id: int,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return svc.get_following(db, target_id, page)


# ── Profile / Discovery ─────────────────────────────────────────────────────

@router.get("/users/{target_id}/profile")
def get_profile(
    target_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    result = svc.get_public_profile(db, target_id, user_id)
    if not result:
        raise HTTPException(404, "User not found")
    return result


@router.get("/users/{target_id}/posts")
def get_user_posts(
    target_id: int,
    before_timestamp: Optional[str] = Query(None),
    page_size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    cursor_dt: Optional[datetime] = None
    if before_timestamp:
        try:
            cursor_dt = datetime.fromisoformat(before_timestamp.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(400, "Invalid before_timestamp format")
    return svc.get_user_posts(db, target_id, user_id, cursor_dt, page_size)


@router.get("/search")
def search_users(
    q: str = Query("", min_length=1),
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return svc.search_users(db, q, page)


@router.get("/discover")
def discover_users(
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return svc.discover_users(db, user_id, page)
