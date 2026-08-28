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

    def fallback_diarize(self, waveform: torch.Tensor, sample_rate: int, words: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        """Acoustic ECAPA voice verification and sentence-boundary speaker turn diarization."""
        duration_seconds = len(waveform) / float(sample_rate)

        if not words:
            return [{
                "start": 0.0,
                "end": round(duration_seconds, 2),
                "speaker": "SPEAKER_00",
            }]

        logger.info("Executing acoustic ECAPA & phrase-boundary speaker turn segmentation...")

        # 1. Group words into initial phrase chunks based on silence gaps
        raw_chunks = []
        chunk_words = [words[0]]
        chunk_start = words[0]["start"]
        prev_end = words[0]["end"]

        for i in range(1, len(words)):
            w = words[i]
            gap = w["start"] - prev_end
            prev_word_str = words[i - 1]["word"]
            is_sentence_end = prev_word_str.endswith((".", "?", "!"))

            # Split into phrase boundary if silence gap >= 0.6s or sentence boundary with gap >= 0.4s
            if gap >= 0.6 or (is_sentence_end and gap >= 0.4):
                raw_chunks.append({
                    "start": chunk_start,
                    "end": prev_end,
                })
                chunk_start = w["start"]

            prev_end = w["end"]

        raw_chunks.append({
            "start": chunk_start,
            "end": prev_end,
        })

        # 2. Compute ECAPA embedding for each phrase chunk (if snippet duration >= 0.4s)
        chunk_embeddings = []
        for chunk in raw_chunks:
            s_idx = max(0, int(chunk["start"] * sample_rate))
            e_idx = min(len(waveform), int(chunk["end"] * sample_rate))
            chunk_wav = waveform[s_idx:e_idx]

            emb = None
            if len(chunk_wav) >= int(sample_rate * 0.4):
                try:
                    emb = self.generate_speaker_embedding(chunk_wav, sample_rate)
                except Exception as exc:
                    logger.warning(f"Error computing chunk embedding: {exc}")

            chunk_embeddings.append(emb)

        # 3. Cluster phrase chunks into speaker turns using acoustic similarity or Milvus agent vector search
        threshold = getattr(settings, "SPEAKER_MATCH_THRESHOLD", 0.50)
        speaker_segments = []
        current_speaker_idx = 0
        known_speaker_embeddings: List[np.ndarray] = []

        for i, chunk in enumerate(raw_chunks):
            emb = chunk_embeddings[i]
            assigned_speaker = None

            if emb is not None:
                # 3a. Search against enrolled employee vectors in Milvus first
                try:
                    matches = self.milvus_repo.search_vectors(query_embedding=emb, top_k=1)
                    if matches and matches[0].get("similarity_score", 0.0) >= threshold:
                        assigned_speaker = "SPEAKER_AGENT"
                except Exception:
                    pass

                # 3b. If not matched to Agent in Milvus, compare with known speaker cluster centroids
                if assigned_speaker is None:
                    if not known_speaker_embeddings:
                        known_speaker_embeddings.append(emb)
                        assigned_speaker = "SPEAKER_00"
                    else:
                        best_sim = -1.0
                        best_spk_idx = 0
                        for spk_idx, k_emb in enumerate(known_speaker_embeddings):
                            sim = float(np.dot(emb, k_emb) / (np.linalg.norm(emb) * np.linalg.norm(k_emb) + 1e-9))
                            if sim > best_sim:
                                best_sim = sim
                                best_spk_idx = spk_idx

                        # If similarity to existing speaker is high (>= 0.55), assign to that speaker
                        if best_sim >= 0.55:
                            assigned_speaker = f"SPEAKER_{best_spk_idx:02d}"
                            # Update cluster embedding with running mean
                            known_speaker_embeddings[best_spk_idx] = 0.8 * known_speaker_embeddings[best_spk_idx] + 0.2 * emb
                            known_speaker_embeddings[best_spk_idx] /= np.linalg.norm(known_speaker_embeddings[best_spk_idx])
                        else:
                            # New speaker detected!
                            if len(known_speaker_embeddings) < 2:
                                known_speaker_embeddings.append(emb)
                                best_spk_idx = len(known_speaker_embeddings) - 1
                            assigned_speaker = f"SPEAKER_{best_spk_idx:02d}"

            if assigned_speaker is None:
                assigned_speaker = f"SPEAKER_{current_speaker_idx % 2:02d}"

            speaker_segments.append({
                "start": round(chunk["start"], 2),
                "end": round(chunk["end"], 2),
                "speaker": assigned_speaker,
            })

        # 4. Merge continuous segments belonging to the same speaker
        merged_segments = []
        if not speaker_segments:
            return merged_segments

        curr_seg = speaker_segments[0]
        for seg in speaker_segments[1:]:
            if seg["speaker"] == curr_seg["speaker"]:
                curr_seg["end"] = seg["end"]
            else:
                merged_segments.append(curr_seg)
                curr_seg = seg
        merged_segments.append(curr_seg)

        return merged_segments


    def diarize(self, audio_path: str, words: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        """Runs Pyannote speaker diarization (or smart pause VAD) to segment audio by speaker turns."""
        data, sample_rate = sf.read(audio_path)
        waveform = torch.from_numpy(data).float()

        if waveform.ndim == 2:
            waveform = waveform.mean(dim=1)

        token = getattr(settings, "HF_TOKEN", "") or os.getenv("HF_TOKEN")
        if not token:
            logger.info("HF_TOKEN not set. Utilizing smart pause & sentence boundary speaker diarization...")
            return self.fallback_diarize(waveform, sample_rate, words=words)


        try:
            pipeline = self.get_diarization_pipeline()
            logger.info(f"Running Pyannote speaker diarization on '{audio_path}'...")

            # Resample audio to 16kHz for optimal Pyannote diarization precision
            if sample_rate != 16000:
                resampler = torchaudio.transforms.Resample(orig_freq=sample_rate, new_freq=16000)
                waveform_16k = resampler(waveform.unsqueeze(0)).squeeze(0)
            else:
                waveform_16k = waveform

            waveform_input = waveform_16k.unsqueeze(0)
            audio_dict = {"waveform": waveform_input, "sample_rate": 16000}

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
                return self.fallback_diarize(waveform, sample_rate, words=words)

            logger.info(f"Pyannote Diarization produced {len(speaker_segments)} speaker segments.")
            return speaker_segments
        except Exception as exc:
            logger.warning(f"Pyannote diarization warning: {str(exc)}. Using fallback VAD diarizer...")
            return self.fallback_diarize(waveform, sample_rate, words=words)

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
        expected_employee_id: Optional[UUID] = None,
    ) -> Tuple[Dict[str, str], Optional[str]]:
        """Matches extracted speaker embeddings against enrolled employees in Milvus vector space.
        Uses exact best-candidate threshold matching: only the highest scoring speaker is mapped to the Agent,
        while all other speakers are mapped to 'Customer'. If expected_employee_id is provided,
        filters Milvus search specifically to that employee.
        """
        logger.info("Identifying speakers against Milvus enrolled vector database...")
        speaker_scores: Dict[str, Tuple[float, str, str]] = {}
        speaker_names: Dict[str, str] = {}
        matched_employee_id = None
        filter_expr = f'employee_id == "{str(expected_employee_id)}"' if expected_employee_id else None

        # Step 1: For each diarized speaker, find its highest cosine similarity match in Milvus
        for speaker, audio in speaker_audio.items():
            duration = len(audio) / float(sample_rate)
            if duration < 0.5:
                logger.warning(f"Speaker '{speaker}' audio snippet too short ({duration:.2f}s) for embedding generation.")
                continue

            embedding = self.generate_speaker_embedding(audio, sample_rate)
            matches = self.milvus_repo.search_vectors(query_embedding=embedding, top_k=1, filter_expression=filter_expr)

            if matches:
                top_match = matches[0]
                similarity = top_match.get("similarity_score", 0.0)
                employee_id_str = top_match.get("employee_id")

                if employee_id_str:
                    try:
                        emp = self.employee_repo.get_by_id(UUID(employee_id_str))
                        if emp:
                            emp_name = f"{emp.first_name} {emp.last_name}".strip()
                            speaker_scores[speaker] = (similarity, str(emp.id), emp_name)
                    except Exception as exc:
                        logger.warning(f"Error fetching employee '{employee_id_str}': {str(exc)}")

        if not speaker_scores:
            logger.info("No enrolled employee vector matches found. All speakers set to Customer.")
            customer_count = 1
            for speaker in speaker_audio:
                label = "Customer" if len(speaker_audio) <= 2 else f"Customer {customer_count}"
                speaker_names[speaker] = label
                customer_count += 1
            return speaker_names, None

        # Step 2: Find which diarized speaker has the absolute highest similarity score to an enrolled Agent
        best_speaker = max(speaker_scores, key=lambda s: speaker_scores[s][0])
        best_score, best_emp_id, best_emp_name = speaker_scores[best_speaker]

        logger.info(f"Best Agent candidate: '{best_speaker}' with similarity score {best_score:.4f}")

        # Step 3: Only label as Agent if the best score meets the threshold
        if best_score >= threshold:
            speaker_names[best_speaker] = best_emp_name
            matched_employee_id = best_emp_id
            logger.info(f"Speaker '{best_speaker}' identified as Agent '{best_emp_name}' (score: {best_score:.4f})")
        else:
            logger.info(f"No speaker passed similarity threshold ({threshold}). All speakers labeled as Customer.")

        # Step 4: Every other speaker is labeled as Customer
        customer_count = 1
        for speaker in speaker_audio:
            if speaker not in speaker_names:
                label = "Customer" if len(speaker_audio) <= 2 else f"Customer {customer_count}"
                speaker_names[speaker] = label
                customer_count += 1
                logger.info(f"Speaker '{speaker}' labeled as '{label}'")

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
            prev_has_punctuation = current["text"].endswith((".", "?", "!"))

            # Merge words if same speaker AND pause <= 0.6s AND not sentence boundary
            should_merge = same_speaker and gap <= 0.6 and not (prev_has_punctuation and gap >= 0.3)

            if should_merge:
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


    def verify_and_refine_turns(
        self,
        raw_conversation: List[Dict[str, Any]],
        waveform: torch.Tensor,
        sample_rate: int,
        macro_speaker_names: Dict[str, str],
        threshold: float = 0.50,
        expected_employee_id: Optional[UUID] = None,
    ) -> List[Dict[str, Any]]:
        """Refines diarization turns by running direct per-turn ECAPA voice embedding
        verification against enrolled employee vectors in Milvus.
        """
        if not raw_conversation:
            return []

        logger.info("Executing per-turn ECAPA acoustic embedding verification...")
        refined_turns = []
        filter_expr = f'employee_id == "{str(expected_employee_id)}"' if expected_employee_id else None

        for turn in raw_conversation:
            s_sample = max(0, int(turn["start"] * sample_rate))
            e_sample = min(len(waveform), int(turn["end"] * sample_rate))
            turn_waveform = waveform[s_sample:e_sample]
            turn_duration = len(turn_waveform) / float(sample_rate)

            diarized_speaker = turn["speaker"]
            fallback_name = macro_speaker_names.get(diarized_speaker, "Customer")
            speaker_name = fallback_name

            # Verify turn audio snippet with ECAPA embedding if snippet duration is >= 0.4s
            if turn_duration >= 0.4:
                try:
                    turn_emb = self.generate_speaker_embedding(turn_waveform, sample_rate)
                    matches = self.milvus_repo.search_vectors(query_embedding=turn_emb, top_k=1, filter_expression=filter_expr)

                    if matches:
                        top_match = matches[0]
                        similarity = top_match.get("similarity_score", 0.0)
                        emp_id_str = top_match.get("employee_id")

                        if similarity >= 0.40 and emp_id_str:
                            emp = self.employee_repo.get_by_id(UUID(emp_id_str))
                            if emp:
                                speaker_name = f"{emp.first_name} {emp.last_name}".strip()
                        else:
                            speaker_name = "Customer"
                except Exception as exc:
                    logger.warning(f"Turn embedding verification exception ({turn['start']}s - {turn['end']}s): {str(exc)}")

            refined_turns.append({
                "start": round(turn["start"], 2),
                "end": round(turn["end"], 2),
                "speaker": diarized_speaker,
                "speaker_name": speaker_name,
                "text": turn["text"].strip(),
            })

        # Merge continuous turns belonging to the same verified speaker
        merged_turns = []
        if not refined_turns:
            return []

        curr = refined_turns[0]
        for t in refined_turns[1:]:
            same_speaker = t["speaker_name"] == curr["speaker_name"]
            gap = t["start"] - curr["end"]
            if same_speaker and gap <= 2.5:
                curr["end"] = t["end"]
                curr["text"] += " " + t["text"]
            else:
                merged_turns.append(curr)
                curr = t
        merged_turns.append(curr)

        return merged_turns

    def process_call(
        self,
        audio_path: str,
        expected_employee_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """Runs end-to-end Call Processing pipeline on audio file.
        If expected_employee_id is provided, voice verification is targeted specifically against that agent.
        """
        logger.info(f"Starting Call Processing Pipeline for '{audio_path}' (Expected Agent: '{expected_employee_id}')...")

        import time
        from app.core.metrics import ML_REAL_TIME_FACTOR, StageTimer
        total_start = time.perf_counter()

        # 1. Load full audio waveform
        data, sample_rate = sf.read(audio_path)
        waveform = torch.from_numpy(data).float()
        if waveform.ndim == 2:
            waveform = waveform.mean(dim=1)
        duration_seconds = round(len(waveform) / float(sample_rate), 2)

        # 2. Whisper Speech-to-Text Transcription
        with StageTimer("whisper"):
            words, detected_language = self.transcribe(audio_path)

        # 3. Speaker Diarization with Word Pause Boundary Precision
        with StageTimer("diarization"):
            speaker_segments = self.diarize(audio_path, words=words)

        # 4. Extract Speaker Audio Chunks
        speaker_audio = self.extract_speaker_audio(waveform, sample_rate, speaker_segments)

        # 5. ECAPA Embedding & Milvus Speaker Identification
        threshold = getattr(settings, "SPEAKER_MATCH_THRESHOLD", 0.50)
        with StageTimer("embedding"):
            speaker_names, identified_employee_id = self.identify_speakers(
                speaker_audio,
                sample_rate,
                threshold=threshold,
                expected_employee_id=expected_employee_id,
            )

        # Use expected_employee_id if provided and matched
        if expected_employee_id and not identified_employee_id:
            identified_employee_id = str(expected_employee_id)

        # 6. Align Words with Speakers
        aligned_words = self.align_words_with_speakers(words, speaker_segments)

        # 7. Build Conversation Turns
        raw_conversation = self.build_conversation(aligned_words)

        # 8. Per-Turn ECAPA Acoustic Voice Verification & Turn Merging
        with StageTimer("embedding"):
            transcript_turns = self.verify_and_refine_turns(
                raw_conversation=raw_conversation,
                waveform=waveform,
                sample_rate=sample_rate,
                macro_speaker_names=speaker_names,
                threshold=threshold,
                expected_employee_id=expected_employee_id,
            )

        total_proc_time = time.perf_counter() - total_start
        rtf = round(total_proc_time / max(0.1, duration_seconds), 3)
        ML_REAL_TIME_FACTOR.labels(model="whisper_pyannote").set(rtf)

        logger.info(f"Call processing complete in {total_proc_time:.2f}s (RTF: {rtf}). Generated {len(transcript_turns)} verified transcript turns.")

        return {
            "duration_seconds": duration_seconds,
            "detected_language": detected_language,
            "speakers_count": len(speaker_audio),
            "identified_employee_id": identified_employee_id,
            "speaker_mappings": speaker_names,
            "transcript_turns": transcript_turns,
        }


