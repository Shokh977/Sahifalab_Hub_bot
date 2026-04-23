"""
OG redirect endpoints — /api/og/{type}/{id}

Telegram's link-preview bot fetches the URL server-side *before* JavaScript
runs, so react-helmet OG tags are invisible to it.  These endpoints return
a minimal static HTML page that:
  1. Contains the correct og:title / og:description / og:image tags
  2. Immediately redirects browsers to the real SPA URL

Share any content using  {API_BASE}/api/og/book/5  instead of the SPA URL,
and Telegram will display a rich preview while users still land on the SPA.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import text as _text
from app.db.session import get_db
from app.models.models import Book, Quiz

router = APIRouter()

FRONTEND = "https://sahifalab-hub-bot.vercel.app"
DEFAULT_IMAGE = f"{FRONTEND}/sahifalab.jpg"
SITE_NAME = "SAHIFALAB"


def _html(title: str, description: str, image: str, dest: str) -> HTMLResponse:
    """Return a minimal OG meta page that instantly redirects to `dest`."""
    title       = title.replace('"', '&quot;')
    description = description.replace('"', '&quot;')
    image       = image or DEFAULT_IMAGE
    content = f"""<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="utf-8"/>
<title>{title} | {SITE_NAME}</title>
<meta name="description" content="{description}"/>
<meta property="og:type"        content="website"/>
<meta property="og:site_name"   content="{SITE_NAME}"/>
<meta property="og:title"       content="{title}"/>
<meta property="og:description" content="{description}"/>
<meta property="og:image"       content="{image}"/>
<meta property="og:url"         content="{dest}"/>
<meta name="twitter:card"        content="summary_large_image"/>
<meta name="twitter:title"       content="{title}"/>
<meta name="twitter:description" content="{description}"/>
<meta name="twitter:image"       content="{image}"/>
<meta http-equiv="refresh" content="0;url={dest}"/>
</head>
<body>
<script>window.location.replace("{dest}");</script>
<p><a href="{dest}">{title}</a></p>
</body>
</html>"""
    return HTMLResponse(content=content, status_code=200)


# ── Book ─────────────────────────────────────────────────────────────────────

@router.get("/book/{book_id}", response_class=HTMLResponse)
async def og_book(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id, Book.is_available == True).first()
    if not book:
        return RedirectResponse(f"{FRONTEND}/kitoblar")
    title = f"{book.title} — {book.author}"
    desc  = (book.description or "")[:200]
    image = book.thumbnail_url or DEFAULT_IMAGE
    dest  = f"{FRONTEND}/kitoblar/{book_id}"
    return _html(title, desc, image, dest)


# ── Quiz ─────────────────────────────────────────────────────────────────────

@router.get("/quiz/{quiz_id}", response_class=HTMLResponse)
async def og_quiz(quiz_id: int, db: Session = Depends(get_db)):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        return RedirectResponse(f"{FRONTEND}/testlar")
    title = quiz.title
    desc  = quiz.description or f"{quiz.total_questions or 0} ta savol · {quiz.category or 'Umumiy'}"
    image = DEFAULT_IMAGE
    dest  = f"{FRONTEND}/testlar/{quiz_id}"
    return _html(title, desc, image, dest)


# ── Course ───────────────────────────────────────────────────────────────────

@router.get("/course/{course_id}", response_class=HTMLResponse)
async def og_course(course_id: int, db: Session = Depends(get_db)):
    try:
        row = db.execute(_text("""
            SELECT title, description, thumbnail_url
            FROM courses
            WHERE id = :cid AND is_published = true
        """), {"cid": course_id}).fetchone()
    except Exception:
        row = None
    if not row:
        return RedirectResponse(f"{FRONTEND}/courses")
    title = row.title or "Kurs"
    desc  = (row.description or "")[:200]
    image = row.thumbnail_url or DEFAULT_IMAGE
    dest  = f"{FRONTEND}/courses/{course_id}"
    return _html(title, desc, image, dest)


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

    if not row:
        return RedirectResponse(f"{FRONTEND}/feed")

    author = row.first_name or row.site_username or "Foydalanuvchi"
    snippet = (row.content or "")[:120].replace("\n", " ")
    title   = f"{author} yozdi: {snippet[:60]}…" if len(snippet) > 60 else f"{author}: {snippet}"
    desc    = (row.content or "")[:200]
    image   = row.image_url or DEFAULT_IMAGE
    dest    = f"{FRONTEND}/feed?post={post_id}"
    return _html(title, desc, image, dest)
