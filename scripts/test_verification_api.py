import sys
from pathlib import Path

# Add project root directory to python path for standalone execution
sys.path.append(str(Path(__file__).resolve().parents[1]))

from io import BytesIO

from app.core.database import SessionLocal
from app.services.voice.verification_service import VerificationService


def test_verification():
    print("==================================================")
    print("      VoxAudit Speaker Verification Test          ")
    print("==================================================")

    # Use existing audio file 1735404531458927_wZfIxTTu.mp3 if present, or pipeline_sample.wav
    audio_path = Path("1735404531458927_wZfIxTTu.mp3")
    if not audio_path.exists():
        audio_path = Path("scratch/pipeline_sample.wav")

    print(f"[OK] Testing query audio file: '{audio_path}' ({audio_path.stat().st_size} bytes)")

    db = SessionLocal()
    try:
        service = VerificationService(db=db)
        with open(audio_path, "rb") as f:
            result = service.verify_or_identify_speaker(
                file_obj=f,
                original_file_name=audio_path.name,
                threshold=0.70,
            )

        print("\n--------------------------------------------------")
        print("Speaker Verification Result (POST /verify):")
        print(f"  Is Match:            {result['is_match']}")
        print(f"  Confidence Score:    {result['confidence_score']}")
        print(f"  Similarity Score:    {result['similarity_score']}")
        print(f"  Threshold Applied:   {result['threshold_applied']}")
        print(f"  Message:             {result['message']}")
        print(f"  Audio Duration:      {result['audio_duration_seconds']}s")

        if result.get("matched_employee"):
            emp = result["matched_employee"]
            print("\n  Matched Employee Profile:")
            print(f"    Employee ID:   {emp['id']}")
            print(f"    Employee Code: {emp['employee_code']}")
            print(f"    Name:          {emp['first_name']} {emp['last_name']}")
            print(f"    Email:         {emp['email']}")
            print(f"    Voice Sample:  {result['matched_voice_sample_id']}")

        print("--------------------------------------------------\n")
        print("==================================================")
        print("    SPEAKER VERIFICATION TEST COMPLETED!          ")
        print("==================================================")

    finally:
        db.close()


if __name__ == "__main__":
    test_verification()
