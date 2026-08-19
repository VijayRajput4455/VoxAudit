from fastapi import APIRouter

from app.api.v1.endpoints import (
    departments,
    designations,
    employees,
    health,
    shifts,
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