from pathlib import Path
from typing import Any, Dict, Optional, Union

import numpy as np

from app.core.config import settings
from app.core.logging import get_logger
from app.ml.inference.speaker_embedding import SpeakerEmbeddingInference

logger = get_logger(__name__)


class EmbeddingService:
    """Application-facing service for generating ECAPA speaker voice embeddings."""

    def __init__(
        self,
        inference: Optional[SpeakerEmbeddingInference] = None,
    ) -> None:
        self.inference = (
            inference
            if inference is not None
            else SpeakerEmbeddingInference()
        )
        self.model_name = getattr(settings, "EMBEDDING_MODEL", "speechbrain/spkrec-ecapa-voxceleb")
        self.model_version = getattr(settings, "EMBEDDING_MODEL_VERSION", "1.0.0")
        self.embedding_dimension = getattr(settings, "EMBEDDING_DIMENSION", 192)

    def generate_embedding(
        self,
        audio_path: Union[str, Path],
    ) -> np.ndarray:
        """Generates a normalized 192-dimensional speaker embedding numpy array.
        
        Returns:
            numpy.ndarray with shape (192,) and dtype float32.
        """
        tensor_embedding = self.inference.generate(audio_path)
        numpy_embedding = tensor_embedding.numpy().astype(np.float32)

        if numpy_embedding.shape != (self.embedding_dimension,):
            raise ValueError(
                f"Invalid embedding shape {numpy_embedding.shape}. Expected ({self.embedding_dimension},)"
            )

        return numpy_embedding

    def generate_embedding_with_metadata(
        self,
        audio_path: Union[str, Path],
    ) -> Dict[str, Any]:
        """Generates speaker embedding along with model metadata for future storage records."""
        embedding = self.generate_embedding(audio_path)
        return {
            "embedding_model": self.get_model_name(),
            "embedding_dimension": self.get_embedding_dimension(),
            "model_version": self.get_model_version(),
            "embedding": embedding,
        }

    def get_model_name(self) -> str:
        return self.model_name

    def get_model_version(self) -> str:
        return self.model_version

    def get_embedding_dimension(self) -> int:
        return self.embedding_dimension

    def get_device(self) -> str:
        if hasattr(self.inference, "model") and hasattr(self.inference.model, "device"):
            return str(self.inference.model.device)
        return getattr(settings, "EMBEDDING_DEVICE", "auto")