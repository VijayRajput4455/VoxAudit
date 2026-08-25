import json
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.logging import get_logger
from app.integrations.rabbitmq.publisher import RabbitMQPublisher
from app.models.call_job import CallJob
from app.models.employee import Employee
from app.services.analytics.qa_scorecard_service import QAScorecardService
from app.services.code_generator import CodeGenerator, CodePrefix

logger = get_logger(__name__)

router = APIRouter()


class ChatQAEvaluationBody(BaseModel):
    title: Optional[str] = "Chat Conversation Transcript"
    employee_id: Optional[str] = None
    chat_json: Optional[Any] = None  # Can be list of turns or dict


def normalize_chat_turns(raw_data: Any, default_agent_name: str = "Agent") -> tuple[List[Dict[str, Any]], Dict[str, str], float]:
    """
    Parses various JSON chat structures and normalizes them into VoxAudit standard turns:
    [{ "start": 0.0, "end": 4.0, "speaker": "SPEAKER_00", "speaker_name": "Agent Name", "text": "..." }]
    """
    items = []
    if isinstance(raw_data, list):
        items = raw_data
    elif isinstance(raw_data, dict):
        if "turns" in raw_data and isinstance(raw_data["turns"], list):
            items = raw_data["turns"]
        elif "messages" in raw_data and isinstance(raw_data["messages"], list):
            items = raw_data["messages"]
        elif "chat" in raw_data and isinstance(raw_data["chat"], list):
            items = raw_data["chat"]
        elif "history" in raw_data and isinstance(raw_data["history"], list):
            items = raw_data["history"]
        elif "conversation" in raw_data and isinstance(raw_data["conversation"], list):
            items = raw_data["conversation"]
        else:
            items = [raw_data]

    if not items:
        raise ValueError("JSON must contain an array of chat messages or turns.")

    normalized_turns = []
    speaker_mappings = {
        "SPEAKER_00": default_agent_name,
        "SPEAKER_01": "Customer"
    }

    current_time = 0.0

    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue

        # Extract text
        text = item.get("text") or item.get("message") or item.get("content") or item.get("body") or item.get("transcript") or ""
        text = str(text).strip()
        if not text:
            continue

        # Extract role / speaker
        speaker_raw = str(
            item.get("speaker") or item.get("role") or item.get("sender") or item.get("from") or item.get("author") or item.get("user") or ""
        ).lower()

        # Determine if agent or customer
        is_agent = (
            "agent" in speaker_raw
            or "support" in speaker_raw
            or "rep" in speaker_raw
            or "assistant" in speaker_raw
            or "bot" in speaker_raw
            or speaker_raw == "speaker_00"
            or speaker_raw == "0"
            or (not speaker_raw and idx % 2 == 0)
        )

        speaker_key = "SPEAKER_00" if is_agent else "SPEAKER_01"
        speaker_name = default_agent_name if is_agent else "Customer"

        # Calculate or extract timestamps
        start_val = item.get("start")
        end_val = item.get("end")

        if start_val is not None and end_val is not None:
            try:
                start_sec = float(start_val)
                end_sec = float(end_val)
            except (ValueError, TypeError):
                start_sec = current_time
                end_sec = current_time + max(2.0, len(text.split()) * 0.4)
        else:
            turn_duration = max(2.5, len(text.split()) * 0.45)
            start_sec = current_time
            end_sec = current_time + turn_duration

        current_time = end_sec + 0.5

        normalized_turns.append({
            "start": round(start_sec, 2),
            "end": round(end_sec, 2),
            "speaker": speaker_key,
            "speaker_name": speaker_name,
            "text": text
        })

    if not normalized_turns:
        raise ValueError("Could not extract any valid text messages from the provided JSON.")

    duration_seconds = round(current_time, 2)
    return normalized_turns, speaker_mappings, duration_seconds


@router.post("/evaluate", status_code=status.HTTP_201_CREATED)
async def evaluate_chat_qa(
    file: Optional[UploadFile] = File(None),
    title: Optional[str] = Form(None),
    employee_id: Optional[str] = Form(None),
    raw_json_str: Optional[str] = Form(None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Accepts JSON chat transcript (file upload or form string), stores it in PostgreSQL,
    and publishes an asynchronous QA audit job to RabbitMQ for QAAuditWorker.
    """
    raw_content = None
    original_name = title or "Chat Transcript"

    if file is not None:
        content_bytes = await file.read()
        try:
            raw_content = json.loads(content_bytes.decode("utf-8"))
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid JSON file format: {str(e)}"
            )
        if not title:
            original_name = file.filename or "chat_history.json"
    elif raw_json_str:
        try:
            raw_content = json.loads(raw_json_str)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid JSON payload: {str(e)}"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a JSON file or raw JSON content."
        )

    # Resolve employee if provided
    agent_name = "Agent"
    emp_uuid = None
    if employee_id and employee_id.strip():
        try:
            emp_uuid = UUID(employee_id.strip())
            emp = db.get(Employee, emp_uuid)
            if emp:
                agent_name = f"{emp.first_name} {emp.last_name or ''}".strip()
        except ValueError:
            pass

    # Normalize turns
    try:
        turns, speaker_mappings, duration_seconds = normalize_chat_turns(raw_content, default_agent_name=agent_name)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))

    temp_call_id = str(uuid4())

    # Create CallJob database row
    audit_code = CodeGenerator.generate_code(db, CodePrefix.AUDIT)
    call_code = CodeGenerator.generate_code(db, CodePrefix.CALL)

    call_job = CallJob(
        id=UUID(temp_call_id),
        code=call_code,
        audit_code=audit_code,
        original_file_name=original_name,
        storage_key=f"chat_qa/{temp_call_id}.json",
        audio_format="json_chat",
        duration_seconds=duration_seconds,
        status="COMPLETED",
        detected_language="en",
        speakers_count=2,
        identified_employee_id=emp_uuid,
        transcript_json={
            "turns": turns,
            "speaker_mappings": speaker_mappings,
            "type": "chat_qa"
        },
        qa_score=None,
        qa_scorecard_json=None
    )

    db.add(call_job)
    db.commit()
    db.refresh(call_job)

    # Publish to RabbitMQ QA Audit Queue for QAAuditWorker
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
        logger.info(f"Published Chat QA Audit job '{job_id}' for chat '{call_job.id}' to RabbitMQ QA queue.")
    except Exception as exc:
        logger.error(f"Failed to publish QA audit job to RabbitMQ: {str(exc)}", exc_info=True)
        # Fallback to in-process evaluation if RabbitMQ is not connected
        try:
            qa_service = QAScorecardService()
            scorecard = qa_service.compute_scorecard(
                transcript_turns=turns,
                speaker_mappings=speaker_mappings,
                identified_employee_name=agent_name,
                duration_seconds=duration_seconds,
                call_id=temp_call_id
            )
            overall_score = scorecard.get("overall_qa_score")
            if overall_score is None and "overall_evaluation" in scorecard:
                overall_score = scorecard["overall_evaluation"].get("score", 50.0)
            call_job.qa_score = float(overall_score) if overall_score is not None else 50.0
            call_job.qa_scorecard_json = scorecard
            db.commit()
            db.refresh(call_job)
        except Exception as fb_exc:
            logger.error(f"Fallback QA evaluation error: {fb_exc}")

    return {
        "id": str(call_job.id),
        "code": call_job.code,
        "audit_code": call_job.audit_code,
        "original_file_name": call_job.original_file_name,
        "duration_seconds": call_job.duration_seconds,
        "qa_score": call_job.qa_score,
        "qa_scorecard_json": call_job.qa_scorecard_json,
        "transcript_json": call_job.transcript_json,
        "identified_employee_id": str(call_job.identified_employee_id) if call_job.identified_employee_id else None,
        "created_at": call_job.created_at.isoformat() if call_job.created_at else None,
        "status": "QUEUED" if call_job.qa_score is None else "COMPLETED",
        "message": "Chat QA evaluation job submitted to QA worker queue."
    }


@router.get("/history")
def get_chat_qa_history(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    chat_filter = (
        (CallJob.audio_format == "json_chat")
        | (CallJob.audio_format == "chat_qa")
        | (CallJob.audio_format == "json")
        | (CallJob.original_file_name.ilike("%.json"))
        | (CallJob.storage_key.ilike("chat_qa/%"))
    )
    stmt = (
        select(CallJob)
        .where(chat_filter)
        .order_by(desc(CallJob.created_at))
        .offset(offset)
        .limit(limit)
    )
    records = db.scalars(stmt).all()

    total_count = db.query(CallJob).filter(chat_filter).count()

    results = []
    for c in records:
        emp_name = "Unassigned"
        if c.employee:
            emp_name = f"{c.employee.first_name} {c.employee.last_name or ''}".strip()

        turns_count = len(c.transcript_json.get("turns", [])) if c.transcript_json else 0

        results.append({
            "id": str(c.id),
            "code": c.code,
            "audit_code": c.audit_code,
            "original_file_name": c.original_file_name,
            "duration_seconds": c.duration_seconds,
            "qa_score": c.qa_score,
            "qa_scorecard_json": c.qa_scorecard_json,
            "transcript_json": c.transcript_json,
            "identified_employee_id": str(c.identified_employee_id) if c.identified_employee_id else None,
            "agent_name": emp_name,
            "turns_count": turns_count,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "status": c.status
        })

    return {
        "total": total_count,
        "items": results
    }


@router.get("/{job_id}")
def get_chat_qa_record(job_id: UUID, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Retrieves a single chat QA audit record with full scorecard and turns."""
    call_job = db.get(CallJob, job_id)
    if not call_job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat QA record not found")

    emp_name = "Unassigned"
    if call_job.employee:
        emp_name = f"{call_job.employee.first_name} {call_job.employee.last_name or ''}".strip()

    return {
        "id": str(call_job.id),
        "code": call_job.code,
        "audit_code": call_job.audit_code,
        "original_file_name": call_job.original_file_name,
        "duration_seconds": call_job.duration_seconds,
        "qa_score": call_job.qa_score,
        "qa_scorecard_json": call_job.qa_scorecard_json,
        "transcript_json": call_job.transcript_json,
        "identified_employee_id": str(call_job.identified_employee_id) if call_job.identified_employee_id else None,
        "agent_name": emp_name,
        "created_at": call_job.created_at.isoformat() if call_job.created_at else None,
        "status": call_job.status
    }


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat_qa_record(job_id: UUID, db: Session = Depends(get_db)):
    """Deletes a chat QA evaluation record."""
    call_job = db.get(CallJob, job_id)
    if not call_job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat QA record not found")

    db.delete(call_job)
    db.commit()
    return None
