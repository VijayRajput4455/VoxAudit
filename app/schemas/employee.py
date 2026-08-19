from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


class EmployeeCreate(BaseModel):
    employee_code: str

    first_name: str
    last_name: str | None = None

    father_name: str | None = None

    date_of_birth: date | None = None
    date_of_joining: date

    email: EmailStr | None = None
    phone: str | None = None

    department_id: UUID | None = None
    designation_id: UUID | None = None
    shift_id: UUID | None = None
    manager_id: UUID | None = None

    location: str | None = None

    status: str = "ACTIVE"


class EmployeeUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None

    father_name: str | None = None

    date_of_birth: date | None = None
    date_of_joining: date | None = None

    email: EmailStr | None = None
    phone: str | None = None

    department_id: UUID | None = None
    designation_id: UUID | None = None
    shift_id: UUID | None = None
    manager_id: UUID | None = None

    location: str | None = None

    status: str | None = None


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID

    employee_code: str

    first_name: str
    last_name: str | None

    father_name: str | None

    date_of_birth: date | None
    date_of_joining: date

    email: EmailStr | None
    phone: str | None

    department_id: UUID | None
    designation_id: UUID | None
    shift_id: UUID | None
    manager_id: UUID | None

    location: str | None
    status: str