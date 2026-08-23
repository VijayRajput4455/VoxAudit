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


class VoiceSampleBatchEnrollmentResponse(BaseModel):
    employee_id: UUID
    total_samples: int
    samples: list[VoiceSampleEnrollmentResponse]
    message: str = "Voice samples accepted for processing."


class SpeakerMatchCandidate(BaseModel):
    embedding_id: str | None = None
    similarity_score: float
    employee_id: str | None = None
    voice_sample_id: str | None = None
    model: str | None = None


class SpeakerVerificationResponse(BaseModel):
    is_match: bool
    confidence_score: float
    similarity_score: float
    threshold_applied: float
    matched_employee: dict | None = None
    matched_voice_sample_id: str | None = None
    audio_duration_seconds: float
    quality_score: float
    top_matches: list[SpeakerMatchCandidate] = []
    message: str


class VectorStatsResponse(BaseModel):
    collection_name: str
    dimension: int
    total_vectors: int
    status: str


class VectorRecordResponse(BaseModel):
    embedding_id: str
    employee_id: str
    voice_sample_id: str | None = None
    model: str | None = None
    model_version: str | None = None


class VoiceSampleSummaryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    original_file_name: str
    storage_key: str
    audio_format: str | None = None
    duration_seconds: float | None = None
    quality_score: float | None = None
    embedding_id: str | None = None
    status: str
    created_at: datetime


class EmployeeVoiceProfileResponse(BaseModel):
    employee_id: UUID
    employee_code: str
    first_name: str
    last_name: str | None = None
    email: str | None = None
    department_id: UUID | None = None
    department_name: str | None = None
    total_samples: int
    total_vectors: int
    samples: list[VoiceSampleSummaryItem]


class VoiceDatabaseSummaryResponse(BaseModel):
    total_employees_enrolled: int
    total_voice_samples: int
    total_vectors: int
    profiles: list[EmployeeVoiceProfileResponse]