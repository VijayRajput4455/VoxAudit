import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.database import SessionLocal
from app.services.shift_service import ShiftService


def seed_shifts():
    db = SessionLocal()
    try:
        service = ShiftService(db)
        seeded = service.seed_default_shifts()
        print(f"Successfully seeded {len(seeded)} default shift(s):")
        for s in service.get_shifts():
            print(f"  - {s.code} ({s.name}): {s.start_time} to {s.end_time}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_shifts()
