from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.designation import (
    DesignationCreate,
    DesignationResponse,
    DesignationUpdate,
)
from app.services.designation_service import DesignationService


router = APIRouter()


@router.post(
    "/",
    response_model=DesignationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_designation(
    data: DesignationCreate,
    db: Session = Depends(get_db),
):
    service = DesignationService(db)

    try:
        return service.create_designation(data)

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )


@router.get(
    "/",
    response_model=list[DesignationResponse],
)
def get_designations(
    db: Session = Depends(get_db),
):
    service = DesignationService(db)

    return service.get_designations()


@router.get(
    "/{designation_id}",
    response_model=DesignationResponse,
)
def get_designation(
    designation_id: UUID,
    db: Session = Depends(get_db),
):
    service = DesignationService(db)

    designation = service.get_designation(designation_id)

    if not designation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Designation not found.",
        )

    return designation


@router.patch(
    "/{designation_id}",
    response_model=DesignationResponse,
)
def update_designation(
    designation_id: UUID,
    data: DesignationUpdate,
    db: Session = Depends(get_db),
):
    service = DesignationService(db)

    try:
        designation = service.update_designation(
            designation_id,
            data,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )

    if not designation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Designation not found.",
        )

    return designation


@router.delete(
    "/{designation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_designation(
    designation_id: UUID,
    db: Session = Depends(get_db),
):
    service = DesignationService(db)

    deleted = service.delete_designation(designation_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Designation not found.",
        )
