# VoxAudit
VoxAudit is an AI-powered voice audit platform for Customer Care and Sales teams. It automatically transcribes calls, separates speakers, identifies known employees using voice embeddings, and analyzes conversations for quality, compliance, and agent performance.

ai-voice-intelligence/
│
├── app/
│   ├── main.py
│   │
│   ├── core/
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── security.py
│   │   ├── logging.py
│   │   ├── exceptions.py
│   │   └── constants.py
│   │
│   ├── api/
│   │   ├── router.py
│   │   │
│   │   └── v1/
│   │       ├── employees.py
│   │       ├── departments.py
│   │       ├── designations.py
│   │       ├── shifts.py
│   │       ├── voice_samples.py
│   │       ├── calls.py
│   │       ├── transcripts.py
│   │       └── health.py
│   │
│   ├── schemas/
│   │   ├── employee.py
│   │   ├── department.py
│   │   ├── designation.py
│   │   ├── shift.py
│   │   ├── voice_sample.py
│   │   ├── call.py
│   │   ├── transcript.py
│   │   └── common.py
│   │
│   ├── models/
│   │   ├── base.py
│   │   ├── employee.py
│   │   ├── department.py
│   │   ├── designation.py
│   │   ├── shift.py
│   │   ├── voice_sample.py
│   │   ├── call.py
│   │   ├── speaker_segment.py
│   │   ├── transcript.py
│   │   └── processing_job.py
│   │
│   ├── repositories/
│   │   ├── employee_repository.py
│   │   ├── department_repository.py
│   │   ├── designation_repository.py
│   │   ├── shift_repository.py
│   │   ├── voice_sample_repository.py
│   │   ├── call_repository.py
│   │   └── processing_job_repository.py
│   │
│   ├── services/
│   │   ├── employee_service.py
│   │   ├── department_service.py
│   │   ├── designation_service.py
│   │   ├── shift_service.py
│   │   │
│   │   ├── voice/
│   │   │   ├── enrollment_service.py
│   │   │   ├── identification_service.py
│   │   │   ├── embedding_service.py
│   │   │   ├── quality_service.py
│   │   │   └── similarity_service.py
│   │   │
│   │   ├── speech/
│   │   │   ├── transcription_service.py
│   │   │   ├── diarization_service.py
│   │   │   └── alignment_service.py
│   │   │
│   │   ├── calls/
│   │   │   ├── call_service.py
│   │   │   └── processing_service.py
│   │   │
│   │   └── analytics/
│   │       ├── sentiment_service.py
│   │       ├── call_quality_service.py
│   │       └── talk_ratio_service.py
│   │
│   ├── integrations/
│   │   ├── minio/
│   │   │   ├── client.py
│   │   │   └── storage.py
│   │   │
│   │   ├── milvus/
│   │   │   ├── client.py
│   │   │   ├── collection.py
│   │   │   └── repository.py
│   │   │
│   │   ├── rabbitmq/
│   │   │   ├── connection.py
│   │   │   ├── publisher.py
│   │   │   └── consumer.py
│   │   │
│   │   └── redis/
│   │       └── client.py
│   │
│   ├── workers/
│   │   ├── base.py
│   │   ├── voice_enrollment_worker.py
│   │   ├── transcription_worker.py
│   │   ├── diarization_worker.py
│   │   ├── speaker_identification_worker.py
│   │   └── call_processing_worker.py
│   │
│   ├── ml/
│   │   ├── models/
│   │   │   ├── ecapa.py
│   │   │   ├── whisper.py
│   │   │   └── pyannote.py
│   │   │
│   │   ├── preprocessing/
│   │   │   ├── audio.py
│   │   │   ├── vad.py
│   │   │   └── quality.py
│   │   │
│   │   └── inference/
│   │       ├── speaker_embedding.py
│   │       ├── transcription.py
│   │       └── diarization.py
│   │
│   └── utils/
│       ├── audio.py
│       ├── hashing.py
│       ├── timestamps.py
│       └── validators.py
│
├── migrations/
│   └── alembic/
│       ├── versions/
│       ├── env.py
│       └── script.py.mako
│
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   ├── repositories/
│   │   └── ml/
│   │
│   ├── integration/
│   │   ├── test_postgres.py
│   │   ├── test_minio.py
│   │   └── test_milvus.py
│   │
│   └── api/
│       ├── test_employees.py
│       ├── test_voice_samples.py
│       └── test_calls.py
│
├── scripts/
│   ├── create_milvus_collection.py
│   ├── seed_departments.py
│   ├── seed_designations.py
│   └── seed_shifts.py
│
├── docker/
│   ├── api/
│   │   └── Dockerfile
│   ├── worker/
│   │   └── Dockerfile
│   └── nginx/
│       └── nginx.conf
│
├── deploy/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── prometheus.yml
│
├── .env
├── .env.example
├── .gitignore
├── .dockerignore
├── alembic.ini
├── pyproject.toml
├── README.md
└── Makefile