from pymilvus import DataType, MilvusClient

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def ensure_voice_embeddings_collection(client: MilvusClient) -> str:
    """Ensures the voice_embeddings collection and index exist in Milvus."""
    collection_name = settings.MILVUS_COLLECTION

    try:
        if client.has_collection(collection_name):
            return collection_name

        logger.info(f"Creating Milvus vector collection: '{collection_name}' (dimension={settings.EMBEDDING_DIMENSION})")

        schema = client.create_schema(
            auto_id=False,
            enable_dynamic_field=True,
            description="VoxAudit 192D Speaker Voice Embeddings",
        )

        # Primary key field: embedding_id
        schema.add_field(field_name="id", datatype=DataType.VARCHAR, max_length=255, is_primary=True)
        schema.add_field(field_name="employee_id", datatype=DataType.VARCHAR, max_length=255)
        schema.add_field(field_name="voice_sample_id", datatype=DataType.VARCHAR, max_length=255)
        schema.add_field(field_name="embedding", datatype=DataType.FLOAT_VECTOR, dim=settings.EMBEDDING_DIMENSION)
        schema.add_field(field_name="model", datatype=DataType.VARCHAR, max_length=100)
        schema.add_field(field_name="model_version", datatype=DataType.VARCHAR, max_length=50)

        # Index parameters
        index_params = client.prepare_index_params()
        index_params.add_index(
            field_name="embedding",
            metric_type="COSINE",
            index_type="AUTOINDEX",
        )

        client.create_collection(
            collection_name=collection_name,
            schema=schema,
            index_params=index_params,
        )

        logger.info(f"Milvus collection '{collection_name}' created successfully.")
        return collection_name

    except Exception as exc:
        logger.error(f"Failed to ensure Milvus collection '{collection_name}': {str(exc)}", exc_info=True)
        raise
