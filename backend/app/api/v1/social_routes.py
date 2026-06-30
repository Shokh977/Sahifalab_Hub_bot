"""
Social API routes — posts, likes, comments, follows, feed, discovery.
"""

import asyncio
import threading
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.schemas.social_schemas import PostCreate, PostUpdate, CommentCreate, CommentUpdate, BulkViewRequest
from app.services import social_service as svc
from app.api.v1.endpoints.notifications import send_notification
from app.services.integration_service import hook_post_created
from app.models.models import Profile


def _fire_notification(user_id: int, notif_type: str, category: str = "SOCIAL", meta: dict = {}):
    """Fire-and-forget notification from a sync route (thread-pool context).

    Sync FastAPI routes run in a thread pool — asyncio.get_event_loop() there
    returns a non-running loop, so run_coroutine_threadsafe silently does nothing.
    Instead we spin up a daemon thread with its own event loop so the coroutine
    always executes regardless of which thread we're called from.
    """
    if user_id <= 0:
        return  # synthetic account (email/Google) — no Telegram push target

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(send_notification(user_id, notif_type, category, meta))
        except Exception:
            pass
        finally:
            loop.close()

    threading.Thread(target=_run, daemon=True).start()

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
    tid = decode_token(authorization.split(" ", 1)[1])
    if not tid:
        raise HTTPException(401, "Invalid token")
    return tid


def get_optional_user_id(authorization: str = Header(None)) -> Optional[int]:
    """Like get_current_user_id but returns None instead of raising for guests."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    tid = decode_token(authorization.split(" ", 1)[1])
    return tid if tid else None


# ── Posts ────────────────────────────────────────────────────────────────────

@router.post("/posts")
def create_post(
    body: PostCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    has_content = bool(body.content.strip())
    has_image = bool(body.image_url or body.image_urls)
    has_poll = bool(body.poll_options and len(body.poll_options) >= 2)
    if not has_content and not has_image and not has_poll:
        raise HTTPException(400, "Post must have text, images, or a poll")
    if body.poll_options and len(body.poll_options) > 4:
        raise HTTPException(400, "Poll can have at most 4 options")
    post = svc.create_post(
        db, user_id, body.content.strip(),
        image_url=body.image_url,
        image_urls=body.image_urls,
        poll_options=body.poll_options,
    )
    # HOOK 4: log post creation in activity_log
    if post and post.get("id"):
        hook_post_created(db, user_id, post["id"])
    return post


@router.get("/posts/feed")
def feed(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return svc.get_feed(db, user_id, page, page_size)


@router.get("/posts/explore")
def explore(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    user_id: Optional[int] = Depends(get_optional_user_id),
):
    return svc.get_explore(db, user_id, page, page_size)


@router.get("/posts/saved")
def get_saved_posts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Return posts bookmarked by the current user, most recently saved first."""
    return svc.get_saved_posts(db, user_id, page, page_size)


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


# ── Saves (bookmarks) ────────────────────────────────────────────────────────

@router.post("/posts/{post_id}/save")
def save_post(
    post_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    svc.save_post(db, post_id, user_id)
    post = svc.get_post(db, post_id)
    if post:
        author_id = post.get("author", {}).get("telegram_id")
        if author_id and author_id != user_id:
            actor = db.query(Profile).filter(Profile.telegram_id == user_id).first()
            _fire_notification(author_id, "save", "SOCIAL", {
                "actor_id": user_id,
                "actor_name": actor.first_name or "" if actor else "",
                "post_id": post_id,
            })
    return {"ok": True}


@router.delete("/posts/{post_id}/save")
def unsave_post(
    post_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    svc.unsave_post(db, post_id, user_id)
    return {"ok": True}


# ── Poll vote ─────────────────────────────────────────────────────────────────

@router.post("/posts/{post_id}/vote")
def vote_poll(
    post_id: int,
    option_idx: int = 0,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    result = svc.vote_poll(db, post_id, user_id, option_idx)
    if result is None:
        raise HTTPException(404, "Poll not found")
    return result


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
    post = svc.get_post(db, post_id)
    if post:
        author_id = post.get("author", {}).get("telegram_id")
        if author_id and author_id != user_id:
            actor = db.query(Profile).filter(Profile.telegram_id == user_id).first()
            _fire_notification(author_id, "repost", "SOCIAL", {
                "actor_id": user_id,
                "actor_name": actor.first_name or "" if actor else "",
                "post_id": post_id,
            })
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
    post = svc.get_post(db, post_id, user_id)
    if post and post.get("author", {}).get("telegram_id") and post["author"]["telegram_id"] != user_id:
        actor = db.query(Profile).filter(Profile.telegram_id == user_id).first()
        _fire_notification(post["author"]["telegram_id"], "like", "SOCIAL", {
            "actor_id": user_id,
            "actor_name": actor.first_name or "" if actor else "",
            "post_id": post_id,
        })
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
    user_id: Optional[int] = Depends(get_optional_user_id),
):
    return svc.get_comments(db, post_id, page, viewer_id=user_id)


@router.post("/posts/{post_id}/comments")
def create_comment(
    post_id: int,
    body: CommentCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    result = svc.create_comment(db, post_id, user_id, body.content.strip(), body.parent_id)
    # Notify post author only for top-level comments (replies are notified via reply-notify)
    if not body.parent_id:
        post = svc.get_post(db, post_id, user_id)
        if post and post.get("author", {}).get("telegram_id") and post["author"]["telegram_id"] != user_id:
            actor = db.query(Profile).filter(Profile.telegram_id == user_id).first()
            _fire_notification(post["author"]["telegram_id"], "comment", "SOCIAL", {
                "actor_id":   user_id,
                "actor_name": actor.first_name or "" if actor else "",
                "post_id":    post_id,
            })
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


@router.post("/comments/{comment_id}/like")
def like_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    svc.like_comment(db, comment_id, user_id)
    return {"ok": True}


@router.delete("/comments/{comment_id}/like")
def unlike_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    svc.unlike_comment(db, comment_id, user_id)
    return {"ok": True}


@router.post("/comments/{comment_id}/reply-notify")
def reply_notify(
    comment_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Notify the author of `comment_id` that the current user replied to their comment."""
    from sqlalchemy import text as _text
    row = db.execute(
        _text("SELECT author_id FROM post_comments WHERE id = :id"),
        {"id": comment_id},
    ).fetchone()
    if not row:
        raise HTTPException(404, "Comment not found")
    author_id = row[0]
    if author_id != user_id:
        actor = db.query(Profile).filter(Profile.telegram_id == user_id).first()
        _fire_notification(author_id, "comment_reply", "SOCIAL", {
            "actor_id":   user_id,
            "actor_name": actor.first_name or "" if actor else "",
            "comment_id": comment_id,
        })
    return {"ok": True}


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
        actor = db.query(Profile).filter(Profile.telegram_id == user_id).first()
        _fire_notification(target_id, "follow", "SOCIAL", {
            "actor_id": user_id,
            "actor_name": actor.first_name or "" if actor else "",
        })
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


@router.get("/users/{target_id}/connections")
def get_user_connections(
    target_id: int,
    db: Session = Depends(get_db),
):
    """Public list of a user's accepted connections (up to 100)."""
    rows = db.execute(text("""
        SELECT
            p.telegram_id,
            p.first_name,
            p.site_username AS username,
            p.photo_url,
            p.headline
        FROM connections c
        JOIN profiles p
          ON p.telegram_id = CASE
               WHEN c.requester_id = :tid THEN c.receiver_id
               ELSE c.requester_id
             END
        WHERE (c.requester_id = :tid OR c.receiver_id = :tid)
          AND c.status = 'accepted'
        ORDER BY c.accepted_at DESC
        LIMIT 100
    """), {"tid": target_id}).mappings().fetchall()

    return [
        {
            "telegram_id": r["telegram_id"],
            "first_name":  r["first_name"] or "",
            "username":    r["username"],
            "photo_url":   r["photo_url"],
            "headline":    r["headline"],
        }
        for r in rows
    ]


# ── Profile / Discovery ─────────────────────────────────────────────────────

@router.get("/users/{target_id}/profile")
def get_profile(
    target_id: str,
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
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return svc.get_user_posts(db, target_id, user_id, page, page_size)


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
