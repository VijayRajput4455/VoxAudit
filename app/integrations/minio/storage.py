from datetime import timedelta
from io import BytesIO

from minio import Minio

from app.core.config import settings


class MinioStorage:

    def __init__(self, client: Minio) -> None:
        self.client = client
        self.bucket = settings.MINIO_BUCKET

    def ensure_bucket(self) -> None:
        exists = self.client.bucket_exists(self.bucket)

        if not exists:
            self.client.make_bucket(self.bucket)

    def upload_file(
        self,
        file_data: bytes,
        storage_key: str,
        content_type: str = "audio/wav",
    ) -> str:
        self.ensure_bucket()

        self.client.put_object(
            bucket_name=self.bucket,
            object_name=storage_key,
            data=BytesIO(file_data),
            length=len(file_data),
            content_type=content_type,
        )

        return storage_key

    def download_file(
        self,
        storage_key: str,
    ) -> bytes:
        response = None
        try:
            response = self.client.get_object(
                bucket_name=self.bucket,
                object_name=storage_key,
            )
            return response.read()
        finally:
            if response:
                response.close()
                response.release_conn()

    def get_presigned_url(
        self,
        storage_key: str,
        expires_seconds: int = 3600,
    ) -> str:
        return self.client.presigned_get_object(
            bucket_name=self.bucket,
            object_name=storage_key,
            expires=timedelta(seconds=expires_seconds),
        )

    def delete_file(
        self,
        storage_key: str,
    ) -> None:
        self.client.remove_object(
            bucket_name=self.bucket,
            object_name=storage_key,
        )

    def file_exists(
        self,
        storage_key: str,
    ) -> bool:
        try:
            self.client.stat_object(
                self.bucket,
                storage_key,
            )
            return True

        except Exception:
            return False