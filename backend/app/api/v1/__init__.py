from fastapi import APIRouter

from app.api.v1 import auth
from app.api.v1.endpoints import users, products, orders, cart, hero, quizzes, books, resources, admin, payments, audio, ai, teacher, courses, lessons, enrollments, upload, pay, profiles, analytics, notifications, xp, planner
from app.api.v1 import social_routes, messenger_routes

api_router = APIRouter()

# Authentication routes
api_router.include_router(auth.router, tags=["auth"])

# Existing routes
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(cart.router, prefix="/cart", tags=["cart"])
api_router.include_router(hero.router, prefix="/hero", tags=["hero"])
api_router.include_router(quizzes.router, prefix="/quizzes", tags=["quizzes"])
api_router.include_router(books.router, prefix="/books", tags=["books"])
api_router.include_router(resources.router, prefix="/resources", tags=["resources"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(payments.router, prefix="/payments", tags=["payments"])
api_router.include_router(audio.router, prefix="/audio", tags=["audio"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(teacher.router, prefix="/teacher", tags=["teacher"])
api_router.include_router(courses.router, prefix="/courses", tags=["courses"])
api_router.include_router(lessons.router, prefix="/lessons", tags=["lessons"])
api_router.include_router(enrollments.router, prefix="/enrollments", tags=["enrollments"])
api_router.include_router(upload.router,  prefix="/upload",  tags=["upload"])
api_router.include_router(pay.router,    prefix="/pay",     tags=["pay"])
api_router.include_router(profiles.router, prefix="/profiles", tags=["profiles"])
api_router.include_router(xp.router, prefix="/xp", tags=["xp"])
api_router.include_router(planner.router, prefix="/planner", tags=["planner"])
api_router.include_router(analytics.router, tags=["analytics"])
api_router.include_router(notifications.router, tags=["notifications"])

# Social ecosystem
api_router.include_router(social_routes.router)
api_router.include_router(messenger_routes.router)
