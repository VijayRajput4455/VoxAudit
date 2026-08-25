from fastapi import APIRouter

from app.api.v1.endpoints import (
    calls,
    departments,
    designations,
    employees,
    health,
    shifts,
    vectors,
    voice_samples,
    chat_qa,
)


router = APIRouter()


router.include_router(
    health.router,
    prefix="/health",
    tags=["Health"],
)

router.include_router(
    departments.router,
    prefix="/departments",
    tags=["Departments"],
)

router.include_router(
    designations.router,
    prefix="/designations",
    tags=["Designations"],
)

router.include_router(
    shifts.router,
    prefix="/shifts",
    tags=["Shifts"],
)

router.include_router(
    employees.router,
    prefix="/employees",
    tags=["Employees"],
)

router.include_router(
    voice_samples.router,
    prefix="/voice-samples",
    tags=["Voice Samples"],
)

router.include_router(
    vectors.router,
    prefix="/vectors",
    tags=["Vector Database (Milvus)"],
)

router.include_router(
    calls.router,
    prefix="/calls",
    tags=["Call Processing"],
)

router.include_router(
    chat_qa.router,
    prefix="/chat-qa",
    tags=["Chat QA Audit"],
)