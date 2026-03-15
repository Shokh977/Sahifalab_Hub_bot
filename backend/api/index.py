# Vercel Python runtime v3+ detects ASGI apps by the variable name `app`.
# No Mangum wrapper needed — it was causing issubclass() TypeError.
from app.main import app  # noqa: F401 — re-exported for Vercel
