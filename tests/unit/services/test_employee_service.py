from unittest.mock import MagicMock, patch
from uuid import uuid4

from app.models.employee import Employee
from app.models.voice_sample import VoiceSample
from app.services.employee_service import EmployeeService


def test_delete_employee_not_found():
    db_mock = MagicMock()
    service = EmployeeService(db=db_mock)
    service.repository.get_by_id = MagicMock(return_value=None)

    result = service.delete_employee(uuid4())
    assert result is False


@patch("app.integrations.milvus.repository.MilvusRepository")
@patch("app.integrations.minio.storage.MinioStorage")
@patch("app.repositories.voice_sample_repository.VoiceSampleRepository")
def test_delete_employee_cascade_cleanup(mock_voice_repo_cls, mock_minio_cls, mock_milvus_cls):
    db_mock = MagicMock()
    emp_id = uuid4()
    mock_emp = Employee(id=str(emp_id), employee_code="EMP001", first_name="John", last_name="Doe")

    service = EmployeeService(db=db_mock)
    service.repository.get_by_id = MagicMock(return_value=mock_emp)
    service.repository.delete = MagicMock()

    voice_sample = VoiceSample(id=uuid4(), employee_id=str(emp_id), storage_key="EMP001/sample.wav")
    mock_voice_repo_instance = MagicMock()
    mock_voice_repo_instance.get_by_employee_id.return_value = [voice_sample]
    mock_voice_repo_cls.return_value = mock_voice_repo_instance

    mock_minio_instance = MagicMock()
    mock_minio_cls.return_value = mock_minio_instance

    mock_milvus_instance = MagicMock()
    mock_milvus_cls.return_value = mock_milvus_instance

    result = service.delete_employee(emp_id)

    assert result is True
    mock_minio_instance.delete_file.assert_called_once_with("EMP001/sample.wav")
    mock_voice_repo_instance.delete.assert_called_once_with(voice_sample)
    mock_milvus_instance.delete_vectors_by_employee_id.assert_called_once_with(str(emp_id))
    service.repository.delete.assert_called_once_with(mock_emp)
    db_mock.commit.assert_called_once()
