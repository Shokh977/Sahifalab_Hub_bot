"""
Social API routes — posts, likes, comments, follows, feed, discovery.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.schemas.social_schemas import PostCreate, CommentCreate
from app.services import social_service as svc

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
    user_id: int = Depends(get_current_user_id),
):
    return svc.get_explore(db, user_id, page, page_size)


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


# ── Likes ────────────────────────────────────────────────────────────────────

@router.post("/posts/{post_id}/like")
def like_post(
    post_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    svc.like_post(db, post_id, user_id)
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
    return svc.create_comment(db, post_id, user_id, body.content.strip())


@router.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    if not svc.delete_comment(db, comment_id, user_id):
        raise HTTPException(404, "Comment not found or not yours")
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
