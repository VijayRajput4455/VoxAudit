from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class VoiceSample(
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    Base,
):
    __tablename__ = "voice_samples"

    code: Mapped[str | None] = mapped_column(
        String(50),
        unique=True,
        nullable=True,
        index=True,
    )

    employee_id: Mapped[str] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    original_file_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    storage_key: Mapped[str] = mapped_column(
        String(1000),
        unique=True,
        nullable=False,
    )

    audio_format: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    duration_seconds: Mapped[float | None] = mapped_column(
        Numeric(10, 3),
        nullable=True,
    )

    sample_rate: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    channels: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    quality_score: Mapped[float | None] = mapped_column(
        Numeric(5, 4),
        nullable=True,
    )

    embedding_id: Mapped[str | None] = mapped_column(
        String(255),
        unique=True,
        nullable=True,
    )

    embedding_model: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    embedding_dimension: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    model_version: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    sample_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="ENROLLMENT",
    )

    source: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="PENDING",
        index=True,
    )

    error_message: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
    )

    employee = relationship(
        "Employee",
        back_populates="voice_samples",
    )