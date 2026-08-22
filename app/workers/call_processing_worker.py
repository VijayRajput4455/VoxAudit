import os
from pathlib import Path
import sys
import tempfile
import time
from typing import Any, Dict, Optional
from uuid import UUID

# Ensure project root directory is in sys.path when running script directly
sys.path.append(str(Path(__file__).resolve().parents[2]))

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.integrations.minio.storage import MinioStorage
from app.integrations.rabbitmq.consumer import RabbitMQConsumer
from app.models.call_job import CallJob
from app.services.call.call_processor import CallProcessor
from app.workers.base import BaseWorker

logger = get_logger(__name__)


class CallProcessingWorker(BaseWorker):
    """Worker process for processing asynchronous customer support call processing jobs."""

    def __init__(
        self,
        db: Optional[Session] = None,
        storage: Optional[MinioStorage] = None,
        processor: Optional[CallProcessor] = None,
    ) -> None:
        self.db = db
        self.storage = storage if storage is not None else MinioStorage()
        self.processor = processor
        self.max_retries = getattr(settings, "VOICE_ENROLLMENT_MAX_RETRIES", 3)

    def process_job(self, job_payload: Dict[str, Any]) -> bool:
        """Consumes RabbitMQ call job, downloads audio from MinIO, runs Whisper + Pyannote + ECAPA,
        matches speaker vectors in Milvus, and saves full speaker-attributed transcript JSON in PostgreSQL.
        """
        job_id = job_payload.get("job_id")
        call_id_str = job_payload.get("call_id")
        storage_key = job_payload.get("storage_key")
        attempt = job_payload.get("attempt", 1)

        if not call_id_str or not storage_key:
            logger.error(f"Invalid call job payload structure: {job_payload}")
            return False

        logger.info(
            f"Processing call job '{job_id}' (attempt {attempt}/{self.max_retries}) for call '{call_id_str}'",
            extra={"job_id": job_id, "call_id": call_id_str, "attempt": attempt},
        )

        db_session = self.db if self.db is not None else SessionLocal()
        close_session = self.db is None

        temp_audio_path = None
        start_time = time.perf_counter()

        try:
            call_job = db_session.get(CallJob, UUID(call_id_str))

            if not call_job:
                logger.error(f"CallJob record '{call_id_str}' not found in database.")
                return False

            # IDEMPOTENCY CHECK: If job already completed, acknowledge immediately
            if call_job.status == "COMPLETED" and call_job.transcript_json:
                logger.info(f"Call '{call_id_str}' is already COMPLETED. Skipping.")
                return True

            # Mark status as PROCESSING
            call_job.status = "PROCESSING"
            db_session.commit()

            # Download call audio file from MinIO
            audio_bytes = self.storage.download_file(storage_key)

            # Write to temporary file for audio processing
            ext = storage_key.split(".")[-1] if "." in storage_key else "wav"
            with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp_file:
                tmp_file.write(audio_bytes)
                temp_audio_path = tmp_file.name

            # Instantiate CallProcessor if not injected
            call_processor = self.processor if self.processor is not None else CallProcessor(db_session=db_session)

            # Run full Call Processing pipeline (Whisper + Pyannote + ECAPA + Milvus + Word Alignment)
            result = call_processor.process_call(temp_audio_path)

            # Update PostgreSQL CallJob record
            call_job.duration_seconds = result.get("duration_seconds")
            call_job.detected_language = result.get("detected_language")
            call_job.speakers_count = result.get("speakers_count")
            call_job.identified_employee_id = result.get("identified_employee_id")
            call_job.transcript_json = {
                "speaker_mappings": result.get("speaker_mappings"),
                "turns": result.get("transcript_turns"),
            }
            call_job.status = "COMPLETED"
            call_job.error_message = None

            db_session.commit()

            total_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.info(
                f"Successfully completed call job '{job_id}' for call '{call_id_str}' in {total_ms}ms",
                extra={"job_id": job_id, "call_id": call_id_str, "status": "COMPLETED", "total_ms": total_ms},
            )
            return True

        except Exception as exc:
            db_session.rollback()
            logger.error(
                f"Error processing call job '{job_id}' (attempt {attempt}/{self.max_retries}): {str(exc)}",
                exc_info=True,
                extra={"job_id": job_id, "call_id": call_id_str, "attempt": attempt},
            )

            try:
                call_job = db_session.get(CallJob, UUID(call_id_str))
                if call_job:
                    call_job.status = "FAILED"
                    call_job.error_message = f"Call processing failed (attempt {attempt}/{self.max_retries}): {str(exc)}"
                    db_session.commit()
            except Exception:
                pass

            return False

        finally:
            if temp_audio_path and os.path.exists(temp_audio_path):
                try:
                    os.remove(temp_audio_path)
                except Exception:
                    pass
            if close_session:
                db_session.close()

    def start(self) -> None:
        """Starts worker event loop listening on RabbitMQ call queue."""
        logger.info("Starting Call Processing Worker...")
        consumer = RabbitMQConsumer()
        consumer.start_consuming(
            callback=self.process_job,
            queue_name=settings.RABBITMQ_CALL_QUEUE,
            routing_key=settings.RABBITMQ_CALL_ROUTING_KEY,
        )


if __name__ == "__main__":
    from app.core.logging import setup_logging
    setup_logging()
    worker = CallProcessingWorker()
    worker.start()
