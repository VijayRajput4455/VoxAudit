from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.exceptions import VoxAuditException
from app.core.logging import get_logger
from app.repositories.voice_sample_repository import VoiceSampleRepository
from app.schemas.voice_sample import (
    VoiceSampleEnrollmentResponse,
    VoiceSampleResponse,
)
from app.services.voice.enrollment_service import EnrollmentService

logger = get_logger(__name__)

router = APIRouter()


@router.post(
    "/enroll",
    response_model=VoiceSampleEnrollmentResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Asynchronous Voice Sample Enrollment",
    description="Uploads an employee voice sample, stores audio in MinIO, and queues an asynchronous ECAPA embedding job. Returns 202 Accepted immediately.",
)
@router.post(
    "",
    response_model=VoiceSampleEnrollmentResponse,
    status_code=status.HTTP_202_ACCEPTED,
    include_in_schema=False,
)
def enroll_voice_sample(
    employee_id: UUID = Form(...),
    file: UploadFile = File(...),
    sample_type: str = Form("ENROLLMENT"),
    source: Optional[str] = Form("web"),
    db: Session = Depends(get_db),
) -> VoiceSampleEnrollmentResponse:
    """Enrolls a voice sample asynchronously."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required.")

    # Read uploaded file content to get size
    file_bytes = file.file.read()
    file.file.seek(0)
    file_size = len(file_bytes)

    enrollment_service = EnrollmentService(db)

    try:
        sample = enrollment_service.enroll_voice_sample(
            employee_id=employee_id,
            file_obj=file.file,
            original_file_name=file.filename,
            file_size=file_size,
            content_type=file.content_type or "audio/wav",
            sample_type=sample_type,
            source=source,
        )
        return VoiceSampleEnrollmentResponse(
            id=sample.id,
            employee_id=sample.employee_id,
            status=sample.status,
            message="Voice sample accepted for processing.",
        )
    except VoxAuditException as exc:
        logger.warning(f"Enrollment validation error: {str(exc)}")
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Unexpected enrollment error: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal voice enrollment failure.")


@router.get(
    "/{voice_sample_id}",
    response_model=VoiceSampleResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Voice Sample Status & Metadata",
    description="Retrieves status and metadata for a specific voice sample. Does not expose raw vector data.",
)
def get_voice_sample(
    voice_sample_id: UUID,
    db: Session = Depends(get_db),
) -> VoiceSampleResponse:
    """Retrieves voice sample status."""
    repo = VoiceSampleRepository(db)
    sample = repo.get_by_id(voice_sample_id)

    if not sample:
        raise HTTPException(status_code=44, detail=f"Voice sample '{voice_sample_id}' not found.")

    return VoiceSampleResponse.model_validate(sample)


@router.get(
    "/employee/{employee_id}",
    response_model=List[VoiceSampleResponse],
    status_code=status.HTTP_200_OK,
    summary="List Voice Samples for Employee",
)
def get_employee_voice_samples(
    employee_id: UUID,
    db: Session = Depends(get_db),
) -> List[VoiceSampleResponse]:
    """Lists all voice samples for an employee."""
    repo = VoiceSampleRepository(db)
    samples = repo.get_by_employee_id(employee_id)
    return [VoiceSampleResponse.model_validate(s) for s in samples]
