from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.exceptions import VoxAuditException
from app.core.logging import get_logger
from app.models.call_job import CallJob
from app.schemas.call_job import CallJobResponse, CallSubmissionResponse
from app.services.call.call_service import CallService

logger = get_logger(__name__)

router = APIRouter()


@router.post(
    "/process",
    response_model=CallSubmissionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Asynchronous Call Processing & Diarization",
    description="Uploads a customer support call audio file, stores audio in MinIO, and queues asynchronous Whisper transcription, Pyannote diarization, and Milvus speaker identification. Returns 202 Accepted immediately.",
)
def process_call_audio(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> CallSubmissionResponse:
    """Submits a customer support call audio file for asynchronous processing."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required.")

    file_bytes = file.file.read()
    file.file.seek(0)
    file_size = len(file_bytes)

    call_service = CallService(db)

    try:
        call_job = call_service.submit_call_job(
            file_obj=file.file,
            original_file_name=file.filename,
            file_size=file_size,
            content_type=file.content_type or "audio/wav",
        )
        return CallSubmissionResponse(
            id=call_job.id,
            status=call_job.status,
            message="Call processing job submitted successfully.",
        )
    except VoxAuditException as exc:
        logger.warning(f"Call submission error: {str(exc)}")
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Unexpected call processing submission error: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal call processing submission failure.")


@router.get(
    "/{call_id}",
    response_model=CallJobResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Call Processing Status & Transcript",
    description="Retrieves call processing status and full speaker-attributed transcript JSON.",
)
def get_call_job(
    call_id: UUID,
    db: Session = Depends(get_db),
) -> CallJobResponse:
    """Retrieves call processing job status and speaker-attributed transcript."""
    statement = select(CallJob).where(CallJob.id == call_id)
    call_job = db.scalar(statement)

    if not call_job:
        raise HTTPException(status_code=404, detail=f"Call job '{call_id}' not found.")

    return CallJobResponse.model_validate(call_job)


@router.get(
    "",
    response_model=List[CallJobResponse],
    status_code=status.HTTP_200_OK,
    summary="List Call Processing Jobs",
)
def list_call_jobs(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
) -> List[CallJobResponse]:
    """Lists processed customer support call audit jobs."""
    statement = select(CallJob).order_by(CallJob.created_at.desc()).limit(limit).offset(offset)
    call_jobs = db.scalars(statement).all()
    return [CallJobResponse.model_validate(job) for job in call_jobs]
