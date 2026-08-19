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
