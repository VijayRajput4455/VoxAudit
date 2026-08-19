from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DesignationCreate(BaseModel):
    code: str
    name: str
    department_id: UUID | None = None
    description: str | None = None
    status: str = "ACTIVE"


class DesignationUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    department_id: UUID | None = None
    description: str | None = None
    status: str | None = None


class DesignationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    department_id: UUID | None
    description: str | None
    status: str
