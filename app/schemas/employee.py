from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class EmployeeCreate(BaseModel):
    employee_code: str
    name: str
    father_name: str | None = None
    date_of_birth: date | None = None
    joining_date: date | None = None

    department_id: UUID | None = None
    designation_id: UUID | None = None
    shift_id: UUID | None = None

    status: str = "ACTIVE"


class EmployeeUpdate(BaseModel):
    name: str | None = None
    father_name: str | None = None
    date_of_birth: date | None = None
    joining_date: date | None = None

    department_id: UUID | None = None
    designation_id: UUID | None = None
    shift_id: UUID | None = None

    status: str | None = None


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_code: str
    name: str
    father_name: str | None
    date_of_birth: date | None
    joining_date: date | None

    department_id: UUID | None
    designation_id: UUID | None
    shift_id: UUID | None

    status: str