from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DepartmentCreate(BaseModel):
    code: str | None = None
    name: str
    description: str | None = None
    status: str = "ACTIVE"


class DepartmentUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    status: str | None = None


class DepartmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    description: str | None
    status: str
