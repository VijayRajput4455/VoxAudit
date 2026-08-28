from pathlib import Path
from unittest.mock import MagicMock

import numpy as np
import pytest
import torch

from app.core.exceptions import InvalidAudioException
from app.services.voice.embedding_service import EmbeddingService


def test_embedding_service_with_mocked_inference():
    # Create mock inference engine returning normalized 192D tensor
    mock_inference = MagicMock()
    mock_tensor = torch.randn(192)
    mock_tensor = torch.nn.functional.normalize(mock_tensor, p=2, dim=0)
    mock_inference.generate.return_value = mock_tensor

    service = EmbeddingService(inference=mock_inference)

    # Test metadata getters
    assert service.get_model_name() == "speechbrain/spkrec-ecapa-voxceleb"
    assert service.get_model_version() == "1.0.0"
    assert service.get_embedding_dimension() == 192

    # Test embedding generation
    embedding = service.generate_embedding("dummy_path.wav")

    mock_inference.generate.assert_called_once_with("dummy_path.wav")
    assert isinstance(embedding, np.ndarray)
    assert embedding.shape == (192,)
    assert embedding.dtype == np.float32

    # Test L2 norm
    norm_val = np.linalg.norm(embedding)
    assert abs(norm_val - 1.0) < 1e-3


def test_embedding_service_metadata_payload():
    mock_inference = MagicMock()
    mock_tensor = torch.randn(192)
    mock_tensor = torch.nn.functional.normalize(mock_tensor, p=2, dim=0)
    mock_inference.generate.return_value = mock_tensor

    service = EmbeddingService(inference=mock_inference)
    payload = service.generate_embedding_with_metadata("dummy_path.wav")

    assert payload["embedding_model"] == "speechbrain/spkrec-ecapa-voxceleb"
    assert payload["embedding_dimension"] == 192
    assert payload["model_version"] == "1.0.0"
    assert isinstance(payload["embedding"], np.ndarray)
    assert payload["embedding"].shape == (192,)


def test_embedding_service_raises_invalid_audio():
    mock_inference = MagicMock()
    mock_inference.generate.side_effect = InvalidAudioException("Audio file not found")

    service = EmbeddingService(inference=mock_inference)

    with pytest.raises(InvalidAudioException):
        service.generate_embedding("non_existent_path.wav")


def test_resolve_device(monkeypatch):
    from app.ml.models.ecapa import resolve_device

    # Test auto with CUDA available
    monkeypatch.setattr("torch.cuda.is_available", lambda: True)
    monkeypatch.setattr("app.core.config.settings.EMBEDDING_DEVICE", "auto")
    assert resolve_device() == "cuda:0"

    # Test cuda with CUDA available
    monkeypatch.setattr("app.core.config.settings.EMBEDDING_DEVICE", "cuda")
    assert resolve_device() == "cuda:0"

    # Test auto without CUDA
    monkeypatch.setattr("torch.cuda.is_available", lambda: False)
    monkeypatch.setattr("app.core.config.settings.EMBEDDING_DEVICE", "auto")
    assert resolve_device() == "cpu"

    # Test explicit cpu
    monkeypatch.setattr("app.core.config.settings.EMBEDDING_DEVICE", "cpu")
    assert resolve_device() == "cpu"
