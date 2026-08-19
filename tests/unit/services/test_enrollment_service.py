from io import BytesIO
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest

from app.core.exceptions import StorageException, VoxAuditException
from app.models.employee import Employee
from app.services.voice.enrollment_service import EnrollmentService


def test_enrollment_service_employee_not_found():
    db_mock = MagicMock()
    # Employee query returns None
    db_mock.scalar.return_value = None

    service = EnrollmentService(db=db_mock, storage=MagicMock(), publisher=MagicMock())

    file_obj = BytesIO(b"fake audio data")
    with pytest.raises(VoxAuditException, match="not found"):
        service.enroll_voice_sample(
            employee_id=uuid4(),
            file_obj=file_obj,
            original_file_name="sample.wav",
            file_size=len(b"fake audio data"),
        )


def test_enrollment_service_file_size_exceeded():
    db_mock = MagicMock()
    mock_emp = Employee(id=str(uuid4()), employee_code="EMP001", first_name="Test", last_name="User")
    db_mock.scalar.return_value = mock_emp

    service = EnrollmentService(db=db_mock, storage=MagicMock(), publisher=MagicMock())

    file_obj = BytesIO(b"fake audio data")
    with pytest.raises(ValueError, match="exceeds maximum"):
        service.enroll_voice_sample(
            employee_id=UUID(mock_emp.id),
            file_obj=file_obj,
            original_file_name="sample.wav",
            file_size=100 * 1024 * 1024,  # 100MB > 50MB
        )


def test_enrollment_service_successful_enrollment():
    db_mock = MagicMock()
    mock_emp = Employee(id=str(uuid4()), employee_code="EMP001", first_name="Test", last_name="User")
    db_mock.scalar.return_value = mock_emp

    storage_mock = MagicMock()
    publisher_mock = MagicMock()

    service = EnrollmentService(db=db_mock, storage=storage_mock, publisher=publisher_mock)

    audio_payload = b"RIFF....WAVEfmt ....data....sample audio"
    file_obj = BytesIO(audio_payload)

    sample = service.enroll_voice_sample(
        employee_id=UUID(mock_emp.id),
        file_obj=file_obj,
        original_file_name="enrollment.wav",
        file_size=len(audio_payload),
    )

    assert sample.status == "PENDING"
    assert sample.original_file_name == "enrollment.wav"
    storage_mock.upload_stream.assert_called_once()
    publisher_mock.publish_enrollment_job.assert_called_once()
