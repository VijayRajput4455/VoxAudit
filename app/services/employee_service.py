from uuid import UUID

from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.employee import EmployeeCreate, EmployeeUpdate
from app.services.code_generator import CodeGenerator, CodePrefix


class EmployeeService:

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = EmployeeRepository(db)

    def create_employee(
        self,
        data: EmployeeCreate,
    ) -> Employee:

        # Generate unique sequential AGNT-XXXXXX code automatically if not specified
        emp_code = data.employee_code
        if not emp_code:
            emp_code = CodeGenerator.generate_code(self.db, CodePrefix.EMPLOYEE)
        else:
            existing_employee = self.repository.get_by_code(emp_code)
            if existing_employee:
                raise ValueError(f"Employee code '{emp_code}' already exists.")

        employee = Employee(
            employee_code=emp_code,
            first_name=data.first_name,
            last_name=data.last_name,
            father_name=data.father_name,
            date_of_birth=data.date_of_birth,
            date_of_joining=data.date_of_joining,
            email=data.email,
            phone=data.phone,
            department_id=data.department_id,
            designation_id=data.designation_id,
            shift_id=data.shift_id,
            manager_id=data.manager_id,
            location=data.location,
            status=data.status,
        )

        try:
            employee = self.repository.create(employee)

            self.db.commit()
            self.db.refresh(employee)

            return employee

        except Exception:
            self.db.rollback()
            raise

    def get_employee(
        self,
        employee_id: UUID,
    ) -> Employee | None:

        return self.repository.get_by_id(employee_id)

    def get_employee_by_code(
        self,
        employee_code: str,
    ) -> Employee | None:

        return self.repository.get_by_code(employee_code)

    def get_employees(self) -> list[Employee]:

        return self.repository.get_all()

    def update_employee(
        self,
        employee_id: UUID,
        data: EmployeeUpdate,
    ) -> Employee | None:

        employee = self.repository.get_by_id(employee_id)

        if employee is None:
            return None

        update_data = data.model_dump(
            exclude_unset=True
        )

        for field, value in update_data.items():
            setattr(employee, field, value)

        try:
            employee = self.repository.update(employee)

            self.db.commit()
            self.db.refresh(employee)

            return employee

        except Exception:
            self.db.rollback()
            raise

    def delete_employee(
        self,
        employee_id: UUID,
    ) -> bool:
        employee = self.repository.get_by_id(employee_id)
        if employee is None:
            return False

        try:
            # 1. Clean up MinIO audio files and PostgreSQL voice samples
            from app.repositories.voice_sample_repository import VoiceSampleRepository
            from app.integrations.minio.storage import MinioStorage
            from app.integrations.milvus.repository import MilvusRepository

            voice_sample_repo = VoiceSampleRepository(self.db)
            voice_samples = voice_sample_repo.get_by_employee_id(employee_id)

            storage = MinioStorage()
            for sample in voice_samples:
                if sample.storage_key:
                    try:
                        storage.delete_file(sample.storage_key)
                    except Exception:
                        pass
                voice_sample_repo.delete(sample)

            # 2. Clean up Milvus vector database embeddings
            try:
                milvus_repo = MilvusRepository()
                milvus_repo.delete_vectors_by_employee_id(str(employee_id))
            except Exception:
                pass

            # 3. Delete Employee record from PostgreSQL
            self.repository.delete(employee)
            self.db.commit()
            return True

        except Exception:
            self.db.rollback()
            raise