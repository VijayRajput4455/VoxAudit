from datetime import date

from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Employee(
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    Base,
):
    __tablename__ = "employees"

    employee_code: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )

    first_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    last_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    father_name: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    date_of_birth: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    date_of_joining: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    email: Mapped[str | None] = mapped_column(
        String(255),
        unique=True,
        nullable=True,
    )

    phone: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    department_id: Mapped[str | None] = mapped_column(
        ForeignKey("departments.id"),
        nullable=True,
        index=True,
    )

    designation_id: Mapped[str | None] = mapped_column(
        ForeignKey("designations.id"),
        nullable=True,
        index=True,
    )

    shift_id: Mapped[str | None] = mapped_column(
        ForeignKey("shifts.id"),
        nullable=True,
        index=True,
    )

    manager_id: Mapped[str | None] = mapped_column(
        ForeignKey("employees.id"),
        nullable=True,
        index=True,
    )

    location: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="ACTIVE",
        index=True,
    )

    department = relationship(
        "Department",
        back_populates="employees",
    )

    designation = relationship("Designation")

    shift = relationship(
        "Shift",
        back_populates="employees",
    )

    manager = relationship(
        "Employee",
        remote_side="Employee.id",
    )

    voice_samples = relationship(
        "VoiceSample",
        back_populates="employee",
        cascade="all, delete-orphan",
    )

    @property
    def name(self) -> str:
        if self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.first_name or ""

    @property
    def joining_date(self) -> date | None:
        return self.date_of_joining