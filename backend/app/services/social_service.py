"""
Social service — posts, likes, comments, follows, feed, discovery.
"""

from __future__ import annotations
from typing import Optional, List, Tuple
from sqlalchemy import desc, func, and_, or_, exists
from sqlalchemy.orm import Session

from app.models.social_models import Post, PostLike, PostComment, Follow
from app.models.models import Profile


# ── Helpers ──────────────────────────────────────────────────────────────────

def _profile_to_author(p: Profile) -> dict:
    return {
        "telegram_id": p.telegram_id,
        "full_name": p.full_name,
        "username": p.username,
        "photo_url": p.photo_url,
        "role": p.role or "student",
        "level": p.level or 1,
        "xp": p.xp or 0,
    }


def _enrich_post(post: Post, author: Profile, is_liked: bool) -> dict:
    return {
        "id": post.id,
        "author": _profile_to_author(author),
        "content": post.content,
        "image_url": post.image_url,
        "likes_count": post.likes_count,
        "comments_count": post.comments_count,
        "is_liked": is_liked,
        "created_at": post.created_at,
        "updated_at": post.updated_at,
    }


# ── Posts CRUD ───────────────────────────────────────────────────────────────

def create_post(db: Session, author_id: int, content: str, image_url: Optional[str] = None) -> dict:
    post = Post(author_id=author_id, content=content, image_url=image_url)
    db.add(post)
    db.commit()
    db.refresh(post)
    author = db.query(Profile).filter(Profile.telegram_id == author_id).first()
    return _enrich_post(post, author, False)


def get_post(db: Session, post_id: int, viewer_id: Optional[int] = None) -> Optional[dict]:
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        return None
    author = db.query(Profile).filter(Profile.telegram_id == post.author_id).first()
    is_liked = False
    if viewer_id:
        is_liked = db.query(
            exists().where(and_(PostLike.post_id == post_id, PostLike.user_id == viewer_id))
        ).scalar()
    return _enrich_post(post, author, is_liked)


def delete_post(db: Session, post_id: int, user_id: int) -> bool:
    post = db.query(Post).filter(Post.id == post_id, Post.author_id == user_id).first()
    if not post:
        return False
    db.delete(post)
    db.commit()
    return True


def edit_post(db: Session, post_id: int, user_id: int, content: str) -> Optional[dict]:
    """Update post content. Only the author can edit."""
    post = db.query(Post).filter(Post.id == post_id, Post.author_id == user_id).first()
    if not post:
        return None
    post.content = content
    db.commit()
    db.refresh(post)
    author = db.query(Profile).filter(Profile.telegram_id == user_id).first()
    is_liked = db.query(
        exists().where(and_(PostLike.post_id == post_id, PostLike.user_id == user_id))
    ).scalar()
    return _enrich_post(post, author, is_liked)


# ── Feed ─────────────────────────────────────────────────────────────────────

def get_feed(
    db: Session,
    user_id: int,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """Home feed: posts from followed users + own posts, newest first."""
    following_ids = (
        db.query(Follow.following_id)
        .filter(Follow.follower_id == user_id)
        .subquery()
    )
    q = db.query(Post).filter(
        or_(Post.author_id == user_id, Post.author_id.in_(following_ids))
    )
    total = q.count()
    posts = (
        q.order_by(desc(Post.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return _enrich_posts_list(db, posts, user_id, total, page, page_size)


def get_explore(
    db: Session,
    user_id: int,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """Explore feed: all posts, newest first."""
    q = db.query(Post)
    total = q.count()
    posts = (
        q.order_by(desc(Post.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return _enrich_posts_list(db, posts, user_id, total, page, page_size)


def get_user_posts(
    db: Session,
    target_id: int,
    viewer_id: Optional[int],
    page: int = 1,
    page_size: int = 20,
) -> dict:
    q = db.query(Post).filter(Post.author_id == target_id)
    total = q.count()
    posts = (
        q.order_by(desc(Post.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return _enrich_posts_list(db, posts, viewer_id, total, page, page_size)


def _enrich_posts_list(
    db: Session,
    posts: list,
    viewer_id: Optional[int],
    total: int,
    page: int,
    page_size: int,
) -> dict:
    if not posts:
        return {"posts": [], "total": total, "page": page, "page_size": page_size}

    author_ids = list({p.author_id for p in posts})
    authors_map = {
        p.telegram_id: p
        for p in db.query(Profile).filter(Profile.telegram_id.in_(author_ids)).all()
    }
    liked_set = set()
    if viewer_id:
        post_ids = [p.id for p in posts]
        liked_rows = (
            db.query(PostLike.post_id)
            .filter(PostLike.user_id == viewer_id, PostLike.post_id.in_(post_ids))
            .all()
        )
        liked_set = {r[0] for r in liked_rows}

    enriched = [
        _enrich_post(p, authors_map.get(p.author_id), p.id in liked_set)
        for p in posts
    ]
    return {"posts": enriched, "total": total, "page": page, "page_size": page_size}


# ── Likes ────────────────────────────────────────────────────────────────────

def like_post(db: Session, post_id: int, user_id: int) -> bool:
    existing = db.query(PostLike).filter(
        PostLike.post_id == post_id, PostLike.user_id == user_id
    ).first()
    if existing:
        return False
    db.add(PostLike(post_id=post_id, user_id=user_id))
    db.commit()
    return True


def unlike_post(db: Session, post_id: int, user_id: int) -> bool:
    like = db.query(PostLike).filter(
        PostLike.post_id == post_id, PostLike.user_id == user_id
    ).first()
    if not like:
        return False
    db.delete(like)
    db.commit()
    return True


# ── Comments ─────────────────────────────────────────────────────────────────

def get_comments(db: Session, post_id: int, page: int = 1, page_size: int = 50) -> List[dict]:
    comments = (
        db.query(PostComment)
        .filter(PostComment.post_id == post_id)
        .order_by(PostComment.created_at)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    author_ids = list({c.author_id for c in comments})
    authors_map = {
        p.telegram_id: p
        for p in db.query(Profile).filter(Profile.telegram_id.in_(author_ids)).all()
    } if author_ids else {}

    return [
        {
            "id": c.id,
            "post_id": c.post_id,
            "author": _profile_to_author(authors_map.get(c.author_id)),
            "content": c.content,
            "created_at": c.created_at,
        }
        for c in comments
    ]


def create_comment(db: Session, post_id: int, author_id: int, content: str) -> dict:
    comment = PostComment(post_id=post_id, author_id=author_id, content=content)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    author = db.query(Profile).filter(Profile.telegram_id == author_id).first()
    return {
        "id": comment.id,
        "post_id": comment.post_id,
        "author": _profile_to_author(author),
        "content": comment.content,
        "created_at": comment.created_at,
    }


def delete_comment(db: Session, comment_id: int, user_id: int) -> bool:
    comment = db.query(PostComment).filter(
        PostComment.id == comment_id, PostComment.author_id == user_id
    ).first()
    if not comment:
        return False
    db.delete(comment)
    db.commit()
    return True


def edit_comment(db: Session, comment_id: int, user_id: int, content: str) -> Optional[dict]:
    """Update comment content. Only the author can edit."""
    comment = db.query(PostComment).filter(
        PostComment.id == comment_id, PostComment.author_id == user_id
    ).first()
    if not comment:
        return None
    comment.content = content
    db.commit()
    db.refresh(comment)
    author = db.query(Profile).filter(Profile.telegram_id == user_id).first()
    return {
        "id": comment.id,
        "post_id": comment.post_id,
        "author": _profile_to_author(author),
        "content": comment.content,
        "created_at": comment.created_at,
    }


# ── Follows ──────────────────────────────────────────────────────────────────

def follow_user(db: Session, follower_id: int, following_id: int) -> bool:
    if follower_id == following_id:
        return False
    existing = db.query(Follow).filter(
        Follow.follower_id == follower_id, Follow.following_id == following_id
    ).first()
    if existing:
        return False
    db.add(Follow(follower_id=follower_id, following_id=following_id))
    db.commit()
    return True


def unfollow_user(db: Session, follower_id: int, following_id: int) -> bool:
    follow = db.query(Follow).filter(
        Follow.follower_id == follower_id, Follow.following_id == following_id
    ).first()
    if not follow:
        return False
    db.delete(follow)
    db.commit()
    return True


def is_following(db: Session, follower_id: int, following_id: int) -> bool:
    return db.query(
        exists().where(and_(
            Follow.follower_id == follower_id,
            Follow.following_id == following_id,
        ))
    ).scalar()


def get_followers(db: Session, user_id: int, page: int = 1, page_size: int = 50) -> List[dict]:
    rows = (
        db.query(Follow, Profile)
        .join(Profile, Profile.telegram_id == Follow.follower_id)
        .filter(Follow.following_id == user_id)
        .order_by(desc(Follow.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [{"user": _profile_to_author(p), "created_at": f.created_at} for f, p in rows]


def get_following(db: Session, user_id: int, page: int = 1, page_size: int = 50) -> List[dict]:
    rows = (
        db.query(Follow, Profile)
        .join(Profile, Profile.telegram_id == Follow.following_id)
        .filter(Follow.follower_id == user_id)
        .order_by(desc(Follow.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [{"user": _profile_to_author(p), "created_at": f.created_at} for f, p in rows]


# ── Profile / Discovery ─────────────────────────────────────────────────────

def get_public_profile(db: Session, target_id: int, viewer_id: Optional[int] = None) -> Optional[dict]:
    profile = db.query(Profile).filter(Profile.telegram_id == target_id).first()
    if not profile:
        return None
    result = _profile_to_author(profile)
    result["bio"] = getattr(profile, "bio", None)
    result["followers_count"] = getattr(profile, "followers_count", 0) or 0
    result["following_count"] = getattr(profile, "following_count", 0) or 0
    result["is_following"] = is_following(db, viewer_id, target_id) if viewer_id else False
    return result


def search_users(db: Session, query: str, page: int = 1, page_size: int = 20) -> dict:
    q = db.query(Profile).filter(
        or_(
            Profile.full_name.ilike(f"%{query}%"),
            Profile.username.ilike(f"%{query}%"),
        )
    )
    total = q.count()
    users = q.order_by(desc(Profile.xp)).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "users": [_profile_to_author(u) for u in users],
        "total": total,
    }


def discover_users(db: Session, viewer_id: int, page: int = 1, page_size: int = 20) -> dict:
    """Discover users sorted by level/xp, excluding already followed."""
    following_ids = (
        db.query(Follow.following_id)
        .filter(Follow.follower_id == viewer_id)
        .subquery()
    )
    q = db.query(Profile).filter(
        Profile.telegram_id != viewer_id,
        ~Profile.telegram_id.in_(following_ids),
    )
    total = q.count()
    users = (
        q.order_by(desc(Profile.xp))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "users": [_profile_to_author(u) for u in users],
        "total": total,
    }
