from functools import lru_cache

from pymilvus import MilvusClient

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@lru_cache(maxsize=1)
def get_milvus_client() -> MilvusClient:
    """Returns a process-wide cached Milvus client instance using @lru_cache(maxsize=1)."""
    host = getattr(settings, "MILVUS_HOST", "localhost")
    port = getattr(settings, "MILVUS_PORT", 19530)

    if host.lower() == "lite" or host.endswith(".db"):
        db_file = host if host.endswith(".db") else "voxaudit_milvus.db"
        logger.info(f"Initializing Milvus Lite embedded vector database: {db_file}")
        return MilvusClient(uri=db_file)

    uri = f"http://{host}:{port}"
    logger.info(f"Initializing process-wide Milvus client for URI: {uri}")

    try:
        return MilvusClient(
            uri=uri,
            user=settings.MILVUS_USER,
            password=settings.MILVUS_PASSWORD,
        )
    except Exception as exc:
        logger.warning(f"Failed to connect to Milvus server at {uri}: {str(exc)}. Falling back to Milvus Lite (voxaudit_milvus.db).")
        return MilvusClient(uri="voxaudit_milvus.db")
