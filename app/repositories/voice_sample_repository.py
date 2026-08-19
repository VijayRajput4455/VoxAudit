from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.voice_sample import VoiceSample


class VoiceSampleRepository:

    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        voice_sample: VoiceSample,
    ) -> VoiceSample:
        self.db.add(voice_sample)
        self.db.flush()
        self.db.refresh(voice_sample)

        return voice_sample

    def get_by_id(
        self,
        voice_sample_id: UUID,
    ) -> VoiceSample | None:
        statement = select(VoiceSample).where(
            VoiceSample.id == voice_sample_id
        )

        return self.db.scalar(statement)

    def get_by_employee_id(
        self,
        employee_id: UUID,
    ) -> list[VoiceSample]:
        statement = (
            select(VoiceSample)
            .where(
                VoiceSample.employee_id == employee_id
            )
            .order_by(VoiceSample.created_at.desc())
        )

        return list(
            self.db.scalars(statement).all()
        )

    def get_by_embedding_id(
        self,
        embedding_id: str,
    ) -> VoiceSample | None:
        statement = select(VoiceSample).where(
            VoiceSample.embedding_id == embedding_id
        )

        return self.db.scalar(statement)

    def get_by_storage_key(
        self,
        storage_key: str,
    ) -> VoiceSample | None:
        statement = select(VoiceSample).where(
            VoiceSample.storage_key == storage_key
        )

        return self.db.scalar(statement)

    def update(
        self,
        voice_sample: VoiceSample,
    ) -> VoiceSample:
        self.db.flush()
        self.db.refresh(voice_sample)

        return voice_sample

    def delete(
        self,
        voice_sample: VoiceSample,
    ) -> None:
        self.db.delete(voice_sample)
        self.db.flush()