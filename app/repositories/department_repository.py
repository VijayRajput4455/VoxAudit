from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.department import Department


class DepartmentRepository:

    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, department: Department) -> Department:
        self.db.add(department)
        self.db.flush()
        self.db.refresh(department)

        return department

    def get_by_id(
        self,
        department_id: UUID,
    ) -> Department | None:
        statement = select(Department).where(
            Department.id == department_id
        )

        return self.db.scalar(statement)

    def get_by_code(
        self,
        code: str,
    ) -> Department | None:
        statement = select(Department).where(
            Department.code == code
        )

        return self.db.scalar(statement)

    def get_by_name(
        self,
        name: str,
    ) -> Department | None:
        statement = select(Department).where(
            Department.name == name
        )

        return self.db.scalar(statement)

    def get_all(self) -> list[Department]:
        statement = select(Department)

        return list(
            self.db.scalars(statement).all()
        )

    def update(self, department: Department) -> Department:
        self.db.flush()
        self.db.refresh(department)

        return department

    def delete(self, department: Department) -> None:
        self.db.delete(department)
        self.db.flush()
