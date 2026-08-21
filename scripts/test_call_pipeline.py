import sys
from pathlib import Path

# Add project root directory to python path for standalone execution
sys.path.append(str(Path(__file__).resolve().parents[1]))

from io import BytesIO
from uuid import uuid4

from app.core.database import SessionLocal
from app.services.call.call_service import CallService
from app.workers.call_processing_worker import CallProcessingWorker


def test_call_pipeline():
    print("==================================================", flush=True)
    print("   VoxAudit Customer Support Call Pipeline Test   ", flush=True)
    print("==================================================", flush=True)

    audio_path = Path("1735404531458927_wZfIxTTu.mp3")
    if not audio_path.exists():
        audio_path = Path("scratch/pipeline_sample.wav")

    print(f"[OK] Test audio call file: '{audio_path}' ({audio_path.stat().st_size} bytes)", flush=True)

    db = SessionLocal()
    try:
        # 1. Submit Call Job (Simulates POST /api/v1/calls/process API request)
        call_service = CallService(db=db)
        with open(audio_path, "rb") as file_obj:
            call_job = call_service.submit_call_job(
                file_obj=file_obj,
                original_file_name=audio_path.name,
                file_size=audio_path.stat().st_size,
                content_type="audio/mpeg" if audio_path.suffix == ".mp3" else "audio/wav",
            )

        print("\n--------------------------------------------------")
        print("Call Submission API Response (HTTP 202 Accepted):")
        print(f"  Call ID:     {call_job.id}")
        print(f"  Status:      {call_job.status} (Immediate 202 Accepted response)")
        print(f"  Storage Key: {call_job.storage_key}")
        print("--------------------------------------------------\n")

        # 2. Simulate CallProcessingWorker consuming job from RabbitMQ
        worker = CallProcessingWorker(db=db)
        job_payload = {
            "event": "CALL_PROCESSING",
            "job_id": str(uuid4()),
            "call_id": str(call_job.id),
            "storage_bucket": "voice-samples",
            "storage_key": call_job.storage_key,
            "attempt": 1,
        }

        print("[OK] Processing call job with CallProcessingWorker (Whisper + Pyannote + ECAPA + Milvus)...")
        success = worker.process_job(job_payload)
        assert success is True, "Call processing worker must succeed!"

        # 3. Retrieve final CallJob record from PostgreSQL
        db.refresh(call_job)

        print("\n--------------------------------------------------")
        print("Final Call Job Audit Record (PostgreSQL & Milvus):")
        print(f"  Call ID:           {call_job.id}")
        print(f"  Status:            {call_job.status}")
        print(f"  Duration:          {call_job.duration_seconds}s")
        print(f"  Detected Language: {call_job.detected_language}")
        print(f"  Speakers Count:    {call_job.speakers_count}")
        print(f"  Matched Employee:  {call_job.identified_employee_id}")

        if call_job.transcript_json:
            print("\n  Speaker Mappings:")
            mappings = call_job.transcript_json.get("speaker_mappings", {})
            for speaker, name in mappings.items():
                print(f"    {speaker} -> {name}")

            print("\n  Speaker-Attributed Conversation Transcript:")
            turns = call_job.transcript_json.get("turns", [])
            for turn in turns[:5]:  # Display first 5 turns
                print(f"    [{turn['start']}s -> {turn['end']}s] {turn['speaker_name']}: {turn['text']}")
            if len(turns) > 5:
                print(f"    ... (+{len(turns) - 5} more turns)")

        print("--------------------------------------------------\n")
        print("==================================================")
        print("  CALL PROCESSING PIPELINE TEST COMPLETED!       ")
        print("==================================================")

    finally:
        db.close()


if __name__ == "__main__":
    test_call_pipeline()
