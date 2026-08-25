from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.exceptions import VoxAuditException
from app.core.logging import get_logger
from app.models.call_job import CallJob
from app.schemas.call_job import CallJobResponse, CallSubmissionResponse, QAScorecardUpdateRequest
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
    expected_employee_id: Optional[UUID] = Form(None),
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
            expected_employee_id=expected_employee_id,
        )

        return CallSubmissionResponse(
            id=call_job.id,
            status=call_job.status,
            message="Call processing job submitted for asynchronous processing.",
        )
    except VoxAuditException as exc:
        logger.warning(f"Call submission error: {str(exc)}")
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Unexpected call processing submission error: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal call processing submission failure.")


@router.post(
    "/{call_id}/audit",
    response_model=CallSubmissionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger Asynchronous QA Audit & CX Analytics",
    description="Queues an asynchronous QA audit job to RabbitMQ to evaluate Agent Scorecard and Customer Experience (CX) signals for a processed call. Updates the same database row when complete.",
)
def trigger_call_qa_audit(
    call_id: UUID,
    db: Session = Depends(get_db),
) -> CallSubmissionResponse:
    """Queues asynchronous QA Scorecard & CX Analytics processing for a call."""
    from uuid import uuid4
    from app.integrations.rabbitmq.publisher import RabbitMQPublisher

    statement = select(CallJob).where(CallJob.id == call_id)
    call_job = db.scalar(statement)

    if not call_job:
        raise HTTPException(status_code=404, detail=f"Call job '{call_id}' not found.")

    if call_job.status != "COMPLETED":
        raise HTTPException(
            status_code=400,
            detail=f"Call job '{call_id}' must be in COMPLETED status with a transcript before auditing (current status: {call_job.status}).",
        )

    if not call_job.transcript_json or "turns" not in call_job.transcript_json:
        raise HTTPException(status_code=400, detail=f"Call job '{call_id}' has no transcript turns available for auditing.")

    publisher = RabbitMQPublisher()
    job_id = str(uuid4())
    job_payload = {
        "event": "QA_AUDIT_PROCESSING",
        "job_id": job_id,
        "call_id": str(call_job.id),
        "attempt": 1,
    }

    try:
        publisher.publish_qa_audit_job(job_payload)
        return CallSubmissionResponse(
            id=call_job.id,
            status=call_job.status,
            message="QA Audit job queued successfully.",
        )
    except Exception as exc:
        logger.error(f"Failed to publish QA audit job for call '{call_id}': {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to queue QA audit job: {str(exc)}")


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
    "/{call_id}/scorecard",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Get Call QA Scorecard & CX Metrics",
    description="Retrieves detailed Agent QA Scorecard and Customer Experience (CX) signal indicators for a completed call.",
)
def get_call_scorecard(
    call_id: UUID,
    db: Session = Depends(get_db),
) -> dict:
    """Retrieves QA Scorecard and Customer Experience signals for a call."""
    statement = select(CallJob).where(CallJob.id == call_id)
    call_job = db.scalar(statement)

    if not call_job:
        raise HTTPException(status_code=404, detail=f"Call job '{call_id}' not found.")

    if call_job.status != "COMPLETED":
        raise HTTPException(status_code=400, detail=f"Call job '{call_id}' is not yet COMPLETED (current status: {call_job.status}).")

    if not call_job.qa_scorecard_json:
        raise HTTPException(status_code=404, detail=f"QA Scorecard not available for call '{call_id}'.")

    return call_job.qa_scorecard_json


@router.put(
    "/{call_id}/scorecard",
    response_model=CallJobResponse,
    status_code=status.HTTP_200_OK,
    summary="Update or Override Call QA Scorecard",
    description="Allows QA auditors to adjust category scores, recalibrate overall QA score, and save custom scorecard evaluations.",
)
def update_call_scorecard(
    call_id: UUID,
    payload: QAScorecardUpdateRequest,
    db: Session = Depends(get_db),
) -> CallJobResponse:
    """Updates QA scorecard and overall score for a call based on auditor calibration."""
    statement = select(CallJob).where(CallJob.id == call_id)
    call_job = db.scalar(statement)

    if not call_job:
        raise HTTPException(status_code=404, detail=f"Call job '{call_id}' not found.")

    if payload.qa_score is not None:
        call_job.qa_score = float(payload.qa_score)

    if payload.qa_scorecard_json is not None:
        call_job.qa_scorecard_json = payload.qa_scorecard_json
        if payload.qa_score is None and "overall_qa_score" in payload.qa_scorecard_json:
            call_job.qa_score = float(payload.qa_scorecard_json["overall_qa_score"])
        
        if call_job.transcript_json:
            updated_trans = dict(call_job.transcript_json)
            updated_trans["qa_scorecard"] = call_job.qa_scorecard_json
            call_job.transcript_json = updated_trans

    db.commit()
    db.refresh(call_job)
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
    min_qa_score: Optional[float] = None,
    max_qa_score: Optional[float] = None,
    db: Session = Depends(get_db),
) -> List[CallJobResponse]:
    """Lists processed customer support call audit jobs."""
    statement = select(CallJob)

    if min_qa_score is not None:
        statement = statement.where(CallJob.qa_score >= min_qa_score)
    if max_qa_score is not None:
        statement = statement.where(CallJob.qa_score <= max_qa_score)

    statement = statement.order_by(CallJob.created_at.desc()).limit(limit).offset(offset)
    call_jobs = db.scalars(statement).all()
    return [CallJobResponse.model_validate(job) for job in call_jobs]

