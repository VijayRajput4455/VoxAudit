import json
import time
from typing import Any, Dict, Optional
import requests


from app.core.config import settings
from app.core.logging import get_logger

from functools import lru_cache

logger = get_logger(__name__)


class OllamaClient:
    """Production-grade Ollama LLM integration client for local Llama inference."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        default_model: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> None:
        self.base_url = (base_url or getattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")).rstrip("/")
        self.default_model = default_model or getattr(settings, "OLLAMA_MODEL", "llama3")
        self.timeout = timeout or getattr(settings, "OLLAMA_TIMEOUT_SECONDS", 60.0)
        self._session = requests.Session()


    def generate_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Sends prompt to Ollama LLM with format='json' and returns parsed JSON dict."""
        target_model = model or self.default_model
        endpoint = f"{self.base_url}/api/generate"

        payload = {
            "model": target_model,
            "prompt": prompt,
            "format": "json",
            "stream": False,
            "options": {
                "num_predict": 1024,
                "temperature": 0.1,
            },
        }
        if system_prompt:
            payload["system"] = system_prompt


        logger.info(f"Sending prompt to Ollama LLM ('{target_model}') at '{endpoint}'...")

        effective_timeout = getattr(settings, "OLLAMA_TIMEOUT_SECONDS", 300.0)
        max_retries = 3
        retry_delay = 2.0


        for attempt in range(1, max_retries + 1):
            try:
                response = self._session.post(
                    endpoint,
                    json=payload,
                    timeout=effective_timeout,
                )
                response.raise_for_request()
                response_data = response.json()

                raw_text = response_data.get("response", "").strip()
                if not raw_text:
                    raise ValueError("Empty response received from Ollama model.")

                # Parse structured JSON output
                parsed_json = json.loads(raw_text)
                return parsed_json

            except (requests.exceptions.RequestException, json.JSONDecodeError, ValueError) as exc:
                if attempt < max_retries:
                    logger.warning(
                        f"Ollama LLM evaluation attempt {attempt}/{max_retries} failed ({str(exc)}). "
                        f"Retrying in {retry_delay}s while Ollama warms up model..."
                    )
                    time.sleep(retry_delay)
                else:
                    logger.error(f"Ollama service error ('{endpoint}') after {max_retries} attempts: {str(exc)}", exc_info=True)
                    raise RuntimeError(f"Ollama service unreachable at '{self.base_url}': {str(exc)}") from exc



@lru_cache
def get_ollama_client() -> OllamaClient:
    """Singleton getter returning cached OllamaClient instance."""
    return OllamaClient()

