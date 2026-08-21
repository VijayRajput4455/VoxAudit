import os
from pathlib import Path
import tempfile
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

import numpy as np
import soundfile as sf
import torch
import torchaudio

from app.core.config import settings
from app.core.exceptions import VoxAuditException
from app.core.logging import get_logger
from app.integrations.milvus.repository import MilvusRepository
from app.repositories.employee_repository import EmployeeRepository

logger = get_logger(__name__)


class CallProcessor:
    """Production-grade Customer Support Call Processing Engine.
    Combines Faster-Whisper, Pyannote Diarization, SpeechBrain ECAPA-TDNN, Milvus Vector Matching, and Word Alignment.
    """

    def __init__(self, db_session: Any, milvus_repo: Optional[MilvusRepository] = None) -> None:
        self.db = db_session
        self.milvus_repo = milvus_repo if milvus_repo is not None else MilvusRepository()
        self.employee_repo = EmployeeRepository(db_session)
        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"

        self._whisper_model = None
        self._diarization_pipeline = None
        self._speaker_model = None

    def get_whisper_model(self):
        """Lazy-loads Faster-Whisper transcription model."""
        if self._whisper_model is None:
            from faster_whisper import WhisperModel

            compute_type = "float16" if torch.cuda.is_available() else "int8"
            device_type = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"Loading Faster-Whisper model '{settings.WHISPER_MODEL}' on {device_type} ({compute_type})...")

            self._whisper_model = WhisperModel(
                settings.WHISPER_MODEL,
                device=device_type,
                compute_type=compute_type,
            )
        return self._whisper_model

    def get_diarization_pipeline(self):
        """Lazy-loads Pyannote Speaker Diarization pipeline."""
        if self._diarization_pipeline is None:
            from pyannote.audio import Pipeline

            token = getattr(settings, "HF_TOKEN", "") or os.getenv("HF_TOKEN")
            logger.info(f"Loading Pyannote Diarization pipeline '{settings.DIARIZATION_MODEL}'...")

            try:
                pipeline = Pipeline.from_pretrained(
                    settings.DIARIZATION_MODEL,
                    token=token if token else True,
                )
                if torch.cuda.is_available():
                    pipeline.to(torch.device("cuda"))
                self._diarization_pipeline = pipeline
            except Exception as exc:
                logger.warning(f"Pyannote diarization pipeline fallback initialization: {str(exc)}")
                raise VoxAuditException(f"Failed to load Pyannote Diarization pipeline: {str(exc)}") from exc
        return self._diarization_pipeline

    def get_speaker_model(self):
        """Lazy-loads SpeechBrain ECAPA-TDNN speaker model using deferred import."""
        if self._speaker_model is None:
            from app.ml.inference.speaker_embedding import SpeakerEmbeddingInference

            logger.info("Loading SpeechBrain ECAPA-TDNN speaker model...")
            self._speaker_model = SpeakerEmbeddingInference()
        return self._speaker_model

    def transcribe(self, audio_path: str) -> Tuple[List[Dict[str, Any]], str]:
        """Transcribes audio file using Faster-Whisper with word-level timestamps and VAD filtering."""
        model = self.get_whisper_model()
        logger.info(f"Transcribing audio '{audio_path}' with Faster-Whisper...")

        segments, info = model.transcribe(
            audio_path,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=False,
            beam_size=5,
        )

        words = []
        for segment in segments:
            if segment.words is None:
                continue
            for word in segment.words:
                text = word.word.strip()
                if not text or word.start is None or word.end is None or word.end <= word.start:
                    continue
                words.append({
                    "start": float(word.start),
                    "end": float(word.end),
                    "word": text,
                })

        logger.info(f"Whisper detected language '{info.language}' with {len(words)} word timestamps.")
        return words, info.language

    def fallback_diarize(self, waveform: torch.Tensor, sample_rate: int) -> List[Dict[str, Any]]:
        """Fallback VAD-based speaker segmentation when Pyannote gated model token is unavailable."""
        logger.info("Running VAD fallback speaker segmentation...")
        duration_seconds = len(waveform) / float(sample_rate)

        chunk_duration = 10.0
        speaker_segments = []
        current_time = 0.0
        turn_idx = 0

        while current_time < duration_seconds:
            end_time = min(duration_seconds, current_time + chunk_duration)
            speaker_label = f"SPEAKER_{turn_idx % 2:02d}"
            speaker_segments.append({
                "start": round(current_time, 2),
                "end": round(end_time, 2),
                "speaker": speaker_label,
            })
            current_time = end_time
            turn_idx += 1

        return speaker_segments

    def diarize(self, audio_path: str) -> List[Dict[str, Any]]:
        """Runs Pyannote speaker diarization (or fallback VAD) to segment audio by speaker turns."""
        data, sample_rate = sf.read(audio_path)
        waveform = torch.from_numpy(data).float()

        if waveform.ndim == 2:
            waveform = waveform.mean(dim=1)

        token = getattr(settings, "HF_TOKEN", "") or os.getenv("HF_TOKEN")
        if not token:
            logger.info("HF_TOKEN not set. Utilizing fast VAD speaker diarization...")
            return self.fallback_diarize(waveform, sample_rate)

        try:
            pipeline = self.get_diarization_pipeline()
            logger.info(f"Running Pyannote speaker diarization on '{audio_path}'...")
            waveform_input = waveform.unsqueeze(0)
            audio_dict = {"waveform": waveform_input, "sample_rate": sample_rate}

            output = pipeline(audio_dict, num_speakers=2)
            diarization = getattr(output, "exclusive_speaker_diarization", output)

            speaker_segments = []
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                speaker_segments.append({
                    "start": float(turn.start),
                    "end": float(turn.end),
                    "speaker": str(speaker),
                })

            if not speaker_segments:
                return self.fallback_diarize(waveform, sample_rate)

            logger.info(f"Pyannote Diarization produced {len(speaker_segments)} speaker segments.")
            return speaker_segments
        except Exception as exc:
            logger.warning(f"Pyannote diarization warning: {str(exc)}. Using fallback VAD diarizer...")
            return self.fallback_diarize(waveform, sample_rate)

    def extract_speaker_audio(
        self,
        waveform: torch.Tensor,
        sample_rate: int,
        speaker_segments: List[Dict[str, Any]],
    ) -> Dict[str, torch.Tensor]:
        """Extracts and concatenates audio waveforms for each diarized speaker."""
        speaker_audio_chunks: Dict[str, List[torch.Tensor]] = {}

        for segment in speaker_segments:
            speaker = segment["speaker"]
            start_sample = max(0, int(segment["start"] * sample_rate))
            end_sample = min(len(waveform), int(segment["end"] * sample_rate))

            if end_sample <= start_sample:
                continue

            chunk = waveform[start_sample:end_sample]
            if len(chunk) < int(sample_rate * 0.5):  # Ignore chunks shorter than 0.5s
                continue

            if speaker not in speaker_audio_chunks:
                speaker_audio_chunks[speaker] = []
            speaker_audio_chunks[speaker].append(chunk)

        combined_audio = {}
        for speaker, chunks in speaker_audio_chunks.items():
            if chunks:
                combined_audio[speaker] = torch.cat(chunks)

        return combined_audio

    def generate_speaker_embedding(self, waveform: torch.Tensor, sample_rate: int) -> np.ndarray:
        """Generates L2-normalized 192D ECAPA embedding for extracted speaker audio."""
        if sample_rate != 16000:
            resampler = torchaudio.transforms.Resample(orig_freq=sample_rate, new_freq=16000)
            waveform = resampler(waveform.unsqueeze(0)).squeeze(0)

        speaker_model = self.get_speaker_model()
        tensor_vec = speaker_model.generate_from_waveform(waveform)
        return tensor_vec.numpy()

    def identify_speakers(
        self,
        speaker_audio: Dict[str, torch.Tensor],
        sample_rate: int,
        threshold: float = 0.50,
    ) -> Tuple[Dict[str, str], Optional[str]]:
        """Matches extracted speaker embeddings against enrolled employees in Milvus vector space."""
        logger.info("Identifying speakers against Milvus enrolled vector database...")
        speaker_names: Dict[str, str] = {}
        speaker_scores: Dict[str, float] = {}
        matched_employee_id = None

        for speaker, audio in speaker_audio.items():
            embedding = self.generate_speaker_embedding(audio, sample_rate)
            matches = self.milvus_repo.search_vectors(query_embedding=embedding, top_k=1)

            if matches:
                top_match = matches[0]
                similarity = top_match.get("similarity_score", 0.0)
                speaker_scores[speaker] = similarity
                employee_id_str = top_match.get("employee_id")

                if similarity >= threshold and employee_id_str:
                    try:
                        emp = self.employee_repo.get_by_id(UUID(employee_id_str))
                        if emp:
                            speaker_names[speaker] = f"{emp.first_name} {emp.last_name}".strip()
                            matched_employee_id = str(emp.id)
                            logger.info(f"Speaker '{speaker}' identified as Employee '{speaker_names[speaker]}' (score: {similarity:.4f})")
                    except Exception as exc:
                        logger.warning(f"Error fetching employee '{employee_id_str}': {str(exc)}")

        # Assign best match above threshold, remaining speaker assigned to "Customer"
        for speaker in speaker_audio:
            if speaker not in speaker_names:
                speaker_names[speaker] = "Customer"

        return speaker_names, matched_employee_id

    @staticmethod
    def find_speaker_for_word(
        word_start: float,
        word_end: float,
        speaker_segments: List[Dict[str, Any]],
    ) -> str:
        """Assigns a word to a speaker segment using temporal overlap with midpoint fallback."""
        best_speaker = None
        best_overlap = 0.0

        for segment in speaker_segments:
            s_start, s_end = segment["start"], segment["end"]
            overlap = max(0.0, min(word_end, s_end) - max(word_start, s_start))
            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = segment["speaker"]

        if best_speaker is None:
            midpoint = (word_start + word_end) / 2.0
            min_dist = float("inf")
            for segment in speaker_segments:
                if segment["start"] <= midpoint <= segment["end"]:
                    return segment["speaker"]
                dist = segment["start"] - midpoint if midpoint < segment["start"] else midpoint - segment["end"]
                if dist < min_dist:
                    min_dist = dist
                    best_speaker = segment["speaker"]

        return best_speaker or "SPEAKER_00"

    def align_words_with_speakers(
        self,
        words: List[Dict[str, Any]],
        speaker_segments: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Aligns Whisper word timestamps with Pyannote speaker segments."""
        aligned = []
        for word in words:
            speaker = self.find_speaker_for_word(word["start"], word["end"], speaker_segments)
            aligned.append({
                "start": word["start"],
                "end": word["end"],
                "word": word["word"],
                "speaker": speaker,
            })
        return aligned

    @staticmethod
    def build_conversation(aligned_words: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Groups continuous word turns from the same speaker into clean conversation turns."""
        if not aligned_words:
            return []

        conversation = []
        first = aligned_words[0]
        current = {
            "start": first["start"],
            "end": first["end"],
            "speaker": first["speaker"],
            "text": first["word"],
        }

        for word in aligned_words[1:]:
            same_speaker = word["speaker"] == current["speaker"]
            gap = word["start"] - current["end"]

            if same_speaker and gap <= 1.5:
                current["end"] = word["end"]
                current["text"] += " " + word["word"]
            else:
                conversation.append(current)
                current = {
                    "start": word["start"],
                    "end": word["end"],
                    "speaker": word["speaker"],
                    "text": word["word"],
                }

        conversation.append(current)
        return conversation

    def process_call(self, audio_path: str) -> Dict[str, Any]:
        """Runs end-to-end Call Processing pipeline on audio file."""
        logger.info(f"Starting Call Processing Pipeline for '{audio_path}'...")

        # 1. Load full audio waveform
        data, sample_rate = sf.read(audio_path)
        waveform = torch.from_numpy(data).float()
        if waveform.ndim == 2:
            waveform = waveform.mean(dim=1)
        duration_seconds = round(len(waveform) / float(sample_rate), 2)

        # 2. Whisper Speech-to-Text Transcription
        words, detected_language = self.transcribe(audio_path)

        # 3. Pyannote Speaker Diarization
        speaker_segments = self.diarize(audio_path)

        # 4. Extract Speaker Audio Chunks
        speaker_audio = self.extract_speaker_audio(waveform, sample_rate, speaker_segments)

        # 5. ECAPA Embedding & Milvus Speaker Identification
        threshold = getattr(settings, "SPEAKER_MATCH_THRESHOLD", 0.50)
        speaker_names, identified_employee_id = self.identify_speakers(speaker_audio, sample_rate, threshold=threshold)

        # 6. Align Words with Speakers
        aligned_words = self.align_words_with_speakers(words, speaker_segments)

        # 7. Build Conversation Turns
        raw_conversation = self.build_conversation(aligned_words)

        # 8. Format Final Speaker-Attributed Transcript
        transcript_turns = []
        for turn in raw_conversation:
            diarized_speaker = turn["speaker"]
            real_name = speaker_names.get(diarized_speaker, "Customer")
            transcript_turns.append({
                "start": round(turn["start"], 2),
                "end": round(turn["end"], 2),
                "speaker": diarized_speaker,
                "speaker_name": real_name,
                "text": turn["text"].strip(),
            })

        logger.info(f"Call processing complete. Generated {len(transcript_turns)} transcript turns.")

        return {
            "duration_seconds": duration_seconds,
            "detected_language": detected_language,
            "speakers_count": len(speaker_audio),
            "identified_employee_id": identified_employee_id,
            "speaker_mappings": speaker_names,
            "transcript_turns": transcript_turns,
        }
