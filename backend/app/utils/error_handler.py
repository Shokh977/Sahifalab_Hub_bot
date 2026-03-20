"""
Standardized error handling utilities for SAHIFALAB API
"""
from typing import Any, Dict, Optional
from datetime import datetime, UTC
from fastapi import HTTPException, status
from enum import Enum

class ErrorCode(str, Enum):
    """Standardized error codes"""
    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    CONFLICT = "CONFLICT"
    RATE_LIMIT = "RATE_LIMIT"
    SERVER_ERROR = "SERVER_ERROR"
    BAD_REQUEST = "BAD_REQUEST"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"

class APIError:
    """Standardized API error response"""
    
    def __init__(
        self,
        code: ErrorCode,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Optional[Dict[str, Any]] = None,
        path: Optional[str] = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        self.path = path
        self.timestamp = datetime.now(UTC).isoformat()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to response format"""
        return {
            "success": False,
            "error": {
                "code": self.code.value,
                "message": self.message,
                "details": self.details if self.details else None,
            },
            "timestamp": self.timestamp,
            "path": self.path,
        }
    
    def to_exception(self) -> HTTPException:
        """Convert to HTTPException"""
        return HTTPException(
            status_code=self.status_code,
            detail=self.to_dict(),
        )


# Common errors
class ValidationError(APIError):
    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(
            code=ErrorCode.VALIDATION_ERROR,
            message=message,
            status_code=status.HTTP_400_BAD_REQUEST,
            details=details,
        )


class NotFoundError(APIError):
    def __init__(self, resource: str, resource_id: Any = None):
        message = f"{resource} not found"
        if resource_id:
            message += f" (ID: {resource_id})"
        super().__init__(
            code=ErrorCode.NOT_FOUND,
            message=message,
            status_code=status.HTTP_404_NOT_FOUND,
        )


class UnauthorizedError(APIError):
    def __init__(self, message: str = "Authentication required"):
        super().__init__(
            code=ErrorCode.UNAUTHORIZED,
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED,
        )


class ForbiddenError(APIError):
    def __init__(self, message: str = "Permission denied"):
        super().__init__(
            code=ErrorCode.FORBIDDEN,
            message=message,
            status_code=status.HTTP_403_FORBIDDEN,
        )


class ConflictError(APIError):
    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(
            code=ErrorCode.CONFLICT,
            message=message,
            status_code=status.HTTP_409_CONFLICT,
            details=details,
        )


class RateLimitError(APIError):
    def __init__(self, message: str = "Rate limit exceeded"):
        super().__init__(
            code=ErrorCode.RATE_LIMIT,
            message=message,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        )


class ServerError(APIError):
    def __init__(self, message: str = "Internal server error", details: Optional[Dict] = None):
        super().__init__(
            code=ErrorCode.SERVER_ERROR,
            message=message,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            details=details,
        )


# Success response wrapper
def success_response(data: Any, message: str = "Success") -> Dict[str, Any]:
    """Wrap successful response"""
    return {
        "success": True,
        "data": data,
        "message": message,
        "timestamp": datetime.now(UTC).isoformat(),
    }
