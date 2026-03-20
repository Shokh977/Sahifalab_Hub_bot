from fastapi import Request, HTTPException, status
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, Tuple
import asyncio

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
        """Extract client identifier from request (IP address)"""
        client_host = request.client.host if request.client else "unknown"
        return client_host
    
    async def check_rate_limit(self, request: Request) -> bool:
        """
        Check if request exceeds rate limit.
        Returns True if request is allowed, False if it exceeds limit.
        """
        client_id = self.get_client_id(request)
        now = datetime.utcnow()
        
        async with self.lock:
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
    
    def get_remaining_requests(self, request: Request) -> Dict[str, int]:
        """Get remaining requests for this client"""
        client_id = self.get_client_id(request)
        now = datetime.utcnow()
        
        history = self.request_history[client_id]
        
        # Clean old entries
        history = [
            (timestamp, method, endpoint)
            for timestamp, method, endpoint in history
            if now - timestamp < timedelta(hours=24)
        ]
        
        # Count requests in different windows
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
        remaining = rate_limiter.get_remaining_requests(request)
        
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
    remaining = rate_limiter.get_remaining_requests(request)
    response.headers["X-RateLimit-Remaining-Minute"] = str(remaining["remaining_per_minute"])
    response.headers["X-RateLimit-Remaining-Hour"] = str(remaining["remaining_per_hour"])
    response.headers["X-RateLimit-Remaining-Day"] = str(remaining["remaining_per_day"])
    
    return response
