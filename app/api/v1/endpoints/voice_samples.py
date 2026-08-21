from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

# pyrefly: ignore [missing-import]
from app.core.database import get_db
from app.core.exceptions import VoxAuditException
from app.core.logging import get_logger
from app.repositories.voice_sample_repository import VoiceSampleRepository
from app.schemas.voice_sample import (
    SpeakerVerificationResponse,
    VoiceDatabaseSummaryResponse,
    VoiceSampleBatchEnrollmentResponse,
    VoiceSampleEnrollmentResponse,
    VoiceSampleResponse,
)
from app.services.voice.enrollment_service import EnrollmentService

logger = get_logger(__name__)

router = APIRouter()


@router.post(
    "/enroll",
    response_model=VoiceSampleBatchEnrollmentResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Asynchronous Multi-File Voice Sample Enrollment",
    description="Uploads one or multiple employee voice audio files, stores audio in MinIO, and queues asynchronous ECAPA embedding jobs. Returns 202 Accepted immediately.",
)
@router.post(
    "",
    response_model=VoiceSampleBatchEnrollmentResponse,
    status_code=status.HTTP_202_ACCEPTED,
    include_in_schema=False,
)
def enroll_voice_sample(
    employee_id: UUID = Form(...),
    files: List[UploadFile] = File(
        default=[],
        description="Select one or multiple voice sample audio files to enroll",
    ),
    sample_type: str = Form("ENROLLMENT"),
    source: Optional[str] = Form("web"),
    db: Session = Depends(get_db),
) -> VoiceSampleBatchEnrollmentResponse:
    """Enrolls one or multiple voice samples asynchronously."""
    upload_files = [f for f in files if f.filename]

    if not upload_files:
        raise HTTPException(status_code=400, detail="At least one voice sample audio file is required.")

    enrollment_service = EnrollmentService(db)
    created_samples = []

    try:
        for ufile in upload_files:
            if not ufile.filename:
                continue
            file_bytes = ufile.file.read()
            ufile.file.seek(0)
            file_size = len(file_bytes)

            sample = enrollment_service.enroll_voice_sample(
                employee_id=employee_id,
                file_obj=ufile.file,
                original_file_name=ufile.filename,
                file_size=file_size,
                content_type=ufile.content_type or "audio/wav",
                sample_type=sample_type,
                source=source,
            )
            created_samples.append(sample)

        if not created_samples:
            raise HTTPException(status_code=400, detail="Filename is required.")

        sample_responses = [
            VoiceSampleEnrollmentResponse(
                id=s.id,
                employee_id=s.employee_id,
                status=s.status,
                message="Voice sample accepted for processing.",
            )
            for s in created_samples
        ]

        return VoiceSampleBatchEnrollmentResponse(
            employee_id=employee_id,
            total_samples=len(sample_responses),
            samples=sample_responses,
            message=f"Accepted {len(sample_responses)} voice sample(s) for processing.",
        )
    except VoxAuditException as exc:
        logger.warning(f"Enrollment validation error: {str(exc)}")
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Unexpected enrollment error: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal voice enrollment failure.")


@router.get(
    "/{voice_sample_id}",
    response_model=VoiceSampleResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Voice Sample Status & Metadata",
    description="Retrieves status and metadata for a specific voice sample. Does not expose raw vector data.",
)
def get_voice_sample(
    voice_sample_id: UUID,
    db: Session = Depends(get_db),
) -> VoiceSampleResponse:
    """Retrieves voice sample status."""
    repo = VoiceSampleRepository(db)
    sample = repo.get_by_id(voice_sample_id)

    if not sample:
        raise HTTPException(status_code=44, detail=f"Voice sample '{voice_sample_id}' not found.")

    return VoiceSampleResponse.model_validate(sample)


@router.get(
    "/employee/{employee_id}",
    response_model=List[VoiceSampleResponse],
    status_code=status.HTTP_200_OK,
    summary="List Voice Samples for Employee",
)
def get_employee_voice_samples(
    employee_id: UUID,
    db: Session = Depends(get_db),
) -> List[VoiceSampleResponse]:
    """Lists all voice samples for an employee."""
    repo = VoiceSampleRepository(db)
    samples = repo.get_by_employee_id(employee_id)
    return [VoiceSampleResponse.model_validate(s) for s in samples]


@router.get(
    "/summary/all",
    response_model=VoiceDatabaseSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Detailed Voice Database Summary for All Employees",
    description="Retrieves a complete report of all enrolled employees, their enrolled audio sample metadata, and vector counts across Milvus and PostgreSQL.",
)
def get_voice_database_summary_all(
    db: Session = Depends(get_db),
) -> VoiceDatabaseSummaryResponse:
    """Returns detailed voice database summary including employee names, voice sample details, and vector counts."""
    enrollment_service = EnrollmentService(db)
    summary_data = enrollment_service.get_voice_database_summary()
    return VoiceDatabaseSummaryResponse.model_validate(summary_data)


@router.post(
    "/verify",
    response_model=SpeakerVerificationResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify / Identify Speaker Voice Sample",
    description="Uploads a query audio file, computes SpeechBrain ECAPA 192D embedding, and searches Milvus for matching enrolled employee vectors.",
)
def verify_speaker_voice(
    file: UploadFile = File(...),
    target_employee_id: Optional[UUID] = Form(None),
    threshold: float = Form(0.70),
    db: Session = Depends(get_db),
) -> SpeakerVerificationResponse:
    """Verifies or identifies a speaker voice sample against enrolled Milvus vector database."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required.")

    from app.services.voice.verification_service import VerificationService
    verification_service = VerificationService(db)

    try:
        result = verification_service.verify_or_identify_speaker(
            file_obj=file.file,
            original_file_name=file.filename,
            target_employee_id=target_employee_id,
            threshold=threshold,
        )
        return SpeakerVerificationResponse.model_validate(result)
    except VoxAuditException as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Speaker verification endpoint failure: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Speaker verification failure.")


@router.delete(
    "/purge/all",
    status_code=status.HTTP_200_OK,
    summary="Purge All Enrolled Voice Samples & Vectors",
    description="Purges all enrolled voice sample records from PostgreSQL, removes all audio files from MinIO, and clears all vectors from Milvus.",
)
def purge_all_voice_samples(
    db: Session = Depends(get_db),
) -> dict:
    """Purges all voice samples across Postgres, MinIO, and Milvus."""
    repo = VoiceSampleRepository(db)
    from sqlalchemy import select
    from app.models.voice_sample import VoiceSample
    from app.integrations.minio.storage import MinioStorage
    from app.integrations.milvus.repository import MilvusRepository

    samples = db.scalars(select(VoiceSample)).all()
    storage = MinioStorage()
    milvus_repo = MilvusRepository()

    deleted_count = 0
    for sample in samples:
        if sample.storage_key:
            try:
                storage.delete_file(sample.storage_key)
            except Exception:
                pass
        repo.delete(sample)
        deleted_count += 1

    milvus_deleted = milvus_repo.delete_all_vectors()
    db.commit()

    return {
        "message": "Successfully purged all voice samples and vectors.",
        "samples_deleted": deleted_count,
        "vectors_purged": milvus_deleted,
    }


@router.delete(
    "/{voice_sample_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete Single Voice Sample",
    description="Deletes a specific voice sample record from PostgreSQL, removes audio file from MinIO, and deletes its embedding from Milvus.",
)
def delete_voice_sample(
    voice_sample_id: UUID,
    db: Session = Depends(get_db),
) -> dict:
    """Deletes a single voice sample across Postgres, MinIO, and Milvus."""
    repo = VoiceSampleRepository(db)
    sample = repo.get_by_id(voice_sample_id)
    if not sample:
        raise HTTPException(status_code=404, detail=f"Voice sample '{voice_sample_id}' not found.")

    if sample.storage_key:
        try:
            from app.integrations.minio.storage import MinioStorage
            storage = MinioStorage()
            storage.delete_file(sample.storage_key)
        except Exception:
            pass

    if sample.embedding_id:
        try:
            from app.integrations.milvus.repository import MilvusRepository
            milvus_repo = MilvusRepository()
            milvus_repo.delete_vector(sample.embedding_id)
        except Exception:
            pass

    repo.delete(sample)
    db.commit()

    return {"message": f"Successfully deleted voice sample '{voice_sample_id}'.", "voice_sample_id": str(voice_sample_id)}
