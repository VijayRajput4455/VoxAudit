from pathlib import Path
from typing import Tuple, Union

torch_available = False
try:
    import torch
    import torchaudio
    torch_available = True
except ImportError:
    pass

from app.core.config import settings
from app.core.exceptions import InvalidAudioException
from app.core.logging import get_logger

logger = get_logger(__name__)


def load_and_preprocess_audio(
    audio_path: Union[str, Path],
) -> Tuple["torch.Tensor", int]:
    """Loads, validates, converts to mono, and resamples audio to 16 kHz for ECAPA inference.
    
    Returns:
        Tuple of (waveform_tensor, sample_rate) where waveform_tensor has shape [1, num_samples].
    """
    path = Path(audio_path)

    # 1. File existence validation
    if not path.exists():
        logger.error(f"Audio file not found: {path}")
        raise InvalidAudioException(f"Audio file not found: '{path}'")

    if not path.is_file():
        logger.error(f"Audio path is not a file: {path}")
        raise InvalidAudioException(f"Audio path is not a valid file: '{path}'")

    try:
        waveform, sample_rate = torchaudio.load(str(path))
    except Exception as exc:
        logger.error(f"Failed to load audio file '{path}': {str(exc)}", exc_info=True)
        raise InvalidAudioException(f"Failed to decode audio file '{path}': {str(exc)}") from exc

    # 2. Check for empty or non-finite waveform
    if waveform is None or waveform.numel() == 0:
        logger.error(f"Audio file '{path}' contains no audio samples.")
        raise InvalidAudioException(f"Audio file '{path}' is empty.")

    if not torch.isfinite(waveform).all():
        logger.error(f"Audio file '{path}' contains non-finite (NaN or Inf) values.")
        raise InvalidAudioException(f"Audio file '{path}' contains corrupted non-finite samples.")

    # 3. Calculate and validate duration
    num_channels, num_samples = waveform.shape
    duration_seconds = num_samples / float(sample_rate)

    min_seconds = getattr(settings, "MIN_EMBEDDING_AUDIO_SECONDS", 1.0)
    max_seconds = getattr(settings, "MAX_EMBEDDING_AUDIO_SECONDS", 300.0)

    logger.debug(
        f"Audio loaded: duration={duration_seconds:.2f}s, channels={num_channels}, sample_rate={sample_rate}Hz",
        extra={
            "duration_seconds": duration_seconds,
            "channels": num_channels,
            "sample_rate": sample_rate,
        },
    )

    if duration_seconds < min_seconds:
        err_msg = f"Audio duration ({duration_seconds:.2f}s) is shorter than minimum required limit ({min_seconds}s)."
        logger.warning(err_msg, extra={"duration_seconds": duration_seconds})
        raise InvalidAudioException(err_msg)

    if duration_seconds > max_seconds:
        err_msg = f"Audio duration ({duration_seconds:.2f}s) exceeds maximum permitted limit ({max_seconds}s)."
        logger.warning(err_msg, extra={"duration_seconds": duration_seconds})
        raise InvalidAudioException(err_msg)

    # 4. Convert multi-channel/stereo to mono
    if num_channels > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    # 5. Resample to 16 kHz if necessary
    target_sample_rate = 16000
    if sample_rate != target_sample_rate:
        waveform = torchaudio.functional.resample(
            waveform,
            orig_freq=sample_rate,
            new_freq=target_sample_rate,
        )
        sample_rate = target_sample_rate

    # Ensure float32 dtype
    waveform = waveform.to(torch.float32)

    return waveform, sample_rate
