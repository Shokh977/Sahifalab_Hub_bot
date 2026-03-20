import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional
from pathlib import Path
import sys

class JsonFormatter(logging.Formatter):
    """Custom formatter that outputs structured JSON logs"""
    
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = {
                "type": record.exc_info[0].__name__,
                "message": str(record.exc_info[1]),
            }
        
        # Add custom attributes if present
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        if hasattr(record, "endpoint"):
            log_data["endpoint"] = record.endpoint
        if hasattr(record, "method"):
            log_data["method"] = record.method
        if hasattr(record, "status_code"):
            log_data["status_code"] = record.status_code
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms
        
        return json.dumps(log_data)


def setup_logger(
    name: str,
    log_file: Optional[str] = None,
    level: int = logging.INFO,
) -> logging.Logger:
    """
    Setup a structured logger with JSON formatting.
    
    Args:
        name: Logger name
        log_file: Optional path to log file
        level: Logging level
    
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # Remove existing handlers to avoid duplicates
    logger.handlers = []
    
    # Create formatter
    formatter = JsonFormatter()
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # File handler (optional)
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(level)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger


class RequestLogger:
    """Utility class for logging HTTP requests and responses"""
    
    def __init__(self, logger: logging.Logger):
        self.logger = logger
    
    def log_request(
        self,
        method: str,
        endpoint: str,
        user_id: Optional[int] = None,
        request_id: Optional[str] = None,
        **kwargs,
    ):
        """Log incoming request"""
        extra = {
            "method": method,
            "endpoint": endpoint,
            "request_id": request_id,
        }
        if user_id:
            extra["user_id"] = user_id
        
        extra.update(kwargs)
        
        logger_record = logging.LogRecord(
            name=self.logger.name,
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg=f"Request: {method} {endpoint}",
            args=(),
            exc_info=None,
        )
        
        for key, value in extra.items():
            setattr(logger_record, key, value)
        
        self.logger.handle(logger_record)
    
    def log_response(
        self,
        method: str,
        endpoint: str,
        status_code: int,
        duration_ms: float,
        user_id: Optional[int] = None,
        request_id: Optional[str] = None,
        **kwargs,
    ):
        """Log outgoing response"""
        level = logging.INFO if 200 <= status_code < 300 else logging.WARNING
        
        extra = {
            "method": method,
            "endpoint": endpoint,
            "status_code": status_code,
            "duration_ms": duration_ms,
            "request_id": request_id,
        }
        if user_id:
            extra["user_id"] = user_id
        
        extra.update(kwargs)
        
        logger_record = logging.LogRecord(
            name=self.logger.name,
            level=level,
            pathname="",
            lineno=0,
            msg=f"Response: {status_code} {method} {endpoint} ({duration_ms:.2f}ms)",
            args=(),
            exc_info=None,
        )
        
        for key, value in extra.items():
            setattr(logger_record, key, value)
        
        self.logger.handle(logger_record)
    
    def log_error(
        self,
        error: Exception,
        endpoint: str,
        user_id: Optional[int] = None,
        request_id: Optional[str] = None,
        **kwargs,
    ):
        """Log error"""
        extra = {
            "endpoint": endpoint,
            "error_type": type(error).__name__,
            "request_id": request_id,
        }
        if user_id:
            extra["user_id"] = user_id
        
        extra.update(kwargs)
        
        logger_record = logging.LogRecord(
            name=self.logger.name,
            level=logging.ERROR,
            pathname="",
            lineno=0,
            msg=f"Error: {str(error)}",
            args=(),
            exc_info=(type(error), error, error.__traceback__),
        )
        
        for key, value in extra.items():
            setattr(logger_record, key, value)
        
        self.logger.handle(logger_record)


# Create module-level logger
app_logger = setup_logger(
    name="sahifalab_app",
    log_file="logs/app.log",
    level=logging.INFO,
)

request_logger = RequestLogger(app_logger)

# Export convenience functions
info = app_logger.info
debug = app_logger.debug
warning = app_logger.warning
error = app_logger.error
critical = app_logger.critical
