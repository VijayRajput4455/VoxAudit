from contextvars import ContextVar
from datetime import datetime, timezone
import json
import logging
from logging.handlers import RotatingFileHandler
import os
import sys
import time
from typing import Any, Callable, Dict, Union
import uuid

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

# Context variable for request correlation ID
request_id_var: ContextVar[Union[str, None]] = ContextVar("request_id", default=None)


def get_request_id() -> Union[str, None]:
    return request_id_var.get()


def set_request_id(req_id: Union[str, None]) -> None:
    request_id_var.set(req_id)


# Sensitive fields that must be redacted from log outputs
SENSITIVE_KEYS = {
    "password",
    "pass",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "authorization",
    "auth",
    "api_key",
    "apikey",
    "audio_data",
    "audio_bytes",
    "embedding",
    "embeddings",
    "vector",
}


def sanitize_data(data: Any) -> Any:
    """Recursively sanitize sensitive key-value pairs in dictionaries or sequences."""
    if isinstance(data, dict):
        sanitized = {}
        for key, value in data.items():
            if str(key).lower() in SENSITIVE_KEYS:
                sanitized[key] = "***REDACTED***"
            else:
                sanitized[key] = sanitize_data(value)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_data(item) for item in data]
    elif isinstance(data, tuple):
        return tuple(sanitize_data(item) for item in data)
    elif isinstance(data, str):
        # Basic string masking for auth tokens
        if "Bearer " in data:
            return "Bearer ***REDACTED***"
        return data
    return data


class JSONFormatter(logging.Formatter):
    """Production-grade JSON Log Formatter."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "service": settings.APP_NAME,
            "environment": settings.ENVIRONMENT,
            "request_id": get_request_id(),
            "logger": record.name,
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "message": record.getMessage(),
        }

        # Handle exception traceback if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Include custom extra fields if passed via extra={}
        standard_args = {
            "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
            "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
            "created", "msecs", "relativeCreated", "thread", "threadName",
            "processName", "process", "message", "taskName"
        }
        extra_fields = {}
        for k, v in record.__dict__.items():
            if k not in standard_args:
                if str(k).lower() in SENSITIVE_KEYS:
                    extra_fields[k] = "***REDACTED***"
                else:
                    extra_fields[k] = sanitize_data(v)

        if extra_fields:
            log_entry["extra"] = extra_fields

        return json.dumps(log_entry)


class CorrelationIDMiddleware(BaseHTTPMiddleware):
    """FastAPI Middleware to manage Request Correlation ID and HTTP access logging."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Any]) -> Response:
        req_id = (
            request.headers.get("X-Request-ID")
            or request.headers.get("X-Correlation-ID")
            or str(uuid.uuid4())
        )
        set_request_id(req_id)

        logger = logging.getLogger("app.access")
        start_time = time.perf_counter()

        logger.info(
            f"Incoming request: {request.method} {request.url.path}",
            extra={
                "http_method": request.method,
                "http_path": request.url.path,
                "client_ip": request.client.host if request.client else None,
            },
        )

        try:
            response = await call_next(request)
            process_time_ms = round((time.perf_counter() - start_time) * 1000, 2)

            logger.info(
                f"Completed request: {request.method} {request.url.path} - {response.status_code} ({process_time_ms}ms)",
                extra={
                    "http_method": request.method,
                    "http_path": request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": process_time_ms,
                },
            )

            response.headers["X-Request-ID"] = req_id
            return response

        except Exception as exc:
            process_time_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(
                f"Failed request: {request.method} {request.url.path} - {str(exc)} ({process_time_ms}ms)",
                exc_info=True,
                extra={
                    "http_method": request.method,
                    "http_path": request.url.path,
                    "duration_ms": process_time_ms,
                },
            )
            raise exc


class SafeRotatingFileHandler(RotatingFileHandler):
    """
    Process-safe and Windows-friendly RotatingFileHandler.
    Prevents PermissionError (WinError 32) when multiple processes or reloader threads
    attempt log rotation on Windows while log files are held open.
    """

    def rotate(self, source: str, dest: str) -> None:
        if callable(self.rotator):
            self.rotator(source, dest)
        else:
            if os.path.exists(source):
                try:
                    if os.path.exists(dest):
                        try:
                            os.remove(dest)
                        except (PermissionError, OSError):
                            pass
                    os.rename(source, dest)
                except (PermissionError, OSError):
                    pass

    def doRollover(self) -> None:
        if self.stream:
            self.stream.close()
            self.stream = None

        if self.backupCount > 0:
            for i in range(self.backupCount - 1, 0, -1):
                sfn = self.rotation_filename(f"{self.baseFilename}.{i}")
                dfn = self.rotation_filename(f"{self.baseFilename}.{i + 1}")
                if os.path.exists(sfn):
                    if os.path.exists(dfn):
                        try:
                            os.remove(dfn)
                        except (PermissionError, OSError):
                            pass
                    try:
                        os.rename(sfn, dfn)
                    except (PermissionError, OSError):
                        pass

            dfn = self.rotation_filename(f"{self.baseFilename}.1")
            if os.path.exists(dfn):
                try:
                    os.remove(dfn)
                except (PermissionError, OSError):
                    pass

            try:
                self.rotate(self.baseFilename, dfn)
            except (PermissionError, OSError):
                pass

        if not self.delay:
            try:
                self.stream = self._open()
            except (PermissionError, OSError):
                self.stream = None

    def emit(self, record: logging.LogRecord) -> None:
        try:
            if self.shouldRollover(record):
                self.doRollover()
            if self.stream is None:
                self.stream = self._open()
            super().emit(record)
        except (PermissionError, OSError):
            # Gracefully swallow transient Windows file lock errors during log write/rotation
            pass
        except Exception:
            self.handleError(record)


def setup_logging() -> None:
    """Configures production logging handlers (Console & Rotating File)."""
    log_level_name = getattr(settings, "LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_name, logging.INFO)

    formatter = JSONFormatter()

    # Console Handler (stdout for Docker/Kubernetes)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(log_level)

    # File Handler (Rotating log file)
    log_dir = getattr(settings, "LOG_DIR", "logs")
    log_file_name = getattr(settings, "LOG_FILE_NAME", "voxaudit.log")
    os.makedirs(log_dir, exist_ok=True)
    log_file_path = os.path.join(log_dir, log_file_name)

    file_handler = SafeRotatingFileHandler(
        log_file_path,
        maxBytes=10 * 1024 * 1024,  # 10 MB per file
        backupCount=5,  # Keep 5 backup files
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(log_level)

    # Root logger configuration
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers.clear()
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)

    # Reconfigure uvicorn and fastapi loggers
    for logger_name in ("uvicorn", "uvicorn.access", "uvicorn.error", "fastapi"):
        lib_logger = logging.getLogger(logger_name)
        lib_logger.handlers.clear()
        lib_logger.propagate = True

    logging.getLogger("app").info(
        "Production logging initialized",
        extra={"log_level": log_level_name, "log_file": log_file_path},
    )


def get_logger(name: str) -> logging.Logger:
    """Returns a logger instance for the given module name."""
    return logging.getLogger(name)
