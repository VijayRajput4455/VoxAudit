from datetime import time
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.shift import Shift
from app.repositories.shift_repository import ShiftRepository
from app.schemas.shift import ShiftCreate, ShiftUpdate
from app.services.code_generator import CodeGenerator, CodePrefix


DEFAULT_SHIFTS = [
    {
        "code": "GEN",
        "name": "General",
        "start_time": time(9, 0),
        "end_time": time(17, 0),
        "timezone": "UTC",
    },
    {
        "code": "MORNING",
        "name": "Morning",
        "start_time": time(6, 0),
        "end_time": time(14, 0),
        "timezone": "UTC",
    },
    {
        "code": "EVENING",
        "name": "Evening",
        "start_time": time(14, 0),
        "end_time": time(22, 0),
        "timezone": "UTC",
    },
    {
        "code": "NIGHT",
        "name": "Night",
        "start_time": time(22, 0),
        "end_time": time(6, 0),
        "timezone": "UTC",
    },
]


class ShiftService:

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = ShiftRepository(db)

    def create_shift(
        self,
        data: ShiftCreate,
    ) -> Shift:

        # Generate unique sequential SHFT-XXXXXX code automatically if not specified
        code = data.code
        if not code:
            code = CodeGenerator.generate_code(self.db, CodePrefix.SHIFT)
        else:
            existing = self.repository.get_by_code(code)
            if existing:
                raise ValueError(f"Shift code '{code}' already exists.")

        shift = Shift(
            code=code,
            name=data.name,
            start_time=data.start_time,
            end_time=data.end_time,
            timezone=data.timezone,
            status=data.status,
        )

        try:
            shift = self.repository.create(shift)
            self.db.commit()
            self.db.refresh(shift)

            return shift

        except IntegrityError:
            self.db.rollback()
            raise ValueError("Shift code already exists.")

        except Exception:
            self.db.rollback()
            raise

    def get_shift(
        self,
        shift_id: UUID,
    ) -> Shift | None:

        return self.repository.get_by_id(shift_id)

    def get_shift_by_code(
        self,
        code: str,
    ) -> Shift | None:

        return self.repository.get_by_code(code)

    def get_shifts(self) -> list[Shift]:

        return self.repository.get_all()

    def update_shift(
        self,
        shift_id: UUID,
        data: ShiftUpdate,
    ) -> Shift | None:

        shift = self.repository.get_by_id(shift_id)

        if shift is None:
            return None

        update_data = data.model_dump(exclude_unset=True)

        if "code" in update_data and update_data["code"] != shift.code:
            existing = self.repository.get_by_code(update_data["code"])
            if existing:
                raise ValueError(
                    f"Shift code '{update_data['code']}' already exists."
                )

        for field, value in update_data.items():
            setattr(shift, field, value)

        try:
            shift = self.repository.update(shift)
            self.db.commit()
            self.db.refresh(shift)

            return shift

        except IntegrityError:
            self.db.rollback()
            raise ValueError("Shift code already exists.")

        except Exception:
            self.db.rollback()
            raise

    def delete_shift(
        self,
        shift_id: UUID,
    ) -> bool:

        shift = self.repository.get_by_id(shift_id)

        if shift is None:
            return False

        try:
            self.repository.delete(shift)
            self.db.commit()

            return True

        except Exception:
            self.db.rollback()
            raise

    def seed_default_shifts(self) -> list[Shift]:

        created_shifts = []

        for shift_data in DEFAULT_SHIFTS:
            existing = self.repository.get_by_code(shift_data["code"])
            if not existing:
                shift = Shift(
                    code=shift_data["code"],
                    name=shift_data["name"],
                    start_time=shift_data["start_time"],
                    end_time=shift_data["end_time"],
                )
                self.repository.create(shift)
                created_shifts.append(shift)

        if created_shifts:
            self.db.commit()
            for s in created_shifts:
                self.db.refresh(s)

        return created_shifts
