"""
Social service — posts, likes, comments, follows, feed, discovery.
"""

from __future__ import annotations
from typing import Optional, List, Tuple
from sqlalchemy import desc, func, and_, or_, exists, text
from sqlalchemy.orm import Session

from app.models.social_models import Post, PostLike, PostComment, Follow, Repost
from app.models.models import Profile


# ── Helpers ──────────────────────────────────────────────────────────────────

def _profile_to_author(p: Profile) -> dict:
    return {
        "telegram_id": p.telegram_id,
        "full_name": p.first_name or "",
        "username": p.username,
        "photo_url": p.photo_url,
        "role": p.role or "student",
        "level": p.level or 1,
        "xp": p.total_xp or 0,
    }


def _enrich_post(
    post: Post,
    author: Profile,
    is_liked: bool,
    is_reposted: bool = False,
    repost_by: Optional[Profile] = None,
) -> dict:
    result = {
        "id": post.id,
        "author": _profile_to_author(author),
        "content": post.content,
        "image_url": post.image_url,
        "likes_count": post.likes_count,
        "comments_count": post.comments_count,
        "views_count": getattr(post, "views_count", 0) or 0,
        "reposts_count": getattr(post, "reposts_count", 0) or 0,
        "shares_count": getattr(post, "shares_count", 0) or 0,
        "base_views_added": getattr(post, "base_views_added", 0) or 0,
        "is_liked": is_liked,
        "is_reposted": is_reposted,
        "created_at": post.created_at,
        "updated_at": post.updated_at,
    }
    if repost_by is not None:
        result["repost_by"] = _profile_to_author(repost_by)
    return result


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
    """Home feed: own posts + followed users' posts + reposts by followed users, newest first."""
    following_ids: List[int] = [
        r[0] for r in
        db.query(Follow.following_id).filter(Follow.follower_id == user_id).all()
    ]
    visible_ids = set(following_ids) | {user_id}

    # 1. Regular posts by self + followed
    regular_posts: List[Post] = (
        db.query(Post).filter(Post.author_id.in_(visible_ids)).all()
    )
    regular_post_ids = {p.id for p in regular_posts}

    # 2. Reposts made by followed users (of posts not already in regular)
    repost_rows: List[Tuple] = []
    if following_ids:
        repost_rows = (
            db.query(Repost, Post)
            .join(Post, Post.id == Repost.original_post_id)
            .filter(Repost.user_id.in_(following_ids))
            .filter(Post.id.notin_(regular_post_ids) if regular_post_ids else True)
            .all()
        )

    # 3. Build reposter profile map
    reposter_ids = {r.user_id for r, _ in repost_rows}
    reposters_map: dict = {}
    if reposter_ids:
        reposters_map = {
            p.telegram_id: p
            for p in db.query(Profile).filter(Profile.telegram_id.in_(reposter_ids)).all()
        }

    # 4. Merge and sort by effective date (repost.created_at or post.created_at)
    feed_items: List[Tuple] = [(p.created_at, p, None) for p in regular_posts]
    for repost, post in repost_rows:
        feed_items.append((repost.created_at, post, reposters_map.get(repost.user_id)))
    feed_items.sort(key=lambda x: x[0], reverse=True)
    total = len(feed_items)

    paginated = feed_items[(page - 1) * page_size : page * page_size]
    if not paginated:
        return {"posts": [], "total": total, "page": page, "page_size": page_size}

    # 5. Batch-load authors + liked/reposted sets
    paged_posts = [item[1] for item in paginated]
    paged_post_ids = [p.id for p in paged_posts]
    author_ids = list({p.author_id for p in paged_posts})
    authors_map = {
        p.telegram_id: p
        for p in db.query(Profile).filter(Profile.telegram_id.in_(author_ids)).all()
    }
    liked_set: set = set()
    reposted_set: set = set()
    if paged_post_ids:
        liked_set = {
            r[0] for r in
            db.query(PostLike.post_id)
            .filter(PostLike.user_id == user_id, PostLike.post_id.in_(paged_post_ids))
            .all()
        }
        reposted_set = {
            r[0] for r in
            db.query(Repost.original_post_id)
            .filter(Repost.user_id == user_id, Repost.original_post_id.in_(paged_post_ids))
            .all()
        }

    enriched = [
        _enrich_post(
            post, authors_map.get(post.author_id),
            post.id in liked_set, post.id in reposted_set, reposter,
        )
        for _, post, reposter in paginated
    ]
    return {"posts": enriched, "total": total, "page": page, "page_size": page_size}


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
    repost_by_map: Optional[dict] = None,
) -> dict:
    if not posts:
        return {"posts": [], "total": total, "page": page, "page_size": page_size}

    author_ids = list({p.author_id for p in posts})
    authors_map = {
        p.telegram_id: p
        for p in db.query(Profile).filter(Profile.telegram_id.in_(author_ids)).all()
    }
    liked_set: set = set()
    reposted_set: set = set()
    if viewer_id:
        post_ids = [p.id for p in posts]
        liked_rows = (
            db.query(PostLike.post_id)
            .filter(PostLike.user_id == viewer_id, PostLike.post_id.in_(post_ids))
            .all()
        )
        liked_set = {r[0] for r in liked_rows}
        reposted_rows = (
            db.query(Repost.original_post_id)
            .filter(Repost.user_id == viewer_id, Repost.original_post_id.in_(post_ids))
            .all()
        )
        reposted_set = {r[0] for r in reposted_rows}

    rb_map = repost_by_map or {}
    enriched = [
        _enrich_post(
            p, authors_map.get(p.author_id),
            p.id in liked_set, p.id in reposted_set, rb_map.get(p.id),
        )
        for p in posts
    ]
    return {"posts": enriched, "total": total, "page": page, "page_size": page_size}

# ── Views / Reposts / Shares ───────────────────────────────────────────────────────

def increment_post_views(db: Session, post_id: int) -> None:
    """Atomically bump view counter. Raw count, uniqueness not enforced."""
    db.query(Post).filter(Post.id == post_id).update(
        {Post.views_count: Post.views_count + 1}
    )
    db.commit()


def repost_post(db: Session, post_id: int, user_id: int) -> bool:
    """Create a repost record and bump reposts_count. Returns False if already reposted."""
    if db.query(Repost).filter(
        Repost.user_id == user_id, Repost.original_post_id == post_id
    ).first():
        return False
    db.add(Repost(user_id=user_id, original_post_id=post_id))
    db.query(Post).filter(Post.id == post_id).update(
        {Post.reposts_count: Post.reposts_count + 1}
    )
    db.commit()
    return True


def unrepost_post(db: Session, post_id: int, user_id: int) -> bool:
    """Delete repost record and decrement reposts_count (floor 0)."""
    row = db.query(Repost).filter(
        Repost.user_id == user_id, Repost.original_post_id == post_id
    ).first()
    if not row:
        return False
    db.delete(row)
    db.query(Post).filter(Post.id == post_id).update(
        {Post.reposts_count: func.greatest(Post.reposts_count - 1, 0)}
    )
    db.commit()
    return True


def increment_post_shares(db: Session, post_id: int) -> None:
    """Bump shares_count when user successfully completes a share action."""
    db.query(Post).filter(Post.id == post_id).update(
        {Post.shares_count: Post.shares_count + 1}
    )
    db.commit()


def increment_views_bulk(db: Session, post_ids: List[int]) -> None:
    """Atomically bump views_count for multiple posts in one UPDATE.

    Called by the frontend view-buffer flush (every 10 s or 10-item batch).
    """
    if not post_ids:
        return
    db.execute(
        text("UPDATE posts SET views_count = views_count + 1 WHERE id = ANY(:ids)"),
        {"ids": post_ids},
    )
    db.commit()


def simulate_organic_growth(db: Session) -> None:
    """Invoke the simulate_organic_growth() SQL function.

    Picks up to 5 recent posts with remaining view budget and increments
    base_views_added by 1-3.  Called lazily from the frontend (once per session).
    """
    db.execute(text("SELECT simulate_organic_growth()"))
    db.commit()


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
    result["about_me"] = getattr(profile, "about_me", None)
    result["followers_count"] = getattr(profile, "followers_count", 0) or 0
    result["following_count"] = getattr(profile, "following_count", 0) or 0
    result["is_following"] = is_following(db, viewer_id, target_id) if viewer_id else False
    return result


def search_users(db: Session, query: str, page: int = 1, page_size: int = 20) -> dict:
    q = db.query(Profile).filter(
        or_(
            Profile.first_name.ilike(f"%{query}%"),
            Profile.username.ilike(f"%{query}%"),
        )
    )
    total = q.count()
    users = q.order_by(desc(Profile.total_xp)).offset((page - 1) * page_size).limit(page_size).all()
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
        q.order_by(desc(Profile.total_xp))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "users": [_profile_to_author(u) for u in users],
        "total": total,
    }
