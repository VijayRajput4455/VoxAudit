from datetime import time
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ShiftCreate(BaseModel):
    code: str | None = None
    name: str
    start_time: time
    end_time: time
    timezone: str = "UTC"
    status: str = "ACTIVE"


class ShiftUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    status: str | None = None


class ShiftResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    start_time: time
    end_time: time
    timezone: str
    status: str
