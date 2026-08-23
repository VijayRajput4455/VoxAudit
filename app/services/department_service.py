from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.department import Department
from app.repositories.department_repository import DepartmentRepository
from app.schemas.department import DepartmentCreate, DepartmentUpdate
from app.services.code_generator import CodeGenerator, CodePrefix


DEFAULT_DEPARTMENTS = [
    {
        "name": "Customer Support",
        "description": "Department responsible for customer support, call resolution, and QA scorecards.",
    },
    {
        "name": "Sales",
        "description": "Department handling outbound sales calls, lead qualification, and customer acquisition.",
    },
    {
        "name": "Backend Operations",
        "description": "Department managing back-office data processing, verification, and workflow management.",
    },
]


class DepartmentService:

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DepartmentRepository(db)

    def create_department(
        self,
        data: DepartmentCreate,
    ) -> Department:

        existing_name = self.repository.get_by_name(data.name)
        if existing_name:
            raise ValueError(f"Department name '{data.name}' already exists.")

        # Generate unique sequential DEPT-XXXXXX code automatically if not specified
        code = data.code
        if not code:
            code = CodeGenerator.generate_code(self.db, CodePrefix.DEPARTMENT)
        else:
            existing_code = self.repository.get_by_code(code)
            if existing_code:
                raise ValueError(f"Department code '{code}' already exists.")

        department = Department(
            code=code,
            name=data.name,
            description=data.description,
            status=data.status,
        )

        try:
            department = self.repository.create(department)
            self.db.commit()
            self.db.refresh(department)

            return department

        except IntegrityError:
            self.db.rollback()
            raise ValueError("Department code or name already exists.")

        except Exception:
            self.db.rollback()
            raise

    def get_department(
        self,
        department_id: UUID,
    ) -> Department | None:

        return self.repository.get_by_id(department_id)

    def get_department_by_code(
        self,
        code: str,
    ) -> Department | None:

        return self.repository.get_by_code(code)

    def get_departments(self) -> list[Department]:

        return self.repository.get_all()

    def update_department(
        self,
        department_id: UUID,
        data: DepartmentUpdate,
    ) -> Department | None:

        department = self.repository.get_by_id(department_id)

        if department is None:
            return None

        update_data = data.model_dump(exclude_unset=True)

        if "code" in update_data and update_data["code"] != department.code:
            existing_code = self.repository.get_by_code(update_data["code"])
            if existing_code:
                raise ValueError(
                    f"Department code '{update_data['code']}' already exists."
                )

        if "name" in update_data and update_data["name"] != department.name:
            existing_name = self.repository.get_by_name(update_data["name"])
            if existing_name:
                raise ValueError(
                    f"Department name '{update_data['name']}' already exists."
                )

        for field, value in update_data.items():
            setattr(department, field, value)

        try:
            department = self.repository.update(department)
            self.db.commit()
            self.db.refresh(department)

            return department

        except IntegrityError:
            self.db.rollback()
            raise ValueError("Department code or name already exists.")

        except Exception:
            self.db.rollback()
            raise

    def delete_department(
        self,
        department_id: UUID,
    ) -> bool:

        department = self.repository.get_by_id(department_id)

        if department is None:
            return False

        try:
            self.repository.delete(department)
            self.db.commit()

            return True

        except Exception:
            self.db.rollback()
            raise

    def seed_default_departments(self) -> list[Department]:
        created_departments = []
        all_existing = self.repository.get_all()
        existing_names = {d.name.lower() for d in all_existing}

        for dept_data in DEFAULT_DEPARTMENTS:
            if dept_data["name"].lower() not in existing_names:
                code = CodeGenerator.generate_code(self.db, CodePrefix.DEPARTMENT)
                dept = Department(
                    code=code,
                    name=dept_data["name"],
                    description=dept_data.get("description"),
                    status="ACTIVE",
                )
                dept = self.repository.create(dept)
                created_departments.append(dept)
                existing_names.add(dept_data["name"].lower())

        if created_departments:
            self.db.commit()

        return self.repository.get_all()
