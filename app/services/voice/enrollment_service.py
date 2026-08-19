from io import BytesIO
from typing import BinaryIO, Dict, Optional, Union
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
