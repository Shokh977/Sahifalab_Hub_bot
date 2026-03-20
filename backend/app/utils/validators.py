"""
Input validation and sanitization utilities
"""
import re
from typing import Any, Optional
from app.utils.error_handler import ValidationError

class InputValidator:
    """Validates and sanitizes user inputs"""
    
    # SQL injection patterns
    SQL_INJECTION_PATTERNS = [
        r"(\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|SCRIPT|JAVASCRIPT|ONERROR)\b)",
        r"(--|#|;|'|\"|`)",
    ]
    
    # XSS patterns
    XSS_PATTERNS = [
        r"<script[^>]*>.*?</script>",
        r"javascript:",
        r"on(load|click|error|submit|mouse)",
    ]
    
    @staticmethod
    def validate_string(
        value: Any,
        field_name: str,
        min_length: int = 1,
        max_length: int = 10000,
        allow_html: bool = False,
    ) -> str:
        """Validate string input"""
        if not isinstance(value, str):
            raise ValidationError(f"{field_name} must be a string")
        
        value = value.strip()
        
        if len(value) < min_length:
            raise ValidationError(f"{field_name} is too short (min {min_length} chars)")
        
        if len(value) > max_length:
            raise ValidationError(f"{field_name} is too long (max {max_length} chars)")
        
        if not allow_html:
            InputValidator._check_xss(value, field_name)
        
        InputValidator._check_sql_injection(value, field_name)
        
        return value
    
    @staticmethod
    def validate_email(email: str) -> str:
        """Validate email format"""
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(pattern, email):
            raise ValidationError("Invalid email format")
        return email.lower()
    
    @staticmethod
    def validate_integer(
        value: Any,
        field_name: str,
        min_value: Optional[int] = None,
        max_value: Optional[int] = None,
    ) -> int:
        """Validate integer input"""
        try:
            value = int(value)
        except (ValueError, TypeError):
            raise ValidationError(f"{field_name} must be an integer")
        
        if min_value is not None and value < min_value:
            raise ValidationError(f"{field_name} must be >= {min_value}")
        
        if max_value is not None and value > max_value:
            raise ValidationError(f"{field_name} must be <= {max_value}")
        
        return value
    
    @staticmethod
    def validate_list(
        value: Any,
        field_name: str,
        min_items: int = 0,
        max_items: Optional[int] = None,
    ) -> list:
        """Validate list input"""
        if not isinstance(value, list):
            raise ValidationError(f"{field_name} must be a list")
        
        if len(value) < min_items:
            raise ValidationError(f"{field_name} must have at least {min_items} items")
        
        if max_items and len(value) > max_items:
            raise ValidationError(f"{field_name} can have at most {max_items} items")
        
        return value
    
    @staticmethod
    def sanitize_html(html: str) -> str:
        """Remove potentially dangerous HTML"""
        # Remove script tags
        html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.IGNORECASE | re.DOTALL)
        
        # Remove event handlers
        html = re.sub(r"\s*on\w+\s*=\s*['\"].*?['\"]", "", html, flags=re.IGNORECASE)
        
        # Remove dangerous attributes
        html = re.sub(r"\s*(javascript:|data:|vbscript:)", "", html, flags=re.IGNORECASE)
        
        return html.strip()
    
    @staticmethod
    def _check_sql_injection(value: str, field_name: str) -> None:
        """Check for SQL injection attempts"""
        value_upper = value.upper()
        for pattern in InputValidator.SQL_INJECTION_PATTERNS:
            if re.search(pattern, value_upper, re.IGNORECASE):
                raise ValidationError(f"{field_name} contains invalid characters")
    
    @staticmethod
    def _check_xss(value: str, field_name: str) -> None:
        """Check for XSS attempts"""
        for pattern in InputValidator.XSS_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                raise ValidationError(f"{field_name} contains invalid content")


class DataSanitizer:
    """Sanitizes data before storing in database"""
    
    @staticmethod
    def sanitize_dict(data: dict) -> dict:
        """Sanitize all string values in a dictionary"""
        sanitized = {}
        for key, value in data.items():
            if isinstance(value, str):
                sanitized[key] = value.strip()
            else:
                sanitized[key] = value
        return sanitized
    
    @staticmethod
    def remove_null_values(data: dict) -> dict:
        """Remove None values from dictionary"""
        return {k: v for k, v in data.items() if v is not None}
