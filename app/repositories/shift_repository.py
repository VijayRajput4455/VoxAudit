from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.shift import Shift


class ShiftRepository:

    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, shift: Shift) -> Shift:
        self.db.add(shift)
        self.db.flush()
        self.db.refresh(shift)

        return shift

    def get_by_id(
        self,
        shift_id: UUID,
    ) -> Shift | None:
        statement = select(Shift).where(
            Shift.id == shift_id
        )

        return self.db.scalar(statement)

    def get_by_code(
        self,
        code: str,
    ) -> Shift | None:
        statement = select(Shift).where(
            Shift.code == code
        )

        return self.db.scalar(statement)

    def get_all(self) -> list[Shift]:
        statement = select(Shift)

        return list(
            self.db.scalars(statement).all()
        )

    def update(self, shift: Shift) -> Shift:
        self.db.flush()
        self.db.refresh(shift)

        return shift

    def delete(self, shift: Shift) -> None:
        self.db.delete(shift)
        self.db.flush()
