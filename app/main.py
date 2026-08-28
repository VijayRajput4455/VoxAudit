from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse, Response

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
    from sqlalchemy import text
    Base.metadata.create_all(bind=engine)

    # Ensure new QA Scorecard and Code Generator columns exist on pre-existing database tables
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE call_jobs ADD COLUMN IF NOT EXISTS qa_score FLOAT;"))
            conn.execute(text("ALTER TABLE call_jobs ADD COLUMN IF NOT EXISTS qa_scorecard_json JSON;"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_call_jobs_qa_score ON call_jobs (qa_score);"))
            conn.execute(text("ALTER TABLE call_jobs ADD COLUMN IF NOT EXISTS code VARCHAR(50);"))
            conn.execute(text("ALTER TABLE call_jobs ADD COLUMN IF NOT EXISTS audit_code VARCHAR(50);"))
            conn.execute(text("ALTER TABLE voice_samples ADD COLUMN IF NOT EXISTS code VARCHAR(50);"))
        logger.info("Database schema auto-migration applied successfully.")
    except Exception as exc:
        logger.warning(f"Database schema auto-migration warning: {str(exc)}")

    # Automatically seed the 4 default shifts (General, Morning, Evening, Night), departments, and designations
    try:
        from app.core.database import SessionLocal
        from app.services.shift_service import ShiftService
        from app.services.department_service import DepartmentService
        from app.services.designation_service import DesignationService

        with SessionLocal() as db_session:
            shift_svc = ShiftService(db_session)
            seeded_shifts = shift_svc.seed_default_shifts()
            if seeded_shifts:
                logger.info(f"Auto-seeded {len(seeded_shifts)} default shift(s): General, Morning, Evening, Night.")

            dept_svc = DepartmentService(db_session)
            seeded_depts = dept_svc.seed_default_departments()
            if seeded_depts:
                logger.info(f"Auto-seeded {len(seeded_depts)} default department(s).")

            desig_svc = DesignationService(db_session)
            seeded_desigs = desig_svc.seed_default_designations()
            if seeded_desigs:
                logger.info(f"Auto-seeded {len(seeded_desigs)} default designation(s).")
    except Exception as exc:
        logger.warning(f"Database default seeding warning: {str(exc)}")

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


from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from app.core.metrics import HTTP_REQUESTS_TOTAL, HTTP_REQUEST_DURATION_SECONDS
import time


@app.middleware("http")
async def prometheus_metrics_middleware(request: Request, call_next):
    start_time = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start_time

    # Normalize path (e.g. ignore static asset paths)
    path = request.url.path
    if not path.startswith("/static"):
        HTTP_REQUESTS_TOTAL.labels(
            method=request.method,
            endpoint=path,
            status_code=response.status_code,
        ).inc()
        HTTP_REQUEST_DURATION_SECONDS.labels(
            method=request.method,
            endpoint=path,
        ).observe(duration)

    return response


@app.get("/metrics", include_in_schema=False)
async def metrics_endpoint():
    """Prometheus telemetry scrape endpoint."""
    from app.core.metrics import collect_hardware_metrics
    collect_hardware_metrics()
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
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