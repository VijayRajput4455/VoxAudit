from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.shift import (
    ShiftCreate,
    ShiftResponse,
    ShiftUpdate,
)
from app.services.shift_service import ShiftService


router = APIRouter()


@router.post(
    "/",
    response_model=ShiftResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_shift(
    data: ShiftCreate,
    db: Session = Depends(get_db),
):
    service = ShiftService(db)

    try:
        return service.create_shift(data)

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )


@router.post(
    "/seed",
    response_model=list[ShiftResponse],
    status_code=status.HTTP_201_CREATED,
)
def seed_shifts(
    db: Session = Depends(get_db),
):
    service = ShiftService(db)

    return service.seed_default_shifts()


@router.get(
    "/",
    response_model=list[ShiftResponse],
)
def get_shifts(
    db: Session = Depends(get_db),
):
    service = ShiftService(db)

    return service.get_shifts()


@router.get(
    "/{shift_id}",
    response_model=ShiftResponse,
)
def get_shift(
    shift_id: UUID,
    db: Session = Depends(get_db),
):
    service = ShiftService(db)

    shift = service.get_shift(shift_id)

    if not shift:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shift not found.",
        )

    return shift


@router.patch(
    "/{shift_id}",
    response_model=ShiftResponse,
)
def update_shift(
    shift_id: UUID,
    data: ShiftUpdate,
    db: Session = Depends(get_db),
):
    service = ShiftService(db)

    try:
        shift = service.update_shift(
            shift_id,
            data,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )

    if not shift:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shift not found.",
        )

    return shift


@router.delete(
    "/{shift_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_shift(
    shift_id: UUID,
    db: Session = Depends(get_db),
):
    service = ShiftService(db)

    deleted = service.delete_shift(shift_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shift not found.",
        )
