import sys
from pathlib import Path

# Add project root directory to python path for standalone execution
sys.path.append(str(Path(__file__).resolve().parents[1]))

from io import BytesIO
from uuid import uuid4

from app.core.database import SessionLocal
from app.models.employee import Employee
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.voice_sample_repository import VoiceSampleRepository
from app.services.voice.enrollment_service import EnrollmentService
from app.workers.voice_enrollment_worker import VoiceEnrollmentWorker
from scripts.test_embedding import create_sample_wav


def run_pipeline_test():
    print("==================================================")
    print("    VoxAudit Asynchronous Enrollment Pipeline Test ")
    print("==================================================")

    db = SessionLocal()

    try:
        # 1. Seed or retrieve test employee
        emp_repo = EmployeeRepository(db)
        test_emp_code = f"EMP_{uuid4().hex[:6].upper()}"

        from datetime import date
        employee = Employee(
            id=str(uuid4()),
            employee_code=test_emp_code,
            first_name="Pipeline",
            last_name="Tester",
            email=f"tester_{test_emp_code.lower()}@voxaudit.io",
            date_of_joining=date.today(),
        )
        emp_repo.create(employee)
        db.commit()
        print(f"[OK] Created test employee: {employee.first_name} {employee.last_name} (Code: {employee.employee_code})")

        # 2. Generate 3.0 second sample audio
        wav_path = create_sample_wav("scratch/pipeline_sample.wav", duration_seconds=3.0)
        audio_bytes = wav_path.read_bytes()
        print(f"[OK] Created test WAV file: '{wav_path}' ({len(audio_bytes)} bytes)")

        # 3. Call EnrollmentService (Simulates FastAPI Request)
        enrollment_service = EnrollmentService(db=db)
        sample = enrollment_service.enroll_voice_sample(
            employee_id=employee.id,
            file_obj=BytesIO(audio_bytes),
            original_file_name="pipeline_sample.wav",
            file_size=len(audio_bytes),
            content_type="audio/wav",
        )

        print("\n--------------------------------------------------")
        print("API Response (202 Accepted):")
        print(f"Sample ID:   {sample.id}")
        print(f"Employee ID: {sample.employee_id}")
        print(f"Status:      {sample.status} (Immediate response)")
        print(f"Storage Key: {sample.storage_key}")
        print("--------------------------------------------------\n")

        assert sample.status == "PENDING", "Initial status must be PENDING!"

        # 4. Simulate VoiceEnrollmentWorker processing job from RabbitMQ
        worker = VoiceEnrollmentWorker(db=db)
        job_payload = {
            "event": "VOICE_EMBEDDING_GENERATION",
            "job_id": str(uuid4()),
            "voice_sample_id": str(sample.id),
            "employee_id": str(employee.id),
            "storage_bucket": "voice-samples",
            "storage_key": sample.storage_key,
            "attempt": 1,
        }

        print("[OK] Simulating worker consuming RabbitMQ job...")
        success = worker.process_job(job_payload)
        assert success is True, "Worker processing must succeed!"

        # 5. Verify Database record updated to ACTIVE
        sample_repo = VoiceSampleRepository(db)
        updated_sample = sample_repo.get_by_id(sample.id)

        print("\n--------------------------------------------------")
        print("Final VoiceSample Record (Postgres):")
        print(f"Sample ID:   {updated_sample.id}")
        print(f"Status:      {updated_sample.status}")
        print(f"Embedding ID:{updated_sample.embedding_id}")
        print(f"Model:       {updated_sample.embedding_model}")
        print(f"Dimension:   {updated_sample.embedding_dimension}")
        print(f"Duration:    {updated_sample.duration_seconds}s")
        print(f"Quality:     {updated_sample.quality_score}")
        print("--------------------------------------------------\n")

        assert updated_sample.status == "ACTIVE", "Final status must be ACTIVE!"
        assert updated_sample.embedding_id is not None, "Embedding ID must be populated!"
        assert updated_sample.embedding_dimension == 192, "Dimension must be 192!"

        print("==================================================")
        print("   ALL PIPELINE TESTS PASSED SUCCESSFULLY!        ")
        print("==================================================")

    finally:
        db.close()


if __name__ == "__main__":
    run_pipeline_test()
