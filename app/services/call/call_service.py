from io import BytesIO
from typing import BinaryIO, Dict, Optional, Union
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import StorageException, VoxAuditException
from app.core.logging import get_logger
from app.integrations.minio.storage import MinioStorage
from app.integrations.rabbitmq.publisher import RabbitMQPublisher
from app.models.call_job import CallJob
from app.repositories.employee_repository import EmployeeRepository

logger = get_logger(__name__)


class CallService:
    """Coordinates asynchronous customer support call processing requests."""

    def __init__(
        self,
        db: Session,
        storage: Optional[MinioStorage] = None,
        publisher: Optional[RabbitMQPublisher] = None,
    ) -> None:
        self.db = db
        self.employee_repo = EmployeeRepository(db)
        self.storage = storage if storage is not None else MinioStorage()
        self.publisher = publisher if publisher is not None else RabbitMQPublisher()

    def submit_call_job(
        self,
        file_obj: BinaryIO,
        original_file_name: str,
        file_size: int,
        content_type: str = "audio/wav",
    ) -> CallJob:
        """Stores call audio in MinIO, saves CallJob record in PostgreSQL (status=PENDING),
        and publishes an asynchronous call processing job to RabbitMQ. Returns immediately.
        """
        # 1. Validate file size against maximum limit
        max_bytes = getattr(settings, "MAX_UPLOAD_SIZE_BYTES", 50 * 1024 * 1024)
        if file_size > max_bytes:
            raise ValueError(f"Call file size ({file_size} bytes) exceeds maximum allowed limit ({max_bytes} bytes).")

        # 2. Generate Call ID and predictable MinIO storage key
        call_id = uuid4()
        extension = original_file_name.split(".")[-1] if "." in original_file_name else "wav"
        storage_key = f"calls/{call_id}.{extension}"

        # 3. Upload call audio file to MinIO storage
        try:
            self.storage.upload_stream(
                file_obj=file_obj,
                length=file_size,
                storage_key=storage_key,
                content_type=content_type,
                metadata={"original_file_name": original_file_name},
            )
        except Exception as exc:
            logger.error(f"MinIO call upload failed for key '{storage_key}': {str(exc)}", exc_info=True)
            raise StorageException(f"Call audio storage upload failed: {str(exc)}") from exc

        # 4. Create PostgreSQL CallJob record (status = PENDING)
        call_job = CallJob(
            id=call_id,
            original_file_name=original_file_name,
            storage_key=storage_key,
            audio_format=extension.lower(),
            status="PENDING",
        )

        try:
            self.db.add(call_job)
            self.db.commit()
            self.db.refresh(call_job)
        except Exception as exc:
            self.db.rollback()
            # Rollback compensation: remove orphaned object from MinIO
            logger.error(f"Database creation failed. Rolling back MinIO object '{storage_key}'...", exc_info=True)
            try:
                self.storage.delete_file(storage_key)
            except Exception:
                pass
            raise VoxAuditException(f"Database call job creation failed: {str(exc)}") from exc

        # 5. Publish RabbitMQ asynchronous call processing job
        job_id = str(uuid4())
        job_payload = {
            "event": "CALL_PROCESSING",
            "job_id": job_id,
            "call_id": str(call_job.id),
            "storage_bucket": settings.MINIO_BUCKET,
            "storage_key": storage_key,
            "attempt": 1,
        }

        try:
            self.publisher.publish_enrollment_job(job_payload)
        except Exception as exc:
            logger.error(f"Failed to publish RabbitMQ call processing job for '{call_job.id}'.", exc_info=True)
            call_job.status = "FAILED"
            call_job.error_message = f"Queue publishing error: {str(exc)}"
            self.db.commit()
            raise VoxAuditException(f"Failed to queue call processing job: {str(exc)}") from exc

        logger.info(
            f"Call job '{call_job.id}' accepted for asynchronous processing (job '{job_id}')",
            extra={"call_id": str(call_job.id), "job_id": job_id, "status": "PENDING"},
        )
        return call_job
