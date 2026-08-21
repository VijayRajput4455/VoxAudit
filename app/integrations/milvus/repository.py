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
            try:
                self.client.flush(self.collection_name)
            except Exception:
                pass
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
            try:
                self.client.flush(self.collection_name)
            except Exception:
                pass
            logger.info(f"Deleted vector '{embedding_id}' from Milvus collection '{self.collection_name}'")
        except Exception as exc:
            logger.error(f"Failed to delete vector '{embedding_id}' from Milvus: {str(exc)}", exc_info=True)
            raise

    def search_vectors(
        self,
        query_embedding: np.ndarray,
        top_k: int = 5,
        filter_expression: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Searches top-k similar vector embeddings in Milvus using Cosine similarity."""
        self.ensure_collection()
        vector_list = query_embedding.tolist() if isinstance(query_embedding, np.ndarray) else list(query_embedding)

        try:
            search_params = {
                "collection_name": self.collection_name,
                "data": [vector_list],
                "limit": top_k,
                "output_fields": ["employee_id", "voice_sample_id", "model", "model_version"],
            }
            if filter_expression:
                search_params["filter"] = filter_expression

            results = self.client.search(**search_params)

            matches = []
            if results and len(results) > 0:
                for hit in results[0]:
                    # PyMilvus search hit result
                    entity = hit.get("entity", {}) if isinstance(hit, dict) else getattr(hit, "entity", {})
                    distance = hit.get("distance", 0.0) if isinstance(hit, dict) else getattr(hit, "distance", 0.0)
                    matches.append({
                        "embedding_id": hit.get("id") if isinstance(hit, dict) else getattr(hit, "id", None),
                        "similarity_score": round(float(distance), 4),
                        "employee_id": entity.get("employee_id"),
                        "voice_sample_id": entity.get("voice_sample_id"),
                        "model": entity.get("model"),
                        "model_version": entity.get("model_version"),
                    })

            logger.info(f"Found {len(matches)} matching voice vectors in Milvus.")
            return matches
        except Exception as exc:
            logger.error(f"Failed to perform vector search in Milvus: {str(exc)}", exc_info=True)
            raise

    def get_vectors_by_employee_id(self, employee_id: str) -> List[Dict[str, Any]]:
        """Queries Milvus for all vector records matching employee_id."""
        self.ensure_collection()
        try:
            try:
                self.client.flush(self.collection_name)
            except Exception:
                pass
            results = self.client.query(
                collection_name=self.collection_name,
                filter=f'employee_id == "{str(employee_id)}"',
                output_fields=["id", "employee_id", "voice_sample_id", "model", "model_version"],
                limit=16384,
            )
            return results if results else []
        except Exception as exc:
            logger.error(f"Failed to fetch vectors for employee '{employee_id}' from Milvus: {str(exc)}")
            return []

    def delete_vectors_by_employee_id(self, employee_id: str) -> int:
        """Deletes all vector records matching employee_id from Milvus."""
        self.ensure_collection()
        try:
            res = self.client.delete(
                collection_name=self.collection_name,
                filter=f'employee_id == "{str(employee_id)}"',
            )
            try:
                self.client.flush(self.collection_name)
            except Exception:
                pass
            logger.info(f"Deleted vectors for employee '{employee_id}' from Milvus collection '{self.collection_name}'")
            return res.get("delete_count", 0) if isinstance(res, dict) else 1
        except Exception as exc:
            logger.error(f"Failed to delete vectors for employee '{employee_id}' from Milvus: {str(exc)}", exc_info=True)
            return 0

    def delete_all_vectors(self) -> int:
        """Deletes all vector embeddings in Milvus collection."""
        self.ensure_collection()
        try:
            res = self.client.delete(
                collection_name=self.collection_name,
                filter='id != ""',
            )
            try:
                self.client.flush(self.collection_name)
            except Exception:
                pass
            logger.info(f"Purged all vector embeddings from Milvus collection '{self.collection_name}'")
            return res.get("delete_count", 0) if isinstance(res, dict) else 1
        except Exception as exc:
            logger.error(f"Failed to delete all vectors from Milvus: {str(exc)}", exc_info=True)
            return 0

    def get_collection_stats(self) -> Dict[str, Any]:
        """Returns Milvus collection stats (active total vectors, collection name, dimension)."""
        self.ensure_collection()
        try:
            try:
                self.client.flush(self.collection_name)
            except Exception:
                pass

            active_records = self.client.query(
                collection_name=self.collection_name,
                filter='id != ""',
                output_fields=["id"],
                limit=16384,
            )
            total_count = len(active_records) if active_records else 0
            return {
                "collection_name": self.collection_name,
                "dimension": settings.EMBEDDING_DIMENSION,
                "total_vectors": total_count,
                "status": "HEALTHY",
            }
        except Exception as exc:
            logger.warning(f"Error fetching Milvus stats: {str(exc)}")
            return {
                "collection_name": self.collection_name,
                "dimension": settings.EMBEDDING_DIMENSION,
                "total_vectors": 0,
                "status": "HEALTHY",
            }
