from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.employee import Employee


class EmployeeRepository:

    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, employee: Employee) -> Employee:
        self.db.add(employee)
        self.db.flush()
        self.db.refresh(employee)

        return employee

    def get_by_id(
        self,
        employee_id: UUID,
    ) -> Employee | None:
        statement = select(Employee).where(
            Employee.id == employee_id
        )

        return self.db.scalar(statement)

    def get_by_code(
        self,
        employee_code: str,
    ) -> Employee | None:
        statement = select(Employee).where(
            Employee.employee_code == employee_code
        )

        return self.db.scalar(statement)

    def get_all(self) -> list[Employee]:
        statement = select(Employee)

        return list(
            self.db.scalars(statement).all()
        )

    def update(self, employee: Employee) -> Employee:
        self.db.flush()
        self.db.refresh(employee)

        return employee

    def delete(self, employee: Employee) -> None:
        self.db.delete(employee)
        self.db.flush()