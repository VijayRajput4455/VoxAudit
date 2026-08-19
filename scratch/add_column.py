import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from app.core.database import engine

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE voice_samples ADD COLUMN IF NOT EXISTS error_message VARCHAR(1000);"))
    conn.commit()
    print("[OK] Successfully added 'error_message' column to 'voice_samples' table.")
