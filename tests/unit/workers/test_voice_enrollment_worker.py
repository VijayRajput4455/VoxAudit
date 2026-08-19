from unittest.mock import MagicMock
from uuid import uuid4

import numpy as np
import pytest
import torch

from app.models.voice_sample import VoiceSample
from app.workers.voice_enrollment_worker import VoiceEnrollmentWorker


def test_worker_idempotency_already_active_sample():
    db_mock = MagicMock()
    sample_id = uuid4()
    mock_sample = VoiceSample(
        id=sample_id,
        employee_id=str(uuid4()),
        original_file_name="sample.wav",
        storage_key="employees/EMP001/sample.wav",
        embedding_id="existing_embedding_uuid_123",
        status="ACTIVE",
    )
    db_mock.scalar.return_value = mock_sample

    worker = VoiceEnrollmentWorker(
        db=db_mock,
        storage=MagicMock(),
        milvus_repo=MagicMock(),
        inference=MagicMock(),
    )

    job_payload = {
        "job_id": "job_123",
        "voice_sample_id": str(sample_id),
        "employee_id": str(mock_sample.employee_id),
        "storage_key": "employees/EMP001/sample.wav",
        "attempt": 1,
    }

    # Worker should recognize ACTIVE status and return True immediately without re-processing
    result = worker.process_job(job_payload)
    assert result is True


def test_worker_successful_processing():
    db_mock = MagicMock()
    sample_id = uuid4()
    mock_sample = VoiceSample(
        id=sample_id,
        employee_id=str(uuid4()),
        original_file_name="sample.wav",
        storage_key="employees/EMP001/sample.wav",
        status="PENDING",
    )
    db_mock.scalar.return_value = mock_sample

    storage_mock = MagicMock()
    storage_mock.download_file.return_value = b"RIFF....WAVEfmt ....data"

    milvus_mock = MagicMock()
    milvus_mock.insert_vector.return_value = "milvus_vector_123"

    inference_mock = MagicMock()
    mock_vec = torch.randn(192)
    mock_vec = torch.nn.functional.normalize(mock_vec, p=2, dim=0)
    inference_mock.generate_from_waveform.return_value = mock_vec

    quality_mock = MagicMock()
    quality_mock.assess_quality.return_value = 0.95

    worker = VoiceEnrollmentWorker(
        db=db_mock,
        storage=storage_mock,
        milvus_repo=milvus_mock,
        inference=inference_mock,
        quality_service=quality_mock,
    )

    job_payload = {
        "job_id": "job_456",
        "voice_sample_id": str(sample_id),
        "employee_id": str(mock_sample.employee_id),
        "storage_key": "employees/EMP001/sample.wav",
        "attempt": 1,
    }

    # Mock load_and_preprocess_audio inside worker
    from unittest.mock import patch
    with patch("app.workers.voice_enrollment_worker.load_and_preprocess_audio") as mock_audio_prep:
        mock_audio_prep.return_value = (torch.zeros((1, 48000)), 16000)
        result = worker.process_job(job_payload)

    assert result is True
    assert mock_sample.status == "ACTIVE"
    assert mock_sample.embedding_id is not None
    assert mock_sample.quality_score == 0.95
    milvus_mock.insert_vector.assert_called_once()
