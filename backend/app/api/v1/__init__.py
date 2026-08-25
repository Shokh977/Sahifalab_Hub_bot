from fastapi import APIRouter

from app.api.v1 import auth
from app.api.v1.endpoints import hero, quizzes, books, resources, admin, admin_decks, admin_challenges, admin_reports, admin_ai_usage, audio, ai, teacher, courses, lessons, enrollments, upload, pay, profiles, analytics, notifications, xp, planner, wallet, stream, cron, jobs, certificates, settings, og, focus, leaderboard, achievements, activity, streaks, flashcards, announcements, tests, challenges
from app.api.v1.endpoints.profile_public import profile_router, skills_router
from app.api.v1.endpoints.connections import router as connections_router
from app.api.v1.endpoints.search import router as search_router
from app.api.v1 import social_routes, messenger_routes, group_routes

api_router = APIRouter()

# Authentication routes
api_router.include_router(auth.router, tags=["auth"])

# ── Active routes (used by frontend) ──────────────────────────────────────────
api_router.include_router(hero.router, prefix="/hero", tags=["hero"])
api_router.include_router(quizzes.router, prefix="/quizzes", tags=["quizzes"])
api_router.include_router(books.router, prefix="/books", tags=["books"])
api_router.include_router(resources.router, prefix="/resources", tags=["resources"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(admin_decks.router, prefix="/admin/decks", tags=["admin"])
api_router.include_router(admin_challenges.router, prefix="/admin/challenges", tags=["admin"])
api_router.include_router(admin_reports.router, prefix="/admin/reports", tags=["admin"])
api_router.include_router(admin_ai_usage.router, prefix="/admin/ai-usage", tags=["admin"])
api_router.include_router(audio.router, prefix="/audio", tags=["audio"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(teacher.router, prefix="/teacher", tags=["teacher"])
api_router.include_router(courses.router, prefix="/courses", tags=["courses"])
api_router.include_router(lessons.router, prefix="/lessons", tags=["lessons"])
api_router.include_router(enrollments.router, prefix="/enrollments", tags=["enrollments"])
api_router.include_router(upload.router,  prefix="/upload",  tags=["upload"])
api_router.include_router(stream.router, prefix="/stream",  tags=["stream"])
api_router.include_router(pay.router,    prefix="/pay",     tags=["pay"])
api_router.include_router(profiles.router, prefix="/profiles", tags=["profiles"])
api_router.include_router(xp.router, prefix="/xp", tags=["xp"])
api_router.include_router(planner.router, prefix="/planner", tags=["planner"])
api_router.include_router(wallet.router, prefix="/teacher", tags=["wallet"])
api_router.include_router(analytics.router, tags=["analytics"])
api_router.include_router(notifications.router, tags=["notifications"])
api_router.include_router(profile_router,     prefix="/profile",     tags=["profile"])
api_router.include_router(skills_router,      prefix="/skills",      tags=["skills"])
api_router.include_router(connections_router, prefix="/connections", tags=["connections"])
api_router.include_router(search_router,      prefix="/search",      tags=["search"])

# NOTE: Legacy scaffolding modules (users, orders, cart, products) are NOT
# mounted. They have zero authentication and were never used by the frontend.
# The files remain in endpoints/ for reference but are deliberately excluded
# from the live router to eliminate unauthenticated CRUD attack surface.

# Social ecosystem — mounted under /v1 to match frontend expectations
api_router.include_router(social_routes.router,   prefix="/v1")
api_router.include_router(messenger_routes.router, prefix="/v1")
api_router.include_router(group_routes.router,     prefix="/v1")

# Jobs & Certificates
api_router.include_router(jobs.router,         prefix="/jobs")
api_router.include_router(certificates.router, prefix="/certificates")

# User settings
api_router.include_router(settings.router)

# OG redirect — dynamic link previews for Telegram/Twitter/Facebook
api_router.include_router(og.router, prefix="/og", tags=["og"])

# Study focus sessions & leaderboard
api_router.include_router(focus.router,       prefix="/focus",       tags=["focus"])
api_router.include_router(leaderboard.router, prefix="/leaderboard", tags=["leaderboard"])

# Profile gamification
api_router.include_router(achievements.router, prefix="/achievements", tags=["achievements"])
api_router.include_router(activity.router,     prefix="/activity",     tags=["activity"])

# Streak system — freeze purchase, freeze use, streak detail
api_router.include_router(streaks.router, prefix="/streaks", tags=["streaks"])

# Flashcard system — spaced repetition study
api_router.include_router(flashcards.router, prefix="/flashcards", tags=["flashcards"])

# Course lesson quiz/test system
api_router.include_router(tests.router, prefix="/tests", tags=["tests"])

# Broadcast announcements (modal on app launch)
api_router.include_router(announcements.router, prefix="/announcements", tags=["announcements"])

# Musobaqalar — cohort focus challenges (step-21)
api_router.include_router(challenges.router, prefix="/challenges", tags=["challenges"])

# Internal maintenance (secret-key protected)
api_router.include_router(cron.router)
