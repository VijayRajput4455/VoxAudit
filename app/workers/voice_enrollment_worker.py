import os
from pathlib import Path
import sys
import tempfile
import time

# Ensure project root directory is in sys.path when running script directly
sys.path.append(str(Path(__file__).resolve().parents[2]))
from typing import Any, Dict, Optional
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.core.database import SessionLocal
from app.integrations.milvus.repository import MilvusRepository
from app.integrations.minio.storage import MinioStorage
from app.integrations.rabbitmq.consumer import RabbitMQConsumer
from app.ml.inference.speaker_embedding import SpeakerEmbeddingInference
from app.ml.preprocessing.audio import load_and_preprocess_audio
from app.repositories.voice_sample_repository import VoiceSampleRepository
from app.services.voice.quality_service import QualityService
from app.workers.base import BaseWorker

logger = get_logger(__name__)


class VoiceEnrollmentWorker(BaseWorker):
    """Worker process for processing asynchronous voice sample enrollment jobs."""

    def __init__(
        self,
        db: Optional[Session] = None,
        storage: Optional[MinioStorage] = None,
        milvus_repo: Optional[MilvusRepository] = None,
        inference: Optional[SpeakerEmbeddingInference] = None,
        quality_service: Optional[QualityService] = None,
    ) -> None:
        self.db = db
        self.storage = storage if storage is not None else MinioStorage()
        self.milvus_repo = milvus_repo if milvus_repo is not None else MilvusRepository()
        self.inference = inference if inference is not None else SpeakerEmbeddingInference()
        self.quality_service = quality_service if quality_service is not None else QualityService()
        self.max_retries = getattr(settings, "VOICE_ENROLLMENT_MAX_RETRIES", 3)

    def process_job(self, job_payload: Dict[str, Any]) -> bool:
        """Consumes RabbitMQ enrollment job, downloads audio from MinIO, computes 192D ECAPA embedding,
        stores vector in Milvus, and updates PostgreSQL VoiceSample status to ACTIVE.
        """
        job_id = job_payload.get("job_id")
        voice_sample_id_str = job_payload.get("voice_sample_id")
        employee_id_str = job_payload.get("employee_id")
        storage_key = job_payload.get("storage_key")
        attempt = job_payload.get("attempt", 1)

        if not voice_sample_id_str or not storage_key:
            logger.error(f"Invalid job payload structure: {job_payload}")
            return False

        logger.info(
            f"Processing voice enrollment job '{job_id}' (attempt {attempt}/{self.max_retries}) for sample '{voice_sample_id_str}'",
            extra={
                "job_id": job_id,
                "voice_sample_id": voice_sample_id_str,
                "employee_id": employee_id_str,
                "attempt": attempt,
            },
        )

        db_session = self.db if self.db is not None else SessionLocal()
        close_session = self.db is None

        temp_audio_path = None
        start_time = time.perf_counter()

        try:
            sample_repo = VoiceSampleRepository(db_session)
            sample = sample_repo.get_by_id(UUID(voice_sample_id_str))

            if not sample:
                logger.error(f"VoiceSample record '{voice_sample_id_str}' not found in database.")
                return False

            # IDEMPOTENCY CHECK: If job already completed, acknowledge immediately
            if sample.status == "ACTIVE" and sample.embedding_id:
                logger.info(f"Sample '{voice_sample_id_str}' is already ACTIVE (embedding_id: '{sample.embedding_id}'). Skipping.")
                return True

            # Mark status as PROCESSING
            sample.status = "PROCESSING"
            sample_repo.update(sample)
            db_session.commit()

            # Download audio file from MinIO
            audio_bytes = self.storage.download_file(storage_key)

            # Write to temporary file for audio preprocessing
            ext = storage_key.split(".")[-1] if "." in storage_key else "wav"
            with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp_file:
                tmp_file.write(audio_bytes)
                temp_audio_path = tmp_file.name

            # Preprocess audio (verify mono 16kHz tensor & duration limits)
            waveform, sample_rate = load_and_preprocess_audio(temp_audio_path)
            num_channels, num_samples = waveform.shape
            duration_seconds = round(num_samples / float(sample_rate), 3)

            # Assess audio quality
            quality_score = self.quality_service.assess_quality(waveform, sample_rate)

            # Generate L2-normalized 192D ECAPA embedding vector inside torch.inference_mode()
            tensor_embedding = self.inference.generate_from_waveform(waveform)
            numpy_embedding = tensor_embedding.numpy()

            # Generate unique embedding ID for Milvus reference
            embedding_id = str(uuid4())
            model_name = getattr(settings, "EMBEDDING_MODEL", "speechbrain/spkrec-ecapa-voxceleb")
            model_version = getattr(settings, "EMBEDDING_MODEL_VERSION", "1.0.0")

            # Store actual 192D vector in Milvus
            self.milvus_repo.insert_vector(
                embedding_id=embedding_id,
                employee_id=str(sample.employee_id),
                voice_sample_id=str(sample.id),
                embedding=numpy_embedding,
                model=model_name,
                model_version=model_version,
            )

            # Update PostgreSQL VoiceSample record
            sample.embedding_id = embedding_id
            sample.embedding_model = model_name
            sample.embedding_dimension = 192
            sample.model_version = model_version
            sample.duration_seconds = duration_seconds
            sample.sample_rate = sample_rate
            sample.channels = 1
            sample.quality_score = quality_score
            sample.status = "ACTIVE"
            sample.error_message = None

            sample_repo.update(sample)
            db_session.commit()

            total_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.info(
                f"Successfully completed enrollment job '{job_id}' for sample '{voice_sample_id_str}' in {total_ms}ms",
                extra={
                    "job_id": job_id,
                    "voice_sample_id": voice_sample_id_str,
                    "employee_id": employee_id_str,
                    "embedding_id": embedding_id,
                    "duration_seconds": duration_seconds,
                    "quality_score": quality_score,
                    "total_ms": total_ms,
                    "status": "ACTIVE",
                },
            )
            return True

        except Exception as exc:
            db_session.rollback()
            total_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(
                f"Error processing enrollment job '{job_id}' (attempt {attempt}/{self.max_retries}): {str(exc)}",
                exc_info=True,
                extra={"job_id": job_id, "voice_sample_id": voice_sample_id_str, "attempt": attempt},
            )

            # Handle retries and failure status in database
            try:
                sample_repo = VoiceSampleRepository(db_session)
                sample = sample_repo.get_by_id(UUID(voice_sample_id_str))
                if sample:
                    if attempt >= self.max_retries:
                        sample.status = "FAILED"
                        sample.error_message = f"Processing failed after {attempt} attempts: {str(exc)}"
                        logger.error(f"Sample '{voice_sample_id_str}' exceeded max retries ({self.max_retries}). Marked FAILED.")
                    else:
                        sample.status = "FAILED"
                        sample.error_message = f"Attempt {attempt} failed: {str(exc)}"
                    sample_repo.update(sample)
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
        """Starts worker event loop listening on RabbitMQ queue."""
        logger.info("Starting Voice Enrollment Worker...")
        consumer = RabbitMQConsumer()
        consumer.start_consuming(
            callback=self.process_job,
            queue_name=settings.RABBITMQ_QUEUE,
            routing_key=settings.RABBITMQ_ROUTING_KEY,
        )


if __name__ == "__main__":
    from app.core.logging import setup_logging
    setup_logging()
    worker = VoiceEnrollmentWorker()
    worker.start()
