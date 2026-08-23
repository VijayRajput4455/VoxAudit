from enum import Enum
import re
from typing import Union

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models.entity_sequence import EntitySequence

logger = get_logger(__name__)


class CodePrefix(str, Enum):
    """Supported entity code prefixes for VoxAudit system."""

    DEPARTMENT = "DEPT"
    EMPLOYEE = "AGNT"
    CALL = "CALL"
    AUDIT = "AUDT"
    DESIGNATION = "DESG"
    SHIFT = "SHFT"
    VOICE_SAMPLE = "VOIC"


class CodeGenerator:
    """Production-grade centralized code generator & identifier service.
    
    Generates sequential, unique, entity-prefixed codes in format:
    <ENTITY_PREFIX>-<6_DIGIT_SEQUENCE> (e.g. DEPT-000001, AGNT-000001, CALL-000001)
    
    Thread-safe and concurrency-safe using database row-level locking.
    """

    # Mapping of entity prefix to table name & code column for initial fallback detection
    _PREFIX_TABLE_MAPPING = {
        "DEPT": ("departments", "code"),
        "AGNT": ("employees", "employee_code"),
        "CALL": ("call_jobs", "code"),
        "AUDT": ("call_jobs", "audit_code"),
        "DESG": ("designations", "code"),
        "SHFT": ("shifts", "code"),
        "VOIC": ("voice_samples", "code"),
    }

    @classmethod
    def _get_max_existing_sequence(cls, db: Session, prefix_str: str) -> int:
        """Inspects target table to find highest existing sequence number if sequence table is uninitialized."""
        table_info = cls._PREFIX_TABLE_MAPPING.get(prefix_str)
        if not table_info:
            return 0

        table_name, col_name = table_info
        try:
            # Query existing codes matching prefix pattern PREFIX-%
            stmt = text(f"SELECT {col_name} FROM {table_name} WHERE {col_name} LIKE :pattern")
            rows = db.execute(stmt, {"pattern": f"{prefix_str}-%"}).scalars().all()
            
            max_seq = 0
            pattern = re.compile(rf"^{prefix_str}-(\d+)$")
            for code in rows:
                if code:
                    match = pattern.match(str(code))
                    if match:
                        num = int(match.group(1))
                        if num > max_seq:
                            max_seq = num
            return max_seq
        except Exception as exc:
            logger.warning(f"Fallback sequence query failed for '{prefix_str}': {str(exc)}")
            return 0

    @classmethod
    def generate_code(
        cls,
        db: Session,
        prefix: Union[CodePrefix, str],
        commit_immediately: bool = False,
    ) -> str:
        """Generates the next sequential code for the specified entity prefix.
        
        Args:
            db: Active SQLAlchemy database session.
            prefix: CodePrefix Enum or string (e.g. DEPT, AGNT, CALL, AUDT).
            commit_immediately: If True, commits the sequence update immediately.
                                If False, leaves transaction in caller's scope.
                                
        Returns:
            Formatted code string (e.g., 'DEPT-000001')
        """
        prefix_str = prefix.value if isinstance(prefix, CodePrefix) else str(prefix).upper().strip()

        # Row-level lock on entity_sequences table for this prefix
        seq_record = db.execute(
            select(EntitySequence)
            .where(EntitySequence.prefix == prefix_str)
            .with_for_update()
        ).scalar_one_or_none()

        if seq_record is None:
            # First time initialization for this prefix: detect max existing number in DB
            max_existing = cls._get_max_existing_sequence(db, prefix_str)
            seq_record = EntitySequence(prefix=prefix_str, current_val=max_existing)
            db.add(seq_record)
            db.flush()

        # Increment sequence atomically
        seq_record.current_val += 1
        new_val = seq_record.current_val

        if commit_immediately:
            try:
                db.commit()
            except Exception:
                db.rollback()
                raise

        code = f"{prefix_str}-{new_val:06d}"
        logger.debug(f"Generated entity code: {code}")
        return code
