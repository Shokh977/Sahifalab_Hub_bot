#!/usr/bin/env sh
set -e

# Support both Docker layouts:
# 1) /app/app (when backend files are copied to /app)
# 2) /app/backend/app (when whole monorepo is copied)
if [ -d "/app/backend/app" ]; then
	cd /app/backend
elif [ -d "/app/app" ]; then
	cd /app
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips "*"
