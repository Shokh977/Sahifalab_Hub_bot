FROM python:3.11-slim

WORKDIR /app

# Ensure Python output is sent straight to Railway logs (no buffering)
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# System deps for SQL drivers/builds
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies from backend service
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend app code
COPY backend/ .

# Railway injects PORT automatically
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
