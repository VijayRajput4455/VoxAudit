import torch

from app.core.logging import get_logger

logger = get_logger(__name__)


class QualityService:
    """Evaluates voice sample signal quality for enrollment suitability."""

    def assess_quality(self, waveform: torch.Tensor, sample_rate: int) -> float:
        """Assesses audio quality score between 0.0000 and 1.0000 based on signal dynamics.
        
        Returns:
            float quality_score (e.g. 0.9500)
        """
        if waveform is None or waveform.numel() == 0:
            return 0.0

        # Calculate RMS energy
        rms = torch.sqrt(torch.mean(waveform ** 2)).item()

        # Check clipping ratio (|sample| >= 0.99)
        clipping_ratio = float(torch.sum(torch.abs(waveform) >= 0.99).item()) / float(waveform.numel())

        # Baseline quality calculation
        score = 1.0

        if rms < 0.005:  # Too quiet / empty audio
            score -= 0.5
        elif rms > 0.5:   # Too loud / potential distortion
            score -= 0.2

        if clipping_ratio > 0.01:  # Excessive clipping
            score -= (clipping_ratio * 2.0)

        quality_score = max(0.0, min(1.0, round(score, 4)))

        logger.debug(
            f"Evaluated audio quality score: {quality_score:.4f} (RMS={rms:.4f}, clipping={clipping_ratio:.4f})",
            extra={"quality_score": quality_score, "rms": round(rms, 4), "clipping_ratio": round(clipping_ratio, 4)},
        )
        return quality_score
