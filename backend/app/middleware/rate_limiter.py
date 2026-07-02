from fastapi import Request, HTTPException, status
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, Tuple
import asyncio
import logging

logger = logging.getLogger(__name__)

# Maximum unique IPs tracked before forced eviction
_MAX_TRACKED_IPS = 50_000


class RateLimiter:
    """
    Rate limiter for protecting API endpoints from abuse.
    Tracks requests by IP address and user ID.
    """
    
    def __init__(
        self,
        requests_per_minute: int = 100,
        requests_per_hour: int = 1000,
        requests_per_day: int = 10000,
    ):
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        self.requests_per_day = requests_per_day
        
        # Storage for request history: {identifier: [(timestamp, method, endpoint), ...]}
        self.request_history: Dict[str, list] = defaultdict(list)
        
        # Lock for thread-safe operations
        self.lock = asyncio.Lock()
    
    def get_client_id(self, request: Request) -> str:
        """
        Extract client identifier from request.
        Uses X-Forwarded-For header (set by Railway/proxy) with
        fallback to request.client.host.
        Takes the leftmost (original client) IP from X-Forwarded-For.
        """
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # X-Forwarded-For: client, proxy1, proxy2 — take the leftmost
            client_ip = forwarded.split(",")[0].strip()
            if client_ip:
                return client_ip
        return request.client.host if request.client else "unknown"
    
    async def _evict_stale_entries(self):
        """Remove stale IP entries and cap total tracked IPs to prevent unbounded memory growth."""
        now = datetime.utcnow()
        cutoff = now - timedelta(hours=24)
        
        # Remove all entries older than 24h
        stale_keys = [
            key for key, history in self.request_history.items()
            if not history or history[-1][0] < cutoff
        ]
        for key in stale_keys:
            del self.request_history[key]
        
        # If still over limit, evict oldest IPs
        if len(self.request_history) > _MAX_TRACKED_IPS:
            # Sort by most recent request, evict oldest
            sorted_ips = sorted(
                self.request_history.keys(),
                key=lambda k: self.request_history[k][-1][0] if self.request_history[k] else datetime.min,
            )
            to_evict = len(self.request_history) - _MAX_TRACKED_IPS
            for key in sorted_ips[:to_evict]:
                del self.request_history[key]

    async def check_rate_limit(self, request: Request) -> bool:
        """
        Check if request exceeds rate limit.
        Returns True if request is allowed, False if it exceeds limit.
        """
        client_id = self.get_client_id(request)
        now = datetime.utcnow()
        
        async with self.lock:
            # Periodic cleanup: evict stale entries every 1000 requests
            total_entries = sum(len(v) for v in self.request_history.values())
            if total_entries > 5000 or len(self.request_history) > _MAX_TRACKED_IPS:
                await self._evict_stale_entries()

            # Get request history for this client
            history = self.request_history[client_id]
            
            # Remove old entries (older than 24 hours)
            history = [
                (timestamp, method, endpoint)
                for timestamp, method, endpoint in history
                if now - timestamp < timedelta(hours=24)
            ]
            
            # Check minute limit
            minute_ago = now - timedelta(minutes=1)
            minute_requests = sum(1 for ts, _, _ in history if ts > minute_ago)
            if minute_requests >= self.requests_per_minute:
                return False
            
            # Check hour limit
            hour_ago = now - timedelta(hours=1)
            hour_requests = sum(1 for ts, _, _ in history if ts > hour_ago)
            if hour_requests >= self.requests_per_hour:
                return False
            
            # Check day limit
            day_requests = len(history)
            if day_requests >= self.requests_per_day:
                return False
            
            # Add current request to history
            history.append((now, request.method, request.url.path))
            self.request_history[client_id] = history
            
            return True
    
    async def get_remaining_requests(self, request: Request) -> Dict[str, int]:
        """Get remaining requests for this client (lock-protected read)."""
        client_id = self.get_client_id(request)
        now = datetime.utcnow()

        async with self.lock:
            history = [
                entry for entry in self.request_history[client_id]
                if now - entry[0] < timedelta(hours=24)
            ]

        minute_ago = now - timedelta(minutes=1)
        hour_ago = now - timedelta(hours=1)

        minute_requests = sum(1 for ts, _, _ in history if ts > minute_ago)
        hour_requests = sum(1 for ts, _, _ in history if ts > hour_ago)
        day_requests = len(history)

        return {
            "remaining_per_minute": max(0, self.requests_per_minute - minute_requests),
            "remaining_per_hour": max(0, self.requests_per_hour - hour_requests),
            "remaining_per_day": max(0, self.requests_per_day - day_requests),
        }


# Global rate limiter instance
rate_limiter = RateLimiter(
    requests_per_minute=100,
    requests_per_hour=1000,
    requests_per_day=10000,
)


async def rate_limit_middleware(request: Request, call_next):
    """
    Middleware to check rate limits on all incoming requests
    """
    # Check rate limit
    allowed = await rate_limiter.check_rate_limit(request)
    
    if not allowed:
        # Get remaining requests info
        remaining = await rate_limiter.get_remaining_requests(request)

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "RATE_LIMIT_EXCEEDED",
                "message": "Too many requests. Please try again later.",
                "remaining": remaining,
            },
        )

    response = await call_next(request)

    # Add rate limit headers to response
    remaining = await rate_limiter.get_remaining_requests(request)
    response.headers["X-RateLimit-Remaining-Minute"] = str(remaining["remaining_per_minute"])
    response.headers["X-RateLimit-Remaining-Hour"] = str(remaining["remaining_per_hour"])
    response.headers["X-RateLimit-Remaining-Day"] = str(remaining["remaining_per_day"])
    
    return response
