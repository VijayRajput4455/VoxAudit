from datetime import date
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.employee import EmployeeCreate, EmployeeUpdate


class EmployeeService:

    def __init__(self, db: Session):
        self.repository = EmployeeRepository(db)

    def create_employee(
        self,
        data: EmployeeCreate,
    ) -> Employee:

        existing = self.repository.get_by_code(
            data.employee_code
        )

        if existing:
            raise ValueError(
                f"Employee code '{data.employee_code}' already exists."
            )

        name_parts = data.name.strip().split(" ", 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else None

        employee = Employee(
            employee_code=data.employee_code,
            first_name=first_name,
            last_name=last_name,
            father_name=data.father_name,
            date_of_birth=data.date_of_birth,
            date_of_joining=data.joining_date or date.today(),
            department_id=data.department_id,
            designation_id=data.designation_id,
            shift_id=data.shift_id,
            status=data.status,
        )

        return self.repository.create(employee)

    def get_employee(
        self,
        employee_id: UUID,
    ) -> Employee | None:

        return self.repository.get_by_id(employee_id)

    def get_employees(self) -> list[Employee]:

        return self.repository.get_all()

    def update_employee(
        self,
        employee_id: UUID,
        data: EmployeeUpdate,
    ) -> Employee | None:

        employee = self.repository.get_by_id(employee_id)

        if not employee:
            return None

        update_data = data.model_dump(
            exclude_unset=True
        )

        if "name" in update_data and update_data["name"]:
            name_val = update_data.pop("name")
            name_parts = name_val.strip().split(" ", 1)
            employee.first_name = name_parts[0]
            employee.last_name = name_parts[1] if len(name_parts) > 1 else None

        if "joining_date" in update_data:
            employee.date_of_joining = update_data.pop("joining_date")

        for field, value in update_data.items():
            setattr(employee, field, value)

        return self.repository.create(employee)

    def delete_employee(
        self,
        employee_id: UUID,
    ) -> bool:

        employee = self.repository.get_by_id(employee_id)

        if not employee:
            return False

        self.repository.delete(employee)

        return True