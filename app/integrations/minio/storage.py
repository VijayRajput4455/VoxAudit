from datetime import timedelta
from io import BytesIO
import time
from typing import BinaryIO, Dict, Optional, Any, Union
from uuid import UUID

from minio import Minio
from minio.datatypes import Object
from minio.error import S3Error
from urllib3.exceptions import MaxRetryError, HTTPError

from app.core.config import settings
from app.core.exceptions import (
    StorageConnectionException,
    StorageException,
    StorageFileNotFoundException,
)
from app.core.logging import get_logger

logger = get_logger(__name__)

# Supported audio MIME types for voice audits
ALLOWED_AUDIO_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/ogg",
    "audio/flac",
    "audio/x-m4a",
    "audio/m4a",
    "audio/webm",
}


class MinioStorage:
    """Production-grade object storage manager for MinIO / S3.
    
    Responsible solely for object storage operations. Does not contain 
    business logic or database dependencies. Easy to mock for testing.
    """

    def __init__(self, client: Optional[Minio] = None) -> None:
        if client is None:
            from app.integrations.minio.client import get_minio_client
            client = get_minio_client()
        self.client = client
        self.bucket = settings.MINIO_BUCKET
        self._bucket_checked = False

    @staticmethod
    def generate_storage_key(
        employee_code: str,
        voice_sample_id: Union[UUID, str],
        extension: str = "wav",
    ) -> str:
        """Generates a predictable storage key using employee code and voice sample ID.
        
        Example: employees/EMP001/550e8400-e29b-41d4-a716-446655440000.wav
        """
        clean_ext = extension.lstrip(".").lower()
        return f"employees/{employee_code}/{str(voice_sample_id)}.{clean_ext}"

    def ensure_bucket(self) -> None:
        """Ensures that the configured bucket exists. Caches state to eliminate redundant network roundtrips."""
        if self._bucket_checked:
            return

        try:
            exists = self.client.bucket_exists(self.bucket)
            if not exists:
                logger.info(f"Creating MinIO storage bucket: '{self.bucket}'")
                self.client.make_bucket(self.bucket)
            self._bucket_checked = True
        except (S3Error, MaxRetryError, HTTPError) as exc:
            logger.error(f"Failed to check or create bucket '{self.bucket}': {str(exc)}", exc_info=True)
            raise StorageConnectionException(f"MinIO bucket check failed: {str(exc)}") from exc

    def upload_stream(
        self,
        file_obj: BinaryIO,
        length: int,
        storage_key: str,
        content_type: str = "audio/wav",
        metadata: Optional[Dict[str, str]] = None,
    ) -> str:
        """Streams file-like binary object directly to MinIO without loading entire file into RAM."""
        # 1. Validate file size
        max_bytes = getattr(settings, "MAX_UPLOAD_SIZE_BYTES", 50 * 1024 * 1024)
        if length > max_bytes:
            err_msg = f"File size ({length} bytes) exceeds maximum permitted limit ({max_bytes} bytes)."
            logger.warning(err_msg, extra={"storage_key": storage_key, "file_size": length})
            raise ValueError(err_msg)

        # 2. Validate audio content type
        if content_type.lower() not in ALLOWED_AUDIO_TYPES:
            logger.warning(
                f"Unsupported audio content type '{content_type}' for storage key '{storage_key}'."
            )

        self.ensure_bucket()
        start_time = time.perf_counter()

        try:
            self.client.put_object(
                bucket_name=self.bucket,
                object_name=storage_key,
                data=file_obj,
                length=length,
                content_type=content_type,
                metadata=metadata,
            )
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

            logger.info(
                f"Successfully uploaded object '{storage_key}' ({length} bytes) in {duration_ms}ms",
                extra={
                    "storage_key": storage_key,
                    "content_type": content_type,
                    "bytes": length,
                    "duration_ms": duration_ms,
                    "bucket": self.bucket,
                },
            )
            return storage_key

        except (S3Error, MaxRetryError, HTTPError) as exc:
            logger.error(f"Failed to upload object '{storage_key}' to bucket '{self.bucket}': {str(exc)}", exc_info=True)
            raise StorageException(f"Failed to upload object '{storage_key}': {str(exc)}") from exc

    def upload_file(
        self,
        file_data: bytes,
        storage_key: str,
        content_type: str = "audio/wav",
        metadata: Optional[Dict[str, str]] = None,
    ) -> str:
        """Uploads raw byte payload to MinIO."""
        return self.upload_stream(
            file_obj=BytesIO(file_data),
            length=len(file_data),
            storage_key=storage_key,
            content_type=content_type,
            metadata=metadata,
        )

    def download_file(
        self,
        storage_key: str,
    ) -> bytes:
        """Downloads complete object content into bytes."""
        start_time = time.perf_counter()
        response = None

        try:
            response = self.client.get_object(
                bucket_name=self.bucket,
                object_name=storage_key,
            )
            content = response.read()
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

            logger.info(
                f"Downloaded object '{storage_key}' ({len(content)} bytes) in {duration_ms}ms",
                extra={
                    "storage_key": storage_key,
                    "bytes": len(content),
                    "duration_ms": duration_ms,
                    "bucket": self.bucket,
                },
            )
            return content

        except S3Error as exc:
            if exc.code in ("NoSuchKey", "NoSuchBucket"):
                logger.warning(f"Storage object not found: '{storage_key}'")
                raise StorageFileNotFoundException(f"Object '{storage_key}' not found in storage.") from exc
            logger.error(f"Storage download failed for '{storage_key}': {str(exc)}", exc_info=True)
            raise StorageException(f"Failed to download object '{storage_key}': {str(exc)}") from exc
        except (MaxRetryError, HTTPError) as exc:
            logger.error(f"Storage connection failed during download of '{storage_key}': {str(exc)}", exc_info=True)
            raise StorageConnectionException(f"Connection error downloading '{storage_key}': {str(exc)}") from exc
        finally:
            if response:
                response.close()
                response.release_conn()

    def get_file_metadata(
        self,
        storage_key: str,
    ) -> Dict[str, Any]:
        """Retrieves object metadata from MinIO."""
        try:
            stat: Object = self.client.stat_object(
                bucket_name=self.bucket,
                object_name=storage_key,
            )
            return {
                "storage_key": stat.object_name,
                "size": stat.size,
                "content_type": stat.content_type,
                "last_modified": stat.last_modified,
                "etag": stat.etag,
                "metadata": stat.metadata,
            }
        except S3Error as exc:
            if exc.code in ("NoSuchKey", "NoSuchBucket"):
                raise StorageFileNotFoundException(f"Object '{storage_key}' not found in storage.") from exc
            raise StorageException(f"Failed to get metadata for object '{storage_key}': {str(exc)}") from exc

    def get_presigned_url(
        self,
        storage_key: str,
        expires_seconds: int = 3600,
    ) -> str:
        """Generates presigned URL for downloading objects. Supports public URL domain overrides for external access."""
        try:
            url = self.client.presigned_get_object(
                bucket_name=self.bucket,
                object_name=storage_key,
                expires=timedelta(seconds=expires_seconds),
            )

            public_url_base = getattr(settings, "MINIO_PUBLIC_URL", None)
            if public_url_base and public_url_base.strip():
                internal_endpoint = settings.MINIO_ENDPOINT
                url = url.replace(f"http://{internal_endpoint}", public_url_base).replace(
                    f"https://{internal_endpoint}", public_url_base
                )

            return url

        except Exception as exc:
            logger.error(f"Failed to generate presigned URL for '{storage_key}': {str(exc)}", exc_info=True)
            raise StorageException(f"Failed to generate presigned URL: {str(exc)}") from exc

    def delete_file(
        self,
        storage_key: str,
    ) -> None:
        """Deletes object from storage."""
        try:
            self.client.remove_object(
                bucket_name=self.bucket,
                object_name=storage_key,
            )
            logger.info(f"Deleted object '{storage_key}' from bucket '{self.bucket}'")
        except S3Error as exc:
            logger.error(f"Failed to delete object '{storage_key}': {str(exc)}", exc_info=True)
            raise StorageException(f"Failed to delete object '{storage_key}': {str(exc)}") from exc

    def file_exists(
        self,
        storage_key: str,
    ) -> bool:
        """Checks if object exists in storage."""
        try:
            self.client.stat_object(
                self.bucket,
                storage_key,
            )
            return True
        except S3Error as exc:
            if exc.code in ("NoSuchKey", "NoSuchBucket"):
                return False
            logger.warning(f"Error checking file existence for '{storage_key}': {str(exc)}")
            return False
        except Exception:
            return False