from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.api.v1.router import router as api_v1_router
from app.core.config import settings
from app.core.database import engine
from app.core.logging import (
    CorrelationIDMiddleware,
    get_logger,
    get_request_id,
    setup_logging,
)
from app.models import Base

# Initialize production logging configuration
setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up application and initializing database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables initialized successfully.")
    yield
    logger.info("Shutting down application...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "AI-powered voice audit platform for "
        "Customer Care and Sales teams."
    ),
    lifespan=lifespan,
)

app.add_middleware(CorrelationIDMiddleware)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    req_id = get_request_id()
    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: {str(exc)}",
        exc_info=True,
        extra={
            "http_method": request.method,
            "http_path": request.url.path,
        },
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "An internal server error occurred.",
            "request_id": req_id,
        },
    )


app.include_router(
    api_v1_router,
    prefix=settings.API_V1_PREFIX,
)

# Serve Frontend SPA Dashboard
from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")

    @app.get("/", include_in_schema=False)
    @app.get("/dashboard", include_in_schema=False)
    async def serve_dashboard():
        return FileResponse(str(frontend_dir / "index.html"))


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    from fastapi.openapi.utils import get_openapi
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    # Fix Swagger UI rendering for UploadFile array parameters
    for schema in openapi_schema.get("components", {}).get("schemas", {}).values():
        if isinstance(schema, dict) and "properties" in schema:
            for prop in schema["properties"].values():
                if prop.get("type") == "array" and "items" in prop:
                    prop["items"]["format"] = "binary"
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi