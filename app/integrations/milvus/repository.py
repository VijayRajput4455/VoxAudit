from typing import Any, Dict, List, Optional
import numpy as np
from pymilvus import MilvusClient

from app.core.config import settings
from app.core.logging import get_logger
from app.integrations.milvus.client import get_milvus_client
from app.integrations.milvus.collection import ensure_voice_embeddings_collection

logger = get_logger(__name__)


class MilvusRepository:
    """Production-grade vector database repository for Milvus."""

    def __init__(self, client: Optional[MilvusClient] = None) -> None:
        if client is None:
            client = get_milvus_client()
        self.client = client
        self.collection_name = settings.MILVUS_COLLECTION

    def ensure_collection(self) -> None:
        ensure_voice_embeddings_collection(self.client)

    def insert_vector(
        self,
        embedding_id: str,
        employee_id: str,
        voice_sample_id: str,
        embedding: np.ndarray,
        model: str,
        model_version: str,
    ) -> str:
        """Inserts a 192D speaker embedding vector into Milvus."""
        self.ensure_collection()

        vector_list = embedding.tolist() if isinstance(embedding, np.ndarray) else list(embedding)

        data = [
            {
                "id": str(embedding_id),
                "employee_id": str(employee_id),
                "voice_sample_id": str(voice_sample_id),
                "embedding": vector_list,
                "model": model,
                "model_version": model_version,
            }
        ]

        try:
            res = self.client.insert(
                collection_name=self.collection_name,
                data=data,
            )
            logger.info(
                f"Inserted embedding vector '{embedding_id}' into Milvus for employee '{employee_id}'",
                extra={
                    "embedding_id": embedding_id,
                    "employee_id": employee_id,
                    "voice_sample_id": voice_sample_id,
                    "collection": self.collection_name,
                },
            )
            return str(embedding_id)
        except Exception as exc:
            logger.error(f"Failed to insert vector '{embedding_id}' into Milvus: {str(exc)}", exc_info=True)
            raise

    def get_vector_by_id(self, embedding_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves vector record by embedding_id."""
        try:
            results = self.client.get(
                collection_name=self.collection_name,
                ids=[str(embedding_id)],
            )
            return results[0] if results else None
        except Exception as exc:
            logger.warning(f"Error fetching vector '{embedding_id}' from Milvus: {str(exc)}")
            return None

    def delete_vector(self, embedding_id: str) -> None:
        """Deletes vector record by embedding_id."""
        try:
            self.client.delete(
                collection_name=self.collection_name,
                ids=[str(embedding_id)],
            )
            logger.info(f"Deleted vector '{embedding_id}' from Milvus collection '{self.collection_name}'")
        except Exception as exc:
            logger.error(f"Failed to delete vector '{embedding_id}' from Milvus: {str(exc)}", exc_info=True)
            raise
