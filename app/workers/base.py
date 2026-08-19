from abc import ABC, abstractmethod
from typing import Any, Dict

from app.core.logging import get_logger

logger = get_logger(__name__)


class BaseWorker(ABC):
    """Abstract base worker class."""

    @abstractmethod
    def process_job(self, job_payload: Dict[str, Any]) -> bool:
        """Processes a single job payload. Returns True to ack, False to nack."""
        pass

    @abstractmethod
    def start(self) -> None:
        """Starts worker loop listening for jobs."""
        pass
