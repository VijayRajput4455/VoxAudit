from io import BytesIO
from typing import Any, BinaryIO, Dict, Optional, Union
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import StorageException, VoxAuditException
from app.core.logging import get_logger
from app.integrations.minio.storage import MinioStorage
from app.integrations.rabbitmq.publisher import RabbitMQPublisher
from app.models.voice_sample import VoiceSample
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.voice_sample_repository import VoiceSampleRepository

logger = get_logger(__name__)


class EnrollmentService:
    """Coordinates asynchronous voice enrollment requests."""

    def __init__(
        self,
        db: Session,
        storage: Optional[MinioStorage] = None,
        publisher: Optional[RabbitMQPublisher] = None,
    ) -> None:
        self.db = db
        self.employee_repo = EmployeeRepository(db)
        self.voice_sample_repo = VoiceSampleRepository(db)
        self.storage = storage if storage is not None else MinioStorage()
        self.publisher = publisher if publisher is not None else RabbitMQPublisher()

    def enroll_voice_sample(
        self,
        employee_id: Union[UUID, str],
        file_obj: BinaryIO,
        original_file_name: str,
        file_size: int,
        content_type: str = "audio/wav",
        sample_type: str = "ENROLLMENT",
        source: Optional[str] = "web",
    ) -> VoiceSample:
        """Validates employee & file, stores original audio in MinIO, creates PostgreSQL record (status=PENDING),
        and publishes an asynchronous job to RabbitMQ. Returns immediately.
        """
        # 1. Validate employee exists
        employee = self.employee_repo.get_by_id(UUID(str(employee_id)))
        if not employee:
            raise VoxAuditException(f"Employee with ID '{employee_id}' not found.")

        # 2. Validate file size against maximum limit
        max_bytes = getattr(settings, "MAX_UPLOAD_SIZE_BYTES", 50 * 1024 * 1024)
        if file_size > max_bytes:
            raise ValueError(f"File size ({file_size} bytes) exceeds maximum allowed limit ({max_bytes} bytes).")

        # 3. Generate IDs and predictable storage key
        voice_sample_id = uuid4()
        extension = original_file_name.split(".")[-1] if "." in original_file_name else "wav"
        
        # Use employee_code or employee_id for predictable storage key
        employee_code = getattr(employee, "employee_code", None) or str(employee.id)[:8]
        storage_key = MinioStorage.generate_storage_key(
            employee_code=employee_code,
            voice_sample_id=voice_sample_id,
            extension=extension,
        )

        # 4. Upload original audio file to MinIO storage
        try:
            self.storage.upload_stream(
                file_obj=file_obj,
                length=file_size,
                storage_key=storage_key,
                content_type=content_type,
                metadata={
                    "employee_id": str(employee.id),
                    "original_file_name": original_file_name,
                },
            )
        except Exception as exc:
            logger.error(f"MinIO storage upload failed for key '{storage_key}': {str(exc)}", exc_info=True)
            raise StorageException(f"Audio storage upload failed: {str(exc)}") from exc

        # 5. Create PostgreSQL VoiceSample record (status = PENDING)
        voice_sample = VoiceSample(
            id=voice_sample_id,
            employee_id=str(employee.id),
            original_file_name=original_file_name,
            storage_key=storage_key,
            audio_format=extension.lower(),
            sample_type=sample_type,
            source=source,
            status="PENDING",
        )

        try:
            created_sample = self.voice_sample_repo.create(voice_sample)
            self.db.commit()
        except Exception as exc:
            self.db.rollback()
            # Rollback compensation: remove orphaned object from MinIO
            logger.error(f"Database creation failed. Rolling back MinIO object '{storage_key}'...", exc_info=True)
            try:
                self.storage.delete_file(storage_key)
            except Exception:
                pass
            raise VoxAuditException(f"Database creation failed: {str(exc)}") from exc

        # 6. Publish RabbitMQ asynchronous embedding job
        job_id = str(uuid4())
        job_payload = {
            "event": "VOICE_EMBEDDING_GENERATION",
            "job_id": job_id,
            "voice_sample_id": str(created_sample.id),
            "employee_id": str(employee.id),
            "storage_bucket": settings.MINIO_BUCKET,
            "storage_key": storage_key,
            "attempt": 1,
        }

        try:
            self.publisher.publish_enrollment_job(job_payload)
        except Exception as exc:
            logger.error(
                f"Failed to publish RabbitMQ job for voice sample '{created_sample.id}'. Marking sample FAILED.",
                exc_info=True,
            )
            created_sample.status = "FAILED"
            created_sample.error_message = f"Queue publishing error: {str(exc)}"
            self.voice_sample_repo.update(created_sample)
            self.db.commit()
            raise VoxAuditException(f"Failed to queue enrollment processing job: {str(exc)}") from exc

        logger.info(
            f"Voice sample '{created_sample.id}' accepted for asynchronous processing (job '{job_id}')",
            extra={
                "voice_sample_id": str(created_sample.id),
                "employee_id": str(employee.id),
                "job_id": job_id,
                "status": "PENDING",
            },
        )
        return created_sample

    def enroll_voice_samples_batch(
        self,
        employee_id: Union[UUID, str],
        files: list[tuple[BinaryIO, str, int, str]],
        sample_type: str = "ENROLLMENT",
        source: Optional[str] = "web",
    ) -> list[VoiceSample]:
        """Enrolls multiple voice samples for an employee in a single batch request."""
        employee = self.employee_repo.get_by_id(UUID(str(employee_id)))
        if not employee:
            raise VoxAuditException(f"Employee with ID '{employee_id}' not found.")

        samples = []
        for file_obj, original_file_name, file_size, content_type in files:
            sample = self.enroll_voice_sample(
                employee_id=employee_id,
                file_obj=file_obj,
                original_file_name=original_file_name,
                file_size=file_size,
                content_type=content_type,
                sample_type=sample_type,
                source=source,
            )
            samples.append(sample)
        return samples

    def get_voice_database_summary(self) -> Dict[str, Any]:
        """Generates a detailed summary of all enrolled employees, their voice sample files, and Milvus vector counts."""
        from sqlalchemy import select
        from app.models.employee import Employee
        from app.models.voice_sample import VoiceSample
        from app.integrations.milvus.repository import MilvusRepository

        milvus_repo = MilvusRepository()
        employees = self.db.scalars(select(Employee).order_by(Employee.first_name)).all()
        all_samples = self.db.scalars(select(VoiceSample).order_by(VoiceSample.created_at.desc())).all()

        samples_by_employee: dict[str, list[VoiceSample]] = {}
        for sample in all_samples:
            emp_id = str(sample.employee_id)
            if emp_id not in samples_by_employee:
                samples_by_employee[emp_id] = []
            samples_by_employee[emp_id].append(sample)

        profiles = []
        total_enrolled_employees = 0

        for emp in employees:
            emp_id_str = str(emp.id)
            emp_samples = samples_by_employee.get(emp_id_str, [])
            emp_vectors = milvus_repo.get_vectors_by_employee_id(emp_id_str)
            vector_count = len(emp_vectors)

            if emp_samples or vector_count > 0:
                total_enrolled_employees += 1

            sample_items = [
                {
                    "id": s.id,
                    "original_file_name": s.original_file_name,
                    "storage_key": s.storage_key,
                    "audio_format": s.audio_format,
                    "duration_seconds": float(s.duration_seconds) if s.duration_seconds is not None else None,
                    "quality_score": float(s.quality_score) if s.quality_score is not None else None,
                    "embedding_id": s.embedding_id,
                    "status": s.status,
                    "created_at": s.created_at,
                }
                for s in emp_samples
            ]

            dept_name = emp.department.name if getattr(emp, "department", None) else None
            profiles.append(
                {
                    "employee_id": emp.id,
                    "employee_code": emp.employee_code,
                    "first_name": emp.first_name,
                    "last_name": emp.last_name,
                    "email": emp.email,
                    "department_id": emp.department_id,
                    "department_name": dept_name,
                    "total_samples": len(emp_samples),
                    "total_vectors": vector_count,
                    "samples": sample_items,
                }
            )

        milvus_stats = milvus_repo.get_collection_stats()
        total_vectors_count = milvus_stats.get("total_vectors", 0)

        return {
            "total_employees_enrolled": total_enrolled_employees,
            "total_voice_samples": len(all_samples),
            "total_vectors": total_vectors_count,
            "profiles": profiles,
        }
