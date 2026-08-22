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
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_SECURE: bool = False
    MINIO_BUCKET: str = "voice-samples"
    MINIO_REGION: str = "us-east-1"
    MINIO_PUBLIC_URL: str | None = None

    # Maximum allowed audio upload size in bytes (default: 50MB)
    MAX_UPLOAD_SIZE_BYTES: int = 50 * 1024 * 1024

    # Speaker Voice Embedding Configuration
    EMBEDDING_DEVICE: str = "auto"
    EMBEDDING_MODEL: str = "speechbrain/spkrec-ecapa-voxceleb"
    EMBEDDING_MODEL_VERSION: str = "1.0.0"
    EMBEDDING_DIMENSION: int = 192
    MIN_EMBEDDING_AUDIO_SECONDS: float = 1.0
    MAX_EMBEDDING_AUDIO_SECONDS: float = 300.0

    # RabbitMQ Message Broker Configuration
    RABBITMQ_HOST: str = "localhost"
    RABBITMQ_PORT: int = 5672
    RABBITMQ_USER: str = "guest"
    RABBITMQ_PASSWORD: str = "guest"
    RABBITMQ_VHOST: str = "/"
    RABBITMQ_QUEUE: str = "voice_enrollment_jobs"
    RABBITMQ_EXCHANGE: str = "voxaudit_events"
    RABBITMQ_ROUTING_KEY: str = "voice.enrollment"

    # Milvus Vector Database Configuration
    MILVUS_HOST: str = "localhost"
    MILVUS_PORT: int = 19530
    MILVUS_USER: str = ""
    MILVUS_PASSWORD: str = ""
    MILVUS_COLLECTION: str = "voice_embeddings"

    # Voice Enrollment Worker Retries
    VOICE_ENROLLMENT_MAX_RETRIES: int = 3

    # Call Processing Configuration (Whisper + Pyannote + ECAPA)
    WHISPER_MODEL: str = "medium"
    DIARIZATION_MODEL: str = "pyannote/speaker-diarization-community-1"
    HF_TOKEN: str = ""
    SPEAKER_MATCH_THRESHOLD: float = 0.50
    RABBITMQ_CALL_QUEUE: str = "call_processing_jobs"
    RABBITMQ_CALL_ROUTING_KEY: str = "call.processing"
    RABBITMQ_QA_QUEUE: str = "qa_audit_jobs"
    RABBITMQ_QA_ROUTING_KEY: str = "call.qa_audit"

    # Ollama LLM Configuration
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen3.5:9b"
    OLLAMA_TIMEOUT_SECONDS: float = 60.0




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