from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "VoxAudit"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    DATABASE_URL: str

    API_V1_PREFIX: str = "/api/v1"

    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    LOG_DIR: str = "logs"
    LOG_FILE_NAME: str = "voxaudit.log"

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_SECURE: bool = False
    MINIO_BUCKET: str = "voice-samples"
    MINIO_REGION: str = "us-east-1"
    MINIO_PUBLIC_URL: str | None = None

    # Maximum allowed audio upload size in bytes (default: 50MB)
    MAX_UPLOAD_SIZE_BYTES: int = 50 * 1024 * 1024

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()