from io import BytesIO
from unittest.mock import MagicMock
from uuid import uuid4

import numpy as np
import pytest
import torch

from app.models.employee import Employee
from app.services.voice.verification_service import VerificationService


def test_verification_service_no_matches():
    db_mock = MagicMock()
    milvus_mock = MagicMock()
    milvus_mock.search_vectors.return_value = []

    inference_mock = MagicMock()
    inference_mock.generate_from_waveform.return_value = torch.randn(192)

    quality_mock = MagicMock()
    quality_mock.assess_quality.return_value = 0.95

    service = VerificationService(
        db=db_mock,
        milvus_repo=milvus_mock,
        inference=inference_mock,
        quality_service=quality_mock,
    )

    audio_bytes = b"RIFF....WAVEfmt ....data"
    file_obj = BytesIO(audio_bytes)

    from unittest.mock import patch
    with patch("app.services.voice.verification_service.load_and_preprocess_audio") as mock_prep:
        mock_prep.return_value = (torch.zeros((1, 48000)), 16000)
        result = service.verify_or_identify_speaker(
            file_obj=file_obj,
            original_file_name="query.wav",
        )

    assert result["is_match"] is False
    assert result["matched_employee"] is None
    milvus_mock.search_vectors.assert_called_once()


def test_verification_service_successful_match():
    db_mock = MagicMock()
    employee_id = uuid4()
    mock_emp = Employee(id=str(employee_id), employee_code="EMP001", first_name="Vijay", last_name="Rajput", email="vijay@voxaudit.io")
    db_mock.scalar.return_value = mock_emp

    milvus_mock = MagicMock()
    milvus_mock.search_vectors.return_value = [
        {
            "embedding_id": "vec_123",
            "similarity_score": 0.9421,
            "employee_id": str(employee_id),
            "voice_sample_id": str(uuid4()),
        }
    ]

    inference_mock = MagicMock()
    inference_mock.generate_from_waveform.return_value = torch.randn(192)

    quality_mock = MagicMock()
    quality_mock.assess_quality.return_value = 0.98

    service = VerificationService(
        db=db_mock,
        milvus_repo=milvus_mock,
        inference=inference_mock,
        quality_service=quality_mock,
    )

    audio_bytes = b"RIFF....WAVEfmt ....data"
    file_obj = BytesIO(audio_bytes)

    from unittest.mock import patch
    with patch("app.services.voice.verification_service.load_and_preprocess_audio") as mock_prep:
        mock_prep.return_value = (torch.zeros((1, 48000)), 16000)
        result = service.verify_or_identify_speaker(
            file_obj=file_obj,
            original_file_name="query.wav",
            threshold=0.70,
        )

    assert result["is_match"] is True
    assert result["confidence_score"] == 0.9421
    assert result["matched_employee"]["employee_code"] == "EMP001"
    assert result["matched_employee"]["first_name"] == "Vijay"
