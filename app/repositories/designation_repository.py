from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.designation import Designation


class DesignationRepository:

    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, designation: Designation) -> Designation:
        self.db.add(designation)
        self.db.flush()
        self.db.refresh(designation)

        return designation

    def get_by_id(
        self,
        designation_id: UUID,
    ) -> Designation | None:
        statement = select(Designation).where(
            Designation.id == designation_id
        )

        return self.db.scalar(statement)

    def get_by_code(
        self,
        code: str,
    ) -> Designation | None:
        statement = select(Designation).where(
            Designation.code == code
        )

        return self.db.scalar(statement)

    def get_all(self) -> list[Designation]:
        statement = select(Designation)

        return list(
            self.db.scalars(statement).all()
        )

    def update(self, designation: Designation) -> Designation:
        self.db.flush()
        self.db.refresh(designation)

        return designation

    def delete(self, designation: Designation) -> None:
        self.db.delete(designation)
        self.db.flush()
