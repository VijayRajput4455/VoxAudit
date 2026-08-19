from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class VoiceSampleCreate(BaseModel):
    employee_id: UUID
    sample_type: str = "ENROLLMENT"
    source: str | None = None


class VoiceSampleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_id: UUID

    original_file_name: str
    storage_key: str

    audio_format: str | None
    duration_seconds: float | None
    sample_rate: int | None
    channels: int | None

    quality_score: float | None

    embedding_id: str | None
    embedding_model: str | None
    embedding_dimension: int | None
    model_version: str | None

    sample_type: str
    source: str | None
    status: str
    error_message: str | None = None

    created_at: datetime
    updated_at: datetime


class VoiceSampleEnrollmentResponse(BaseModel):
    id: UUID
    employee_id: UUID
    status: str
    message: str = "Voice sample accepted for processing."