import os
import tempfile
from typing import BinaryIO, Dict, Any, List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.exceptions import VoxAuditException
from app.core.logging import get_logger
from app.integrations.milvus.repository import MilvusRepository
from app.ml.inference.speaker_embedding import SpeakerEmbeddingInference
from app.ml.preprocessing.audio import load_and_preprocess_audio
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.voice_sample_repository import VoiceSampleRepository
from app.services.voice.quality_service import QualityService

logger = get_logger(__name__)


class VerificationService:
    """Service for speaker voice verification and identification against enrolled Milvus vectors."""

    def __init__(
        self,
        db: Session,
        milvus_repo: Optional[MilvusRepository] = None,
        inference: Optional[SpeakerEmbeddingInference] = None,
        quality_service: Optional[QualityService] = None,
    ) -> None:
        self.db = db
        self.milvus_repo = milvus_repo if milvus_repo is not None else MilvusRepository()
        self.inference = inference if inference is not None else SpeakerEmbeddingInference()
        self.quality_service = quality_service if quality_service is not None else QualityService()
        self.employee_repo = EmployeeRepository(db)
        self.voice_sample_repo = VoiceSampleRepository(db)

    def verify_or_identify_speaker(
        self,
        file_obj: BinaryIO,
        original_file_name: str,
        target_employee_id: Optional[UUID] = None,
        threshold: float = 0.70,
        top_k: int = 5,
    ) -> Dict[str, Any]:
        """Processes query audio, generates 192D ECAPA embedding, and searches Milvus for matching enrolled speakers.
        
        Args:
            file_obj: Binary stream of query audio file
            original_file_name: Filename (e.g. test_sample.wav or .mp3)
            target_employee_id: Optional specific employee ID to verify against (1-to-1 verification)
            threshold: Cosine similarity match threshold (default 0.70)
            top_k: Number of candidate matches to retrieve
            
        Returns:
            Dict containing match result, similarity scores, and matched employee profile.
        """
        temp_audio_path = None
        try:
            # 1. Write incoming stream to temporary file
            ext = original_file_name.split(".")[-1] if "." in original_file_name else "wav"
            with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp_file:
                tmp_file.write(file_obj.read())
                temp_audio_path = tmp_file.name

            # 2. Preprocess audio to 16kHz mono tensor
            waveform, sample_rate = load_and_preprocess_audio(temp_audio_path)
            num_channels, num_samples = waveform.shape
            duration_seconds = round(num_samples / float(sample_rate), 3)

            # 3. Assess quality
            quality_score = self.quality_service.assess_quality(waveform, sample_rate)

            # 4. Generate 192D ECAPA embedding
            tensor_vec = self.inference.generate_from_waveform(waveform)
            numpy_embedding = tensor_vec.numpy()

            # 5. Search Milvus vector database
            filter_expr = f'employee_id == "{str(target_employee_id)}"' if target_employee_id else None
            matches = self.milvus_repo.search_vectors(
                query_embedding=numpy_embedding,
                top_k=top_k,
                filter_expression=filter_expr,
            )

            if not matches:
                return {
                    "is_match": False,
                    "confidence_score": 0.0,
                    "similarity_score": 0.0,
                    "threshold_applied": threshold,
                    "matched_employee": None,
                    "matched_voice_sample_id": None,
                    "audio_duration_seconds": duration_seconds,
                    "quality_score": quality_score,
                    "top_matches": [],
                    "message": "No enrolled voice embeddings found in Milvus vector database.",
                }

            top_match = matches[0]
            top_similarity = top_match.get("similarity_score", 0.0)
            is_match = top_similarity >= threshold

            matched_employee_data = None
            matched_sample_id = top_match.get("voice_sample_id")

            if top_match.get("employee_id"):
                try:
                    emp = self.employee_repo.get_by_id(UUID(top_match["employee_id"]))
                    if emp:
                        dept_name = emp.department.name if emp.department else None
                        desig_name = emp.designation.name if emp.designation else None
                        matched_employee_data = {
                            "id": str(emp.id),
                            "employee_code": emp.employee_code,
                            "first_name": emp.first_name,
                            "last_name": emp.last_name,
                            "full_name": f"{emp.first_name} {emp.last_name or ''}".strip(),
                            "email": emp.email,
                            "phone": emp.phone,
                            "department_name": dept_name,
                            "designation_name": desig_name,
                        }
                except Exception as exc:
                    logger.warning(f"Error fetching matched employee details: {exc}")

            return {
                "is_match": is_match,
                "confidence_score": top_similarity,
                "similarity_score": top_similarity,
                "threshold_applied": threshold,
                "matched_employee": matched_employee_data,
                "matched_voice_sample_id": matched_sample_id,
                "audio_duration_seconds": duration_seconds,
                "quality_score": quality_score,
                "top_matches": matches,
                "message": f"Speaker identified with similarity {top_similarity:.4f}" if is_match else f"No match exceeded threshold {threshold:.2f} (Top score: {top_similarity:.4f})",
            }

        except Exception as exc:
            logger.error(f"Speaker verification failed: {str(exc)}", exc_info=True)
            raise VoxAuditException(f"Speaker verification error: {str(exc)}") from exc
        finally:
            if temp_audio_path and os.path.exists(temp_audio_path):
                try:
                    os.remove(temp_audio_path)
                except Exception:
                    pass
