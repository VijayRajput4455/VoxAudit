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


class CustomerExperienceSignals(BaseModel):
    customer_sentiment: str
    customer_frustration: str
    customer_satisfaction: str
    issue_resolution: str
    customer_effort: str


class QAScorecardResponse(BaseModel):
    overall_qa_score: float
    agent_speaker_key: Optional[str] = None
    agent_talk_time_seconds: float
    customer_talk_time_seconds: float
    agent_talk_ratio_percentage: float
    customer_talk_ratio_percentage: float
    checklist: Dict[str, Any]
    customer_experience: CustomerExperienceSignals


class CallJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: Optional[str] = None
    audit_code: Optional[str] = None
    original_file_name: str
    storage_key: str
    audio_format: Optional[str] = None
    duration_seconds: Optional[float] = None
    status: str
    detected_language: Optional[str] = None
    speakers_count: Optional[int] = None
    identified_employee_id: Optional[UUID] = None
    transcript_json: Optional[Dict[str, Any]] = None
    qa_score: Optional[float] = None
    qa_scorecard_json: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class QAScorecardUpdateRequest(BaseModel):
    qa_score: Optional[float] = None
    qa_scorecard_json: Optional[Dict[str, Any]] = None


