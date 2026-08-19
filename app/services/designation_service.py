from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.designation import Designation
from app.repositories.designation_repository import DesignationRepository
from app.schemas.designation import DesignationCreate, DesignationUpdate


class DesignationService:

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DesignationRepository(db)

    def create_designation(
        self,
        data: DesignationCreate,
    ) -> Designation:

        existing = self.repository.get_by_code(data.code)
        if existing:
            raise ValueError(f"Designation code '{data.code}' already exists.")

        designation = Designation(
            code=data.code,
            name=data.name,
            department_id=data.department_id,
            description=data.description,
            status=data.status,
        )

        try:
            designation = self.repository.create(designation)
            self.db.commit()
            self.db.refresh(designation)

            return designation

        except IntegrityError:
            self.db.rollback()
            raise ValueError("Designation code already exists.")

        except Exception:
            self.db.rollback()
            raise

    def get_designation(
        self,
        designation_id: UUID,
    ) -> Designation | None:

        return self.repository.get_by_id(designation_id)

    def get_designation_by_code(
        self,
        code: str,
    ) -> Designation | None:

        return self.repository.get_by_code(code)

    def get_designations(self) -> list[Designation]:

        return self.repository.get_all()

    def update_designation(
        self,
        designation_id: UUID,
        data: DesignationUpdate,
    ) -> Designation | None:

        designation = self.repository.get_by_id(designation_id)

        if designation is None:
            return None

        update_data = data.model_dump(exclude_unset=True)

        if "code" in update_data and update_data["code"] != designation.code:
            existing = self.repository.get_by_code(update_data["code"])
            if existing:
                raise ValueError(
                    f"Designation code '{update_data['code']}' already exists."
                )

        for field, value in update_data.items():
            setattr(designation, field, value)

        try:
            designation = self.repository.update(designation)
            self.db.commit()
            self.db.refresh(designation)

            return designation

        except IntegrityError:
            self.db.rollback()
            raise ValueError("Designation code already exists.")

        except Exception:
            self.db.rollback()
            raise

    def delete_designation(
        self,
        designation_id: UUID,
    ) -> bool:

        designation = self.repository.get_by_id(designation_id)

        if designation is None:
            return False

        try:
            self.repository.delete(designation)
            self.db.commit()

            return True

        except Exception:
            self.db.rollback()
            raise
