from functools import lru_cache

from minio import Minio

from app.core.config import settings


@lru_cache(maxsize=1)
def get_minio_client() -> Minio:
    """Returns a process-wide cached MinIO client instance.
    
    Using @lru_cache(maxsize=1) ensures that only one MinIO client object is instantiated 
    per Python process, facilitating connection pooling without needing a manually 
    implemented Singleton class.
    """
    return Minio(
        endpoint=settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
        region=settings.MINIO_REGION,
    )