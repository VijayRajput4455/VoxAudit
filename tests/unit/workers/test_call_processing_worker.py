from unittest.mock import MagicMock
from uuid import uuid4

from app.models.call_job import CallJob
from app.workers.call_processing_worker import CallProcessingWorker


def test_call_processing_worker_idempotency_already_completed():
    call_id = uuid4()
    mock_db = MagicMock()
    mock_call_job = CallJob(
        id=call_id,
        original_file_name="call.wav",
        storage_key="calls/call.wav",
        status="COMPLETED",
        transcript_json={"turns": [{"start": 0.0, "end": 1.0, "text": "hello", "speaker": "SPEAKER_00"}]},
    )
    mock_db.get.return_value = mock_call_job

    worker = CallProcessingWorker(db=mock_db, storage=MagicMock())
    job_payload = {
        "job_id": "test_job_1",
        "call_id": str(call_id),
        "storage_key": "calls/call.wav",
        "attempt": 1,
    }

    success = worker.process_job(job_payload)
    assert success is True


def test_call_processing_worker_success():
    call_id = uuid4()
    emp_id = uuid4()
    mock_db = MagicMock()
    mock_call_job = CallJob(
        id=call_id,
        original_file_name="call.wav",
        storage_key="calls/call.wav",
        status="PENDING",
        identified_employee_id=emp_id,
    )
    mock_db.get.return_value = mock_call_job

    mock_storage = MagicMock()
    mock_storage.download_file.return_value = b"RIFF....WAVEfmt "

    mock_processor = MagicMock()
    mock_processor.process_call.return_value = {
        "duration_seconds": 32.5,
        "detected_language": "en",
        "speakers_count": 2,
        "identified_employee_id": str(emp_id),
        "speaker_mappings": {"SPEAKER_00": "Agent John", "SPEAKER_01": "Customer"},
        "transcript_turns": [
            {"start": 0.0, "end": 2.5, "speaker": "SPEAKER_00", "speaker_name": "Agent John", "text": "Hello, thank you for calling."},
            {"start": 3.0, "end": 6.0, "speaker": "SPEAKER_01", "speaker_name": "Customer", "text": "Hi, I need help with my account."},
        ],
    }

    worker = CallProcessingWorker(
        db=mock_db,
        storage=mock_storage,
        processor=mock_processor,
    )

    job_payload = {
        "job_id": "test_job_2",
        "call_id": str(call_id),
        "storage_key": "calls/call.wav",
        "expected_employee_id": str(emp_id),
        "attempt": 1,
    }

    success = worker.process_job(job_payload)

    assert success is True
    assert mock_call_job.status == "COMPLETED"
    assert mock_call_job.duration_seconds == 32.5
    assert mock_call_job.detected_language == "en"
    assert mock_call_job.speakers_count == 2
    assert mock_call_job.transcript_json is not None
    assert len(mock_call_job.transcript_json["turns"]) == 2
    assert mock_db.commit.called
