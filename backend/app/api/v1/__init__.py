from fastapi import APIRouter

from app.api.v1 import auth
from app.api.v1.endpoints import hero, quizzes, books, resources, admin, audio, ai, teacher, courses, lessons, enrollments, upload, pay, profiles, analytics, notifications, xp, planner, wallet, stream
from app.api.v1 import social_routes, messenger_routes

api_router = APIRouter()

# Authentication routes
api_router.include_router(auth.router, tags=["auth"])

# ── Active routes (used by frontend) ──────────────────────────────────────────
api_router.include_router(hero.router, prefix="/hero", tags=["hero"])
api_router.include_router(quizzes.router, prefix="/quizzes", tags=["quizzes"])
api_router.include_router(books.router, prefix="/books", tags=["books"])
api_router.include_router(resources.router, prefix="/resources", tags=["resources"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
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

# NOTE: Legacy scaffolding modules (users, orders, cart, products) are NOT
# mounted. They have zero authentication and were never used by the frontend.
# The files remain in endpoints/ for reference but are deliberately excluded
# from the live router to eliminate unauthenticated CRUD attack surface.

# Social ecosystem
api_router.include_router(social_routes.router)
api_router.include_router(messenger_routes.router)
