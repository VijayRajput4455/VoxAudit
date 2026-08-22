from unittest.mock import MagicMock
from uuid import uuid4

from app.models.call_job import CallJob
from app.workers.qa_audit_worker import QAAuditWorker


def test_qa_audit_worker_process_job():
    call_id = uuid4()
    mock_db = MagicMock()

    mock_call_job = CallJob(
        id=call_id,
        original_file_name="test.wav",
        storage_key="calls/test.wav",
        status="COMPLETED",
        duration_seconds=20.0,
        transcript_json={
            "speaker_mappings": {"SPEAKER_00": "Vijay Rajput", "SPEAKER_01": "Customer"},
            "turns": [
                {
                    "start": 1.0,
                    "end": 3.0,
                    "speaker": "SPEAKER_00",
                    "speaker_name": "Vijay Rajput",
                    "text": "Hello, welcome to support!",
                },
                {
                    "start": 3.5,
                    "end": 6.0,
                    "speaker": "SPEAKER_01",
                    "speaker_name": "Customer",
                    "text": "Thanks! Everything works great.",
                },
            ],
        },
    )

    mock_db.get.return_value = mock_call_job

    worker = QAAuditWorker(db=mock_db)
    job_payload = {
        "event": "QA_AUDIT_PROCESSING",
        "job_id": "test-job-123",
        "call_id": str(call_id),
    }

    success = worker.process_job(job_payload)

    assert success is True
    assert mock_call_job.qa_score is not None
    assert mock_call_job.qa_score > 0.0
    assert mock_call_job.qa_scorecard_json is not None
    assert "customer_experience" in mock_call_job.qa_scorecard_json
    assert mock_db.commit.called
