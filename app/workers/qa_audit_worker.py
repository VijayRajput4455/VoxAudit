import os
from pathlib import Path
import sys
import time
from typing import Any, Dict, Optional
from uuid import UUID

sys.path.append(str(Path(__file__).resolve().parents[2]))

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.models.call_job import CallJob
from app.models.employee import Employee
from app.services.analytics.qa_scorecard_service import QAScorecardService
from app.workers.base import BaseWorker

logger = get_logger(__name__)


class QAAuditWorker(BaseWorker):
    """Dedicated RabbitMQ worker process for running QA Scorecard & CX Analytics on calls."""

    def __init__(
        self,
        db: Optional[Session] = None,
        qa_service: Optional[QAScorecardService] = None,
    ) -> None:
        self.db = db
        self.qa_service = qa_service if qa_service is not None else QAScorecardService()

    def process_job(self, job_payload: Dict[str, Any]) -> bool:
        """Consumes RabbitMQ QA audit job, loads transcript from PostgreSQL,
        computes QA Scorecard & CX Signals, and updates the SAME call_jobs database row.
        """
        job_id = job_payload.get("job_id")
        call_id_str = job_payload.get("call_id")

        if not call_id_str:
            logger.error(f"Invalid QA audit job payload structure: {job_payload}")
            return False

        logger.info(
            f"Processing QA audit job '{job_id}' for call '{call_id_str}'",
            extra={"job_id": job_id, "call_id": call_id_str},
        )

        if self.db is not None:
            db_session = self.db
            close_session = False
        else:
            from app.core.database import SessionLocal
            db_session = SessionLocal()
            close_session = True

        start_time = time.perf_counter()

        try:
            call_job = db_session.get(CallJob, UUID(call_id_str))

            if not call_job:
                logger.error(f"CallJob record '{call_id_str}' not found in database.")
                return False

            if not call_job.transcript_json or "turns" not in call_job.transcript_json:
                logger.error(f"CallJob record '{call_id_str}' has no valid transcript turns to audit.")
                return False

            transcript_turns = call_job.transcript_json.get("turns", [])
            speaker_mappings = call_job.transcript_json.get("speaker_mappings", {})

            # Retrieve employee name if identified
            employee_name = None
            if call_job.identified_employee_id:
                employee = db_session.get(Employee, call_job.identified_employee_id)
                if employee:
                    employee_name = employee.name

            # Run QA Scorecard & CX Engine
            scorecard = self.qa_service.compute_scorecard(
                transcript_turns=transcript_turns,
                speaker_mappings=speaker_mappings,
                identified_employee_name=employee_name,
                duration_seconds=call_job.duration_seconds or 0.0,
                call_id=call_id_str,
            )

            # Extract overall score safely from Enterprise Schema v1.0
            overall_score = scorecard.get("overall_qa_score")
            if overall_score is None and "overall_evaluation" in scorecard:
                overall_score = scorecard["overall_evaluation"].get("score", 50.0)

            call_job.qa_score = float(overall_score) if overall_score is not None else 50.0
            call_job.qa_scorecard_json = scorecard

            # Update transcript_json to also include qa_scorecard reference
            updated_transcript = dict(call_job.transcript_json)
            updated_transcript["qa_scorecard"] = scorecard
            call_job.transcript_json = updated_transcript

            db_session.commit()

            total_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.info(
                f"Successfully completed QA audit job '{job_id}' for call '{call_id_str}'. "
                f"QA Score: {call_job.qa_score}/100 in {total_ms}ms",
                extra={"job_id": job_id, "call_id": call_id_str, "qa_score": call_job.qa_score, "total_ms": total_ms},
            )
            return True

        except Exception as exc:
            db_session.rollback()
            logger.error(
                f"Error processing QA audit job '{job_id}' for call '{call_id_str}': {str(exc)}",
                exc_info=True,
                extra={"job_id": job_id, "call_id": call_id_str},
            )
            return False

        finally:
            if close_session:
                db_session.close()

    def start(self) -> None:
        """Starts worker event loop listening on RabbitMQ QA audit queue."""
        from app.integrations.rabbitmq.consumer import RabbitMQConsumer
        logger.info("Starting QA Audit Worker...")
        consumer = RabbitMQConsumer()
        consumer.start_consuming(
            callback=self.process_job,
            queue_name=settings.RABBITMQ_QA_QUEUE,
            routing_key=settings.RABBITMQ_QA_ROUTING_KEY,
        )



if __name__ == "__main__":
    from app.core.logging import setup_logging
    setup_logging()
    worker = QAAuditWorker()
    worker.start()
