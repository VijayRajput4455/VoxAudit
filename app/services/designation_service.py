from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.designation import Designation
from app.repositories.designation_repository import DesignationRepository
from app.schemas.designation import DesignationCreate, DesignationUpdate
from app.services.code_generator import CodeGenerator, CodePrefix


DEFAULT_DESIGNATIONS = [
    # Sales Department Designations
    {
        "name": "Sales Executive",
        "description": "Responsible for managing sales leads, customer acquisition, and outbound sales calls.",
    },
    {
        "name": "Sales Account Executive",
        "description": "Manages key client accounts, product demonstrations, and enterprise deal closures.",
    },
    {
        "name": "Sales Team Lead",
        "description": "Supervises sales representatives, sets targets, and monitors sales call metrics.",
    },
    # Customer Support Department Designations
    {
        "name": "Customer Support Representative",
        "description": "Frontline support representative handling customer calls, technical inquiries, and resolution.",
    },
    {
        "name": "Customer Care Specialist",
        "description": "Senior support specialist managing escalated tickets, VIP clients, and customer satisfaction.",
    },
    {
        "name": "Support QA Auditor",
        "description": "Quality assurance auditor evaluating call quality, compliance, and QA scorecards.",
    },
    # Backend Process Department Designations
    {
        "name": "Backend Operations Associate",
        "description": "Executes back-office processing, document verification, and administrative workflow tasks.",
    },
    {
        "name": "Process Specialist",
        "description": "Handles workflow process quality, exception resolution, and data reconciliation.",
    },
    {
        "name": "Backend Process Manager",
        "description": "Oversees backend operational compliance, workflow optimization, and team performance.",
    },
]


class DesignationService:

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DesignationRepository(db)

    def create_designation(
        self,
        data: DesignationCreate,
    ) -> Designation:

        # Generate unique sequential DESG-XXXXXX code automatically if not specified
        code = data.code
        if not code:
            code = CodeGenerator.generate_code(self.db, CodePrefix.DESIGNATION)
        else:
            existing = self.repository.get_by_code(code)
            if existing:
                raise ValueError(f"Designation code '{code}' already exists.")

        designation = Designation(
            code=code,
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

    def seed_default_designations(self) -> list[Designation]:
        created_designations = []
        all_existing = self.repository.get_all()
        existing_names = {d.name.lower() for d in all_existing}

        for desig_data in DEFAULT_DESIGNATIONS:
            if desig_data["name"].lower() not in existing_names:
                code = CodeGenerator.generate_code(self.db, CodePrefix.DESIGNATION)
                desig = Designation(
                    code=code,
                    name=desig_data["name"],
                    description=desig_data.get("description"),
                    status="ACTIVE",
                )
                desig = self.repository.create(desig)
                created_designations.append(desig)
                existing_names.add(desig_data["name"].lower())

        if created_designations:
            self.db.commit()

        return self.repository.get_all()
