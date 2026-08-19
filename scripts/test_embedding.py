import sys
from pathlib import Path

# Add project root directory to python path for standalone execution
sys.path.append(str(Path(__file__).resolve().parents[1]))

import math
import struct
import wave
import numpy as np

from app.services.voice.embedding_service import EmbeddingService


def create_sample_wav(filename: str = "scratch/test_voice.wav", duration_seconds: float = 3.0) -> Path:
    """Generates a clean 16 kHz 16-bit mono sine wave test file for verification."""
    filepath = Path(filename)
    filepath.parent.mkdir(parents=True, exist_ok=True)

    sample_rate = 16000
    num_samples = int(sample_rate * duration_seconds)
    frequency = 440.0  # 440 Hz sine tone

    with wave.open(str(filepath), "wb") as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit PCM
        wav_file.setframerate(sample_rate)

        for i in range(num_samples):
            value = int(32767.0 * 0.5 * math.sin(2.0 * math.pi * frequency * i / sample_rate))
            data = struct.pack("<h", value)
            wav_file.writeframesraw(data)

    return filepath


def run_embedding_test():
    print("==================================================")
    print("      VoxAudit Voice Embedding Layer Test         ")
    print("==================================================")

    # 1. Generate test audio file
    wav_path = create_sample_wav("scratch/test_voice.wav", duration_seconds=3.0)
    print(f"✓ Generated test audio file: '{wav_path}' (3.0 seconds, 16kHz mono)")

    # 2. Initialize EmbeddingService
    service = EmbeddingService()
    print("✓ EmbeddingService initialized.")

    # 3. Generate speaker embedding
    embedding1 = service.generate_embedding(wav_path)

    # Calculate L2 norm
    norm_val = float(np.linalg.norm(embedding1))

    print("\n--------------------------------------------------")
    print("Embedding generated successfully!")
    print("--------------------------------------------------")
    print(f"Model:    {service.get_model_name()}")
    print(f"Version:  {service.get_model_version()}")
    print(f"Device:   {service.get_device()}")
    print(f"Shape:    {embedding1.shape}")
    print(f"Dtype:    {embedding1.dtype}")
    print(f"Norm:     {norm_val:.6f} (approximately 1.0)")
    print(f"Sample:   [{embedding1[0]:.4f}, {embedding1[1]:.4f}, {embedding1[2]:.4f}, ...]")
    print("--------------------------------------------------\n")

    # Assertions
    assert isinstance(embedding1, np.ndarray), "Result must be a numpy ndarray"
    assert embedding1.shape == (192,), f"Expected shape (192,), got {embedding1.shape}"
    assert embedding1.dtype == np.float32, f"Expected dtype float32, got {embedding1.dtype}"
    assert abs(norm_val - 1.0) < 1e-3, f"L2 norm check failed: {norm_val} != 1.0"

    # 4. Run second time to verify deterministic consistency
    embedding2 = service.generate_embedding(wav_path)
    assert embedding2.shape == (192,), "Second run shape mismatch"
    assert np.allclose(embedding1, embedding2, atol=1e-5), "Deterministic embeddings should match!"
    print("✓ Verified consistency across repeated inference runs.")

    print("==================================================")
    print("   VOICE EMBEDDING LAYER TEST PASSED! 🎉           ")
    print("==================================================")


if __name__ == "__main__":
    run_embedding_test()
