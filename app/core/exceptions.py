class VoxAuditException(Exception):
    """Base exception class for VoxAudit platform."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class StorageException(VoxAuditException):
    """Base exception for Object Storage operations."""
    pass


class StorageFileNotFoundException(StorageException):
    """Raised when requested object/file is not found in storage."""
    pass


class StorageConnectionException(StorageException):
    """Raised when connection to object storage service fails."""
    pass


class EmbeddingException(VoxAuditException):
    """Base exception for speaker embedding operations."""
    pass


class EmbeddingModelException(EmbeddingException):
    """Raised when ECAPA model loading fails."""
    pass


class InvalidAudioException(EmbeddingException):
    """Raised when input audio is invalid, missing, unreadable, or out of duration limits."""
    pass


class EmbeddingInferenceException(EmbeddingException):
    """Raised when speaker embedding inference or normalization fails."""
    pass
