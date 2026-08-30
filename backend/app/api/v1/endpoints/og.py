"""
OG redirect endpoints — /api/og/{type}/{id}

Telegram's link-preview bot (and WhatsApp, Twitter, LinkedIn, etc.) fetch the
shared URL server-side *before* JavaScript runs, so react-helmet OG tags are
invisible to them. These endpoints return minimal HTML that:

  1. Contains the correct og:title / og:description / og:image tags
  2. Sets og:url to THIS endpoint URL (self-referential — see note below)
  3. Immediately redirects human browsers to the real SPA deep-link

WHY og:url must be self-referential
────────────────────────────────────
WhatsApp, LinkedIn, and Facebook follow the og:url value to fetch "canonical"
OG data. If og:url points to the React SPA, those platforms re-fetch Vercel's
index.html which has the generic site-level meta tags — showing the wrong
preview. Pointing og:url back to this endpoint prevents that re-fetch.

WHY we never return RedirectResponse (HTTP 302)
───────────────────────────────────────────────
Most link-preview bots follow HTTP redirects. A 302 to the SPA causes them to
fetch index.html and read its static fallback meta tags. We always return 200
HTML with a client-side redirect instead.
"""

import html as _h
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import text as _text
from app.db.session import get_db
from app.models.models import Book, Quiz

router = APIRouter()

FRONTEND      = "https://sahifalab-hub-bot.vercel.app"
BACKEND       = "https://sahifalabhubbot-production-c7e2.up.railway.app"
DEFAULT_IMAGE = f"{FRONTEND}/sahifalab.jpg"
SITE_NAME     = "SAHIFALAB"


def _og_html(
    title: str,
    description: str,
    image: str,
    dest: str,
    canonical: str,
) -> HTMLResponse:
    """
    Return a 200 HTML page with OG/Twitter meta tags that instantly redirects
    browsers to `dest`.

    canonical  — og:url; must be THIS endpoint's own URL so platforms don't
                 re-fetch a different URL for canonical OG data.
    dest       — where humans land (SPA deep-link).
    """
    t   = _h.escape(title or SITE_NAME)
    d   = _h.escape((description or "")[:200])
    img = _h.escape(image or DEFAULT_IMAGE)
    can = _h.escape(canonical)
    dst = _h.escape(dest)

    content = f"""<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="utf-8"/>
<title>{t} | {_h.escape(SITE_NAME)}</title>
<meta name="description" content="{d}"/>
<meta property="og:type"        content="website"/>
<meta property="og:site_name"   content="{_h.escape(SITE_NAME)}"/>
<meta property="og:title"       content="{t}"/>
<meta property="og:description" content="{d}"/>
<meta property="og:image"       content="{img}"/>
<meta property="og:url"         content="{can}"/>
<meta name="twitter:card"        content="summary_large_image"/>
<meta name="twitter:title"       content="{t}"/>
<meta name="twitter:description" content="{d}"/>
<meta name="twitter:image"       content="{img}"/>
<link rel="canonical"            href="{can}"/>
<meta http-equiv="refresh" content="0;url={dst}"/>
</head>
<body>
<script>window.location.replace("{dst}");</script>
<p><a href="{dst}">{t}</a></p>
</body>
</html>"""
    return HTMLResponse(content=content, status_code=200)


# ── Book ─────────────────────────────────────────────────────────────────────

@router.get("/book/{book_id}", response_class=HTMLResponse)
async def og_book(book_id: int, db: Session = Depends(get_db)):
    book  = db.query(Book).filter(Book.id == book_id).first()
    title = f"{book.title} — {book.author}" if book else SITE_NAME
    desc  = (book.description or "") if book else ""
    image = (book.thumbnail_url or DEFAULT_IMAGE) if book else DEFAULT_IMAGE
    dest  = f"{FRONTEND}/kitoblar/{book_id}" if book else f"{FRONTEND}/kitoblar"
    return _og_html(title, desc, image, dest, f"{BACKEND}/api/og/book/{book_id}")


# ── Quiz ─────────────────────────────────────────────────────────────────────

@router.get("/quiz/{quiz_id}", response_class=HTMLResponse)
async def og_quiz(quiz_id: int, db: Session = Depends(get_db)):
    quiz  = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    title = quiz.title if quiz else SITE_NAME
    desc  = (quiz.description or f"{quiz.total_questions or 0} ta savol · {quiz.category or 'Umumiy'}") if quiz else ""
    dest  = f"{FRONTEND}/testlar/{quiz_id}" if quiz else f"{FRONTEND}/testlar"
    return _og_html(title, desc, DEFAULT_IMAGE, dest, f"{BACKEND}/api/og/quiz/{quiz_id}")


# ── Course ───────────────────────────────────────────────────────────────────

@router.get("/course/{course_id}", response_class=HTMLResponse)
async def og_course(course_id: int, db: Session = Depends(get_db)):
    try:
        row = db.execute(_text("""
            SELECT title, description, thumbnail_url
            FROM courses WHERE id = :cid
        """), {"cid": course_id}).fetchone()
    except Exception:
        row = None
    title = (row.title or "Kurs") if row else SITE_NAME
    desc  = (row.description or "") if row else ""
    image = (row.thumbnail_url or DEFAULT_IMAGE) if row else DEFAULT_IMAGE
    dest  = f"{FRONTEND}/courses/{course_id}" if row else f"{FRONTEND}/courses"
    return _og_html(title, desc, image, dest, f"{BACKEND}/api/og/course/{course_id}")


# ── Donation (Qo'llab-quvvatlash, 095) ──────────────────────────────────────
# Static page, no per-entity DB lookup — this is the link meant to be shared
# in the Telegram channel/website so it gets a real preview card instead of
# whatever the SPA's generic index.html meta tags say for this path.

@router.get("/donation", response_class=HTMLResponse)
async def og_donation():
    return _og_html(
        "Qo'llab-quvvatlash",
        "Sahifalab har kuni minglab o'quvchi uchun bepul. Xohlagan miqdorda qo'shilishingiz — ilovani tirik saqlaydi.",
        DEFAULT_IMAGE,
        f"{FRONTEND}/qollab-quvvatlash",
        f"{BACKEND}/api/og/donation",
    )


# ── Post (social feed) ───────────────────────────────────────────────────────

@router.get("/post/{post_id}", response_class=HTMLResponse)
async def og_post(post_id: int, db: Session = Depends(get_db)):
    try:
        row = db.execute(_text("""
            SELECT p.content, p.image_url,
                   pr.first_name, pr.site_username
            FROM posts p
            JOIN profiles pr ON pr.telegram_id = p.author_id
            WHERE p.id = :pid
        """), {"pid": post_id}).fetchone()
    except Exception:
        row = None

    if row:
        author  = row.first_name or row.site_username or "Foydalanuvchi"
        snippet = (row.content or "").replace("\n", " ")
        title   = f"{author}: {snippet[:60]}{'…' if len(snippet) > 60 else ''}"
        desc    = snippet
        image   = row.image_url or DEFAULT_IMAGE
        dest    = f"{FRONTEND}/feed?post={post_id}"
    else:
        title = SITE_NAME
        desc  = "SAHIFALAB ijtimoiy tarmog'i"
        image = DEFAULT_IMAGE
        dest  = f"{FRONTEND}/feed"

    return _og_html(title, desc, image, dest, f"{BACKEND}/api/og/post/{post_id}")
