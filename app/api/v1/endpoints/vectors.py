from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.integrations.milvus.repository import MilvusRepository
from app.schemas.voice_sample import (
    VectorRecordResponse,
    VectorStatsResponse,
    VoiceDatabaseSummaryResponse,
)
from app.services.voice.enrollment_service import EnrollmentService

router = APIRouter()


@router.get(
    "/stats",
    response_model=VectorStatsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Vector Database Stats",
    description="Retrieves Milvus collection status, vector count, and embedding dimension.",
)
def get_vector_db_stats() -> VectorStatsResponse:
    """Returns Milvus collection statistics."""
    milvus_repo = MilvusRepository()
    stats = milvus_repo.get_collection_stats()
    return VectorStatsResponse(**stats)


@router.get(
    "/summary",
    response_model=VoiceDatabaseSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get All Employee Voice Profiles & Vector Summary",
    description="Retrieves full details of all employees with their enrolled voice audio samples and Milvus vector counts.",
)
def get_vector_db_summary(
    db: Session = Depends(get_db),
) -> VoiceDatabaseSummaryResponse:
    """Returns complete voice database report for all employees."""
    enrollment_service = EnrollmentService(db)
    summary_data = enrollment_service.get_voice_database_summary()
    return VoiceDatabaseSummaryResponse.model_validate(summary_data)


@router.get(
    "/employee/{employee_id}",
    response_model=List[VectorRecordResponse],
    status_code=status.HTTP_200_OK,
    summary="List Enrolled Voice Vectors for Employee",
    description="Retrieves all vector embedding records stored in Milvus for a specific employee.",
)
def get_employee_vectors(employee_id: UUID) -> List[VectorRecordResponse]:
    """Retrieves all voice vector records for an employee."""
    milvus_repo = MilvusRepository()
    vectors = milvus_repo.get_vectors_by_employee_id(str(employee_id))
    return [
        VectorRecordResponse(
            embedding_id=str(v.get("id", v.get("embedding_id"))),
            employee_id=str(v.get("employee_id")),
            voice_sample_id=str(v.get("voice_sample_id")) if v.get("voice_sample_id") else None,
            model=v.get("model"),
            model_version=v.get("model_version"),
        )
        for v in vectors
    ]


@router.get(
    "/{embedding_id}",
    response_model=VectorRecordResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Vector Record by Embedding ID",
    description="Fetches vector embedding metadata from Milvus by embedding_id.",
)
def get_vector_by_id(embedding_id: str) -> VectorRecordResponse:
    """Fetches a specific vector record from Milvus."""
    milvus_repo = MilvusRepository()
    vector = milvus_repo.get_vector_by_id(embedding_id)
    if not vector:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vector with embedding_id '{embedding_id}' not found in Milvus.",
        )
    return VectorRecordResponse(
        embedding_id=str(vector.get("id", embedding_id)),
        employee_id=str(vector.get("employee_id")),
        voice_sample_id=str(vector.get("voice_sample_id")) if vector.get("voice_sample_id") else None,
        model=vector.get("model"),
        model_version=vector.get("model_version"),
    )


@router.delete(
    "/employee/{employee_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete All Enrolled Vectors for Employee",
    description="Deletes all vector embeddings associated with an employee from Milvus.",
)
def delete_employee_vectors(employee_id: UUID) -> dict:
    """Deletes all voice vectors for an employee from Milvus."""
    milvus_repo = MilvusRepository()
    deleted_count = milvus_repo.delete_vectors_by_employee_id(str(employee_id))
    return {
        "message": f"Successfully deleted voice vectors for employee '{employee_id}' from Milvus.",
        "employee_id": str(employee_id),
        "deleted_count": deleted_count,
    }


@router.delete(
    "/all",
    status_code=status.HTTP_200_OK,
    summary="Purge All Vectors from Milvus Collection",
    description="Deletes all vector embeddings stored in the Milvus vector database.",
)
def delete_all_vectors() -> dict:
    """Deletes all vector embeddings from Milvus."""
    milvus_repo = MilvusRepository()
    deleted_count = milvus_repo.delete_all_vectors()
    return {
        "message": "Successfully purged all voice vector embeddings from Milvus.",
        "deleted_count": deleted_count,
    }


@router.delete(
    "/{embedding_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete Vector Record by Embedding ID",
    description="Deletes a specific vector embedding from Milvus by embedding_id.",
)
def delete_vector_by_id(embedding_id: str) -> dict:
    """Deletes a single vector from Milvus."""
    milvus_repo = MilvusRepository()
    milvus_repo.delete_vector(embedding_id)
    return {
        "message": f"Successfully deleted vector '{embedding_id}' from Milvus.",
        "embedding_id": embedding_id,
    }
