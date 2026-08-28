from functools import lru_cache
import time
from typing import Any

from app.core.config import settings
from app.core.exceptions import EmbeddingModelException
from app.core.logging import get_logger

logger = get_logger(__name__)


def resolve_device() -> str:
    """Resolves target execution device based on settings and PyTorch capabilities."""
    try:
        import torch
        cuda_available = torch.cuda.is_available()
    except ImportError:
        cuda_available = False

    target_device = getattr(settings, "EMBEDDING_DEVICE", "auto").lower()

    if target_device in ("auto", "cuda"):
        device = "cuda:0" if cuda_available else "cpu"
    else:
        device = target_device

    if "cuda" in device and not cuda_available:
        logger.warning(f"CUDA device '{device}' requested but PyTorch CUDA is unavailable. Falling back to CPU.")
        device = "cpu"

    return device


@lru_cache(maxsize=1)
def get_ecapa_model() -> Any:
    """Lazy loader for SpeechBrain ECAPA-TDNN speaker embedding model.
    
    Uses @lru_cache(maxsize=1) to ensure the model is loaded lazily once per Python process.
    FastAPI workers will each maintain a single cached model instance.
    """
    from speechbrain.inference.speaker import EncoderClassifier
    from speechbrain.utils.fetching import LocalStrategy

    device = resolve_device()
    model_source = getattr(settings, "EMBEDDING_MODEL", "speechbrain/spkrec-ecapa-voxceleb")
    model_version = getattr(settings, "EMBEDDING_MODEL_VERSION", "1.0.0")

    logger.info(
        f"Loading ECAPA speaker embedding model '{model_source}' on device '{device}'...",
        extra={
            "model": model_source,
            "version": model_version,
            "device": device,
        },
    )

    start_time = time.perf_counter()

    try:
        model = EncoderClassifier.from_hparams(
            source=model_source,
            savedir="models/ecapa",
            run_opts={"device": device},
            local_strategy=LocalStrategy.COPY,
        )
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        logger.info(
            f"ECAPA speaker embedding model successfully loaded in {duration_ms}ms on '{device}'",
            extra={
                "model": model_source,
                "version": model_version,
                "device": device,
                "duration_ms": duration_ms,
            },
        )
        return model

    except Exception as exc:
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.error(
            f"Failed to load ECAPA speaker embedding model '{model_source}' on '{device}': {str(exc)}",
            exc_info=True,
            extra={
                "model": model_source,
                "device": device,
                "duration_ms": duration_ms,
            },
        )
        raise EmbeddingModelException(f"Failed to load ECAPA model '{model_source}': {str(exc)}") from exc