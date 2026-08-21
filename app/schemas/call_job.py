from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CallSubmissionResponse(BaseModel):
    id: UUID
    status: str
    message: str = "Call processing job submitted successfully."


class TranscriptTurnSchema(BaseModel):
    start: float
    end: float
    speaker: str
    speaker_name: str
    text: str


class CallJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    original_file_name: str
    storage_key: str
    audio_format: Optional[str] = None
    duration_seconds: Optional[float] = None
    status: str
    detected_language: Optional[str] = None
    speakers_count: Optional[int] = None
    identified_employee_id: Optional[UUID] = None
    transcript_json: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
