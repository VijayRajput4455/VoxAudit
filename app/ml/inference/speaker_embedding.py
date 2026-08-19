from pathlib import Path
import time
from typing import Any, Optional, Union

import torch

from app.core.config import settings
from app.core.exceptions import (
    EmbeddingInferenceException,
    InvalidAudioException,
)
from app.core.logging import get_logger
from app.ml.models.ecapa import get_ecapa_model
from app.ml.preprocessing.audio import load_and_preprocess_audio

logger = get_logger(__name__)


class SpeakerEmbeddingInference:
    """Low-level ECAPA speaker embedding inference engine."""

    def __init__(self, model: Optional[Any] = None) -> None:
        self.model = model if model is not None else get_ecapa_model()
        self.expected_dimension = getattr(settings, "EMBEDDING_DIMENSION", 192)

    def generate_from_waveform(self, waveform: torch.Tensor) -> torch.Tensor:
        """Generates L2-normalized 192-dimensional speaker embedding from preprocessed 16kHz mono tensor."""
        start_time = time.perf_counter()

        try:
            # Ensure waveform is on the proper device and shape [batch_size=1, num_samples]
            if waveform.ndim == 1:
                waveform = waveform.unsqueeze(0)

            # Move waveform to model's execution device
            target_device = self.model.device
            waveform = waveform.to(target_device)

            # Use torch.inference_mode() for production performance (disables autograd & gradient tracking)
            with torch.inference_mode():
                embeddings = self.model.encode_batch(waveform)

            # Flatten to 1D vector
            embedding = embeddings.squeeze()
            if embedding.ndim > 1:
                embedding = embedding.flatten()

            # Move to CPU for post-processing and validation
            embedding = embedding.cpu().to(torch.float32)

            # Validate dimension
            if embedding.shape[0] != self.expected_dimension:
                raise ValueError(
                    f"Unexpected ECAPA embedding dimension: {embedding.shape[0]}. Expected {self.expected_dimension}."
                )

            # L2 Normalization
            embedding = torch.nn.functional.normalize(embedding, p=2, dim=0)

            # Validate norm
            norm_val = float(torch.norm(embedding, p=2).item())
            if abs(norm_val - 1.0) > 1e-3:
                raise ValueError(f"L2 normalization check failed: norm = {norm_val:.4f}, expected ~1.0")

            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

            logger.info(
                f"Generated speaker embedding ({embedding.shape[0]} dimensions) in {duration_ms}ms",
                extra={
                    "dimension": embedding.shape[0],
                    "norm": round(norm_val, 4),
                    "duration_ms": duration_ms,
                },
            )

            return embedding

        except InvalidAudioException:
            raise
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(
                f"Speaker embedding inference failed: {str(exc)}",
                exc_info=True,
                extra={"duration_ms": duration_ms},
            )
            raise EmbeddingInferenceException(f"Failed to generate speaker embedding: {str(exc)}") from exc

    def generate(self, audio_path: Union[str, Path]) -> torch.Tensor:
        """Loads audio file, preprocesses to 16kHz mono, and returns L2-normalized 192D speaker embedding tensor."""
        waveform, _ = load_and_preprocess_audio(audio_path)
        return self.generate_from_waveform(waveform)