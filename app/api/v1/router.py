from fastapi import APIRouter

from app.api.v1.endpoints import departments, employees, health


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
    employees.router,
    prefix="/employees",
    tags=["Employees"],
)