"""
Social service — posts, likes, comments, follows, feed, discovery.
"""

from __future__ import annotations
from typing import Optional, List, Tuple
from sqlalchemy import desc, func, and_, or_, exists, text
from sqlalchemy.orm import Session

from datetime import datetime, timezone
from app.models.social_models import Post, PostLike, PostComment, Follow, Repost, PostSave, PollVote
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
        # Extended fields from migration 043
        "headline":     getattr(p, "headline", None),
        "account_type": getattr(p, "account_type", "student"),
        "is_verified":  getattr(p, "is_verified", False),
    }


# ── Feed scoring helpers ──────────────────────────────────────────────────────

def _recency_score(created_at) -> float:
    if created_at is None:
        return 0.1
    if hasattr(created_at, "tzinfo") and created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    age_hrs = (datetime.now(timezone.utc) - created_at).total_seconds() / 3600
    if age_hrs < 1:   return 1.0
    if age_hrs < 6:   return 0.8
    if age_hrs < 24:  return 0.6
    if age_hrs < 72:  return 0.3
    return 0.1


def _engagement_score(post: Post) -> float:
    raw = (
        (getattr(post, "saves_count", 0) or 0) * 4
        + (post.comments_count or 0) * 3
        + (getattr(post, "reposts_count", 0) or 0) * 2
        + (post.likes_count or 0) * 1
    )
    impressions = max((post.views_count or 0) + (post.base_views_added or 0), 1)
    return min(raw / impressions, 1.0)


def _content_quality(post: Post) -> float:
    score = 0.0
    if post.image_url:
        score += 0.2
    if len(post.content or "") > 50:
        score += 0.2
    pt = getattr(post, "post_type", "text") or "text"
    if pt == "course_announcement":
        score += 0.3
    elif pt == "achievement":
        score += 0.3
    return min(score, 1.0)


def _kuzatuv_score(post: Post, viewer_level: int, reposter: Optional[Profile] = None) -> float:
    """
    Scoring for the Kuzatuv (connections) tab.
    recency(0.3) + engagement(0.3) + author_relevance(0.2) + content_quality(0.2)
    """
    rec  = _recency_score(post.created_at)
    eng  = _engagement_score(post)
    qual = _content_quality(post)
    # author_relevance: simplified (shared_skills omitted for perf, level proximity)
    author_level = 1  # would need join; use 0.3 base for all in-network posts
    level_sim = 1.0 if abs(viewer_level - author_level) <= 2 else 0.5
    rel = 0.5 + 0.2 * level_sim  # 0.5 base (in network) + level similarity
    return 0.3 * rec + 0.3 * eng + 0.2 * rel + 0.2 * qual


def _kashfiyot_score(post: Post, author: Optional[Profile] = None) -> float:
    """
    Scoring for the Kashfiyot (explore/discover) tab.
    engagement(0.4) + author_reputation(0.3) + recency(0.1)
    """
    eng  = _engagement_score(post)
    rec  = _recency_score(post.created_at)
    rep  = 0.0
    if author:
        is_verified = getattr(author, "is_verified", False) or False
        level = (author.level or 1)
        rep = 0.5 * float(is_verified) + 0.5 * min(level / 27.0, 1.0)
    return 0.4 * eng + 0.3 * rep + 0.1 * rec


def _enrich_post(
    post: Post,
    author: Optional[Profile],
    is_liked: bool,
    is_reposted: bool = False,
    repost_by: Optional[Profile] = None,
    is_saved: bool = False,
) -> dict:
    result = {
        "id": post.id,
        "author": _profile_to_author(author) if author else {"telegram_id": 0, "full_name": "Deleted"},
        "content": post.content,
        "image_url": post.image_url,
        "post_type":     getattr(post, "post_type", "text") or "text",
        "post_metadata": getattr(post, "post_metadata", None),
        "likes_count":   post.likes_count,
        "comments_count":post.comments_count,
        "views_count":   getattr(post, "views_count", 0) or 0,
        "reposts_count": getattr(post, "reposts_count", 0) or 0,
        "shares_count":  getattr(post, "shares_count", 0) or 0,
        "saves_count":   getattr(post, "saves_count", 0) or 0,
        "base_views_added": getattr(post, "base_views_added", 0) or 0,
        "is_liked":    is_liked,
        "is_reposted": is_reposted,
        "is_saved":    is_saved,
        "created_at":  post.created_at,
        "updated_at":  post.updated_at,
    }
    if repost_by is not None:
        result["repost_by"] = _profile_to_author(repost_by)
    return result


# ── Posts CRUD ───────────────────────────────────────────────────────────────

def create_post(
    db: Session,
    author_id: int,
    content: str,
    image_url: Optional[str] = None,
    image_urls: Optional[List[str]] = None,
    poll_options: Optional[List[str]] = None,
) -> dict:
    post_type = "text"
    post_metadata = None

    if poll_options and len(poll_options) >= 2:
        post_type = "poll"
        post_metadata = {
            "options": [{"text": opt, "votes_count": 0} for opt in poll_options],
            "total_votes": 0,
        }
    elif image_urls and len(image_urls) > 1:
        post_metadata = {"images": image_urls}
        image_url = image_urls[0]

    post = Post(
        author_id=author_id,
        content=content,
        image_url=image_url,
        post_type=post_type,
        post_metadata=post_metadata,
    )
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
    """Kuzatuv feed: own + connection/followed posts, scored by relevance algorithm."""
    # Load viewer's level for relevance scoring
    viewer = db.query(Profile.level).filter(Profile.telegram_id == user_id).first()
    viewer_level = (viewer.level or 1) if viewer else 1

    # Visible author set: own posts + follows + accepted connections
    following_ids: List[int] = [
        r[0] for r in
        db.query(Follow.following_id).filter(Follow.follower_id == user_id).all()
    ]
    from app.models.social_models import Connection
    connection_ids: List[int] = []
    try:
        from sqlalchemy import case
        rows = db.execute(
            __import__("sqlalchemy").text(
                "SELECT CASE WHEN requester_id = :uid THEN receiver_id ELSE requester_id END "
                "FROM connections WHERE (requester_id = :uid OR receiver_id = :uid) AND status = 'accepted'"
            ), {"uid": user_id}
        ).fetchall()
        connection_ids = [r[0] for r in rows]
    except Exception:
        pass

    visible_ids = set(following_ids) | set(connection_ids) | {user_id}

    # 1. Regular posts
    regular_posts: List[Post] = db.query(Post).filter(Post.author_id.in_(visible_ids)).all()
    regular_post_ids = {p.id for p in regular_posts}

    # 2. Reposts by followed/connected users
    repost_rows: List[Tuple] = []
    if following_ids or connection_ids:
        repost_user_ids = list(set(following_ids) | set(connection_ids))
        repost_rows = (
            db.query(Repost, Post)
            .join(Post, Post.id == Repost.original_post_id)
            .filter(Repost.user_id.in_(repost_user_ids))
            .filter(Post.id.notin_(regular_post_ids) if regular_post_ids else True)
            .all()
        )

    reposter_ids = {r.user_id for r, _ in repost_rows}
    reposters_map: dict = {}
    if reposter_ids:
        reposters_map = {
            p.telegram_id: p
            for p in db.query(Profile).filter(Profile.telegram_id.in_(reposter_ids)).all()
        }

    # 3. Build candidate list with (score, effective_date, post, reposter)
    candidates: List[Tuple] = []
    for post in regular_posts:
        score = _kuzatuv_score(post, viewer_level)
        candidates.append((score, post.created_at, post, None))
    for repost, post in repost_rows:
        score = _kuzatuv_score(post, viewer_level)
        candidates.append((score, repost.created_at, post, reposters_map.get(repost.user_id)))

    # Sort by score DESC, then recency as tiebreaker
    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
    total = len(candidates)

    paginated = candidates[(page - 1) * page_size : page * page_size]
    if not paginated:
        return {"posts": [], "total": total, "page": page, "page_size": page_size}

    # 4. Batch-load interaction sets
    paged_posts = [item[2] for item in paginated]
    paged_post_ids = [p.id for p in paged_posts]
    author_ids = list({p.author_id for p in paged_posts})
    authors_map = {
        p.telegram_id: p
        for p in db.query(Profile).filter(Profile.telegram_id.in_(author_ids)).all()
    }
    liked_set: set = set()
    reposted_set: set = set()
    saved_set: set = set()
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
        try:
            saved_set = {
                r[0] for r in
                db.query(PostSave.post_id)
                .filter(PostSave.user_id == user_id, PostSave.post_id.in_(paged_post_ids))
                .all()
            }
        except Exception:
            pass

    enriched = [
        _enrich_post(
            post, authors_map.get(post.author_id),
            post.id in liked_set, post.id in reposted_set, reposter,
            post.id in saved_set,
        )
        for _, _, post, reposter in paginated
    ]
    return {"posts": enriched, "total": total, "page": page, "page_size": page_size}


def get_explore(
    db: Session,
    user_id: int,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """Kashfiyot feed: all posts, scored by engagement + author reputation + recency."""
    # Fetch a larger pool to score, then paginate (efficient for ~900 users)
    pool_limit = min(200, page_size * 10)
    posts: List[Post] = (
        db.query(Post)
        .order_by(desc(Post.created_at))
        .limit(pool_limit)
        .all()
    )
    total = db.query(Post).count()

    # Batch-load authors for reputation scoring
    author_ids = list({p.author_id for p in posts})
    authors_map = {
        p.telegram_id: p
        for p in db.query(Profile).filter(Profile.telegram_id.in_(author_ids)).all()
    }

    # Score and sort
    scored = [(
        _kashfiyot_score(post, authors_map.get(post.author_id)),
        post
    ) for post in posts]
    scored.sort(key=lambda x: x[0], reverse=True)

    paginated_posts = [p for _, p in scored[(page - 1) * page_size : page * page_size]]
    if not paginated_posts:
        return {"posts": [], "total": total, "page": page, "page_size": page_size}

    paged_post_ids = [p.id for p in paginated_posts]
    liked_set: set = set()
    saved_set: set = set()
    if paged_post_ids:
        liked_set = {
            r[0] for r in
            db.query(PostLike.post_id)
            .filter(PostLike.user_id == user_id, PostLike.post_id.in_(paged_post_ids))
            .all()
        }
        try:
            saved_set = {
                r[0] for r in
                db.query(PostSave.post_id)
                .filter(PostSave.user_id == user_id, PostSave.post_id.in_(paged_post_ids))
                .all()
            }
        except Exception:
            pass

    enriched = [
        _enrich_post(post, authors_map.get(post.author_id), post.id in liked_set,
                     is_saved=post.id in saved_set)
        for post in paginated_posts
    ]
    return {"posts": enriched, "total": total, "page": page, "page_size": page_size}


def save_post(db: Session, post_id: int, user_id: int) -> bool:
    """Save (bookmark) a post. Returns True if saved, False if already saved."""
    try:
        save = PostSave(post_id=post_id, user_id=user_id)
        db.add(save)
        db.commit()
        return True
    except Exception:
        db.rollback()
        return False


def unsave_post(db: Session, post_id: int, user_id: int) -> bool:
    """Remove bookmark. Returns True if removed."""
    save = db.query(PostSave).filter(PostSave.post_id == post_id, PostSave.user_id == user_id).first()
    if not save:
        return False
    db.delete(save)
    db.commit()
    return True


def vote_poll(db: Session, post_id: int, user_id: int, option_idx: int) -> Optional[dict]:
    """Vote on a poll. Removes old vote if changing option."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post or getattr(post, "post_type", "text") != "poll":
        return None
    # Remove existing vote if any
    existing = db.query(PollVote).filter(PollVote.post_id == post_id, PollVote.user_id == user_id).first()
    if existing:
        if existing.option_idx == option_idx:
            return {"voted": True, "option_idx": option_idx}  # no change
        db.delete(existing)
    vote = PollVote(post_id=post_id, user_id=user_id, option_idx=option_idx)
    db.add(vote)
    db.commit()
    # Return updated vote counts per option
    meta = dict(post.post_metadata or {})
    options = meta.get("options", [])
    vote_rows = db.query(PollVote.option_idx).filter(PollVote.post_id == post_id).all()
    counts: dict = {}
    for (idx,) in vote_rows:
        counts[idx] = counts.get(idx, 0) + 1
    total_votes = len(vote_rows)
    for i, opt in enumerate(options):
        opt["votes_count"] = counts.get(i, 0)
    meta["options"] = options
    meta["total_votes"] = total_votes
    meta["user_voted_option_idx"] = option_idx
    return meta


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
    # Update denormalized counts
    db.query(Profile).filter(Profile.telegram_id == follower_id).update(
        {Profile.following_count: Profile.following_count + 1}, synchronize_session=False
    )
    db.query(Profile).filter(Profile.telegram_id == following_id).update(
        {Profile.followers_count: Profile.followers_count + 1}, synchronize_session=False
    )
    db.commit()
    return True


def unfollow_user(db: Session, follower_id: int, following_id: int) -> bool:
    follow = db.query(Follow).filter(
        Follow.follower_id == follower_id, Follow.following_id == following_id
    ).first()
    if not follow:
        return False
    db.delete(follow)
    # Update denormalized counts
    db.query(Profile).filter(Profile.telegram_id == follower_id).update(
        {Profile.following_count: func.greatest(Profile.following_count - 1, 0)}, synchronize_session=False
    )
    db.query(Profile).filter(Profile.telegram_id == following_id).update(
        {Profile.followers_count: func.greatest(Profile.followers_count - 1, 0)}, synchronize_session=False
    )
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
