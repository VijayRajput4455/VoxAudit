# VoxAudit

An enterprise-grade, AI-powered voice audit and conversation intelligence platform designed for Customer Care, Technical Support, and Sales teams. VoxAudit automates 100% of call quality assurance (QA) by performing audio ingestion, speaker diarization, voice biometrics identification, speech-to-text transcription, conversation turn alignment, and LLM-powered QA scorecard evaluation.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [End-to-End Data Flow](#end-to-end-data-flow)
- [Repository Structure](#repository-structure)
- [Technology Stack](#technology-stack)
- [AI/ML Pipeline & Models](#aiml-pipeline--models)
  - [1. Speech-to-Text (STT)](#1-speech-to-text-stt)
  - [2. Speaker Diarization](#2-speaker-diarization)
  - [3. Voice Biometrics & Embeddings](#3-voice-biometrics--embeddings)
  - [4. Conversation Reconstruction](#4-conversation-reconstruction)
  - [5. Ollama LLM QA Audit Engine](#5-ollama-llm-qa-audit-engine)
- [Enterprise QA Scorecard Schema (v1.0)](#enterprise-qa-scorecard-schema-v10)
- [Worker Architecture & Message Queues](#worker-architecture--message-queues)
- [Database & Storage Architecture](#database--storage-architecture)
  - [PostgreSQL Database Schema](#postgresql-database-schema)
  - [MinIO Object Storage](#minio-object-storage)
  - [Milvus Vector Database](#milvus-vector-database)
- [Redis Integration Status](#redis-integration-status)
- [Environment Variables](#environment-variables)
- [GPU Acceleration & Configuration](#gpu-acceleration--configuration)
- [API Documentation](#api-documentation)
- [Local Development Setup](#local-development-setup)
- [Docker Deployment](#docker-deployment)
- [Testing & Verification](#testing--verification)
- [Logging & Error Handling](#logging--error-handling)
- [Security & Performance Considerations](#security--performance-considerations)
- [Future Improvements & Roadmap](#future-improvements--roadmap)

---

## Overview

Traditional call center Quality Assurance relies heavily on manual spot-checking, where QA auditors listen to less than **1–2% of total calls**. This approach leads to sampling bias, delayed agent feedback, unflagged compliance risks, and incomplete visibility into customer sentiment.

**VoxAudit** solves this by automating end-to-end call evaluation:
- **100% Coverage**: Every inbound and outbound call is automatically processed and audited.
- **Biometric Identification**: Uses SpeechBrain ECAPA-VoxCeleb voice embeddings stored in Milvus to automatically recognize which employee spoke on the call, distinguishing agents from customers without relying on channel split metadata.
- **Async 2-Stage Pipeline**: Audio processing (STT, diarization, speaker matching) runs asynchronously via RabbitMQ. QA scorecard generation executes as a decoupled Stage 2 worker using local Ollama LLM inference (`qwen3.5:9b` / `llama3`).
- **360° Evaluation**: Analyzes both Agent performance (professional greeting, talk/listen ratio, speech flow, problem resolution, professional closing) and Customer Experience (sentiment trends, frustration levels, customer effort).

---

## Key Features

| Category | Feature | Implementation Status | Description |
| :--- | :--- | :---: | :--- |
| **Audio Processing** | Ingestion & Storage | **Implemented** | Accepts `.wav`, `.mp3`, `.m4a`, `.flac` via FastAPI and stores raw audio in MinIO object storage. |
| **Voice Biometrics** | Sample Enrollment | **Implemented** | Enrolls employee voice samples, extracts 192-dimensional ECAPA embeddings, and stores vectors in Milvus. |
| | Speaker Identification | **Implemented** | Compares audio segment embeddings against Milvus vector collections using cosine similarity. |
| **Speech Processing** | Speech-to-Text | **Implemented** | Transcribes audio turns with word-level timestamps using Faster-Whisper (`medium` model). |
| | Speaker Diarization | **Implemented** | Segments speaker turns (`SPEAKER_00`, `SPEAKER_01`) using Pyannote Audio. |
| | Turn Alignment | **Implemented** | Merges overlapping Whisper word timestamps with Pyannote diarization boundaries. |
| **QA Engine** | Enterprise Schema v1.0 | **Implemented** | Generates standardized JSON evaluations covering call metrics, agent checklist, compliance, and CX signals. |
| | Ollama LLM Integration | **Implemented** | Local LLM evaluation via `qwen3.5:9b` / `llama3` with JSON mode, retries, and HTTP connection pooling. |
| | CX Signals Analytics | **Implemented** | Extracts sentiment trends, frustration levels, issue resolution status, and customer effort scores. |
| | Fallback Safety | **Implemented** | Partial fallback JSON response if LLM service is temporarily offline or cold-starting. |
| **Queue & System** | Async Workers | **Implemented** | Dedicated RabbitMQ workers for Voice Enrollment, Call Audio Processing, and QA Scorecard Audit. |
| | PostgreSQL Auto-Migrate | **Implemented** | Lifespan context manager auto-creates tables and updates schema columns dynamically. |
| **Caching & Auth** | Redis Integration | *Planned / Not Implemented* | Not required in current build; RabbitMQ handles queues, PostgreSQL/Milvus handle state & vectors. |

---

## System Architecture

```mermaid
flowchart TD
    subgraph Client & API Layer
        A[Call Audio / Voice Sample Upload] -->|POST /api/v1/calls| B[VoxAudit FastAPI Engine]
        B -->|Store Audio File| C[(MinIO Object Storage)]
        B -->|Create Job Row| D[(PostgreSQL Database)]
        B -->|Publish Event| E[RabbitMQ Message Broker]
    end

    subgraph Asynchronous Worker Layer
        E -->|voice_enrollment_jobs| F[Voice Enrollment Worker]
        E -->|call_processing_jobs| G[Call Processing Worker]
        E -->|qa_audit_jobs| H[QA Audit Worker]

        F -->|Extract 192d Vector| I[SpeechBrain ECAPA-VoxCeleb]
        I -->|Upsert Vector| J[(Milvus Vector DB)]

        G -->|1. Transcribe| K[Faster-Whisper STT]
        G -->|2. Diarize| L[Pyannote Audio]
        G -->|3. Identify Speaker| J
        G -->|4. Reconstruct Turn| M[Speaker Alignment Service]

        H -->|Fetch Transcript| D
        H -->|Prompt JSON Mode| N[Ollama Local LLM Service]
    end

    subgraph LLM & Storage Layer
        N -->|qwen3.5:9b / llama3| H
        H -->|Update qa_score & qa_scorecard_json| D
        M -->|Save transcript_json| D
    end
```

---

## End-to-End Data Flow

```
1. Audio File Upload (POST /api/v1/calls/upload)
   ├── Validate audio file format (.wav, .mp3, .m4a)
   ├── Stream file to MinIO bucket ('voice-samples')
   ├── Create call_jobs record in PostgreSQL (Status: PENDING)
   └── Publish job message to RabbitMQ exchange ('voxaudit_events', routing_key='call.processing')

2. Stage 1 Processing (Call Processing Worker)
   ├── Fetch audio bytes from MinIO
   ├── Run Pyannote Diarization → Segment speaker turns (SPEAKER_00, SPEAKER_01)
   ├── Run Faster-Whisper STT → Extract words with timestamps
   ├── Run SpeechBrain ECAPA → Extract 192d voice embedding for each speaker
   ├── Query Milvus Vector DB → Match embedding against enrolled employee profiles (Threshold: 0.50)
   ├── Reconstruct speaker-attributed transcript turns
   ├── Save transcript_json to PostgreSQL call_jobs row (Status: COMPLETED)
   └── Return API response with call_id and speaker mappings

3. Stage 2 Audit Processing (POST /api/v1/calls/{call_id}/audit)
   ├── Publish QA job message to RabbitMQ ('qa_audit_jobs', routing_key='call.qa_audit')
   ├── QA Audit Worker consumes job message from RabbitMQ
   ├── Retrieve speaker-attributed transcript from PostgreSQL
   ├── Construct prompt and execute Ollama LLM inference (qwen3.5:9b)
   ├── Parse Enterprise Schema v1.0 JSON scorecard
   └── Persist qa_score and qa_scorecard_json to the SAME PostgreSQL call_jobs record
```

---

## Repository Structure

```
VoxAudit/
├── app/
│   ├── main.py                     # FastAPI application entry point, lifespan, & DB auto-migrations
│   ├── api/
│   │   ├── router.py               # API router aggregator
│   │   └── v1/
│   │       ├── calls.py            # Call upload, audio processing, & QA scorecard endpoints
│   │       ├── employees.py        # Employee CRUD & employee QA summary endpoints
│   │       ├── departments.py      # Department management endpoints
│   │       ├── designations.py     # Designation management endpoints
│   │       ├── shifts.py           # Shift scheduling endpoints
│   │       ├── vectors.py          # Milvus vector inspection & maintenance endpoints
│   │       ├── voice_samples.py    # Voice sample upload & enrollment endpoints
│   │       └── health.py           # System health check endpoint
│   ├── core/
│   │   ├── config.py               # Pydantic BaseSettings environment configuration
│   │   ├── database.py             # SQLAlchemy engine & session factory
│   │   ├── logging.py              # Structured JSON logging configuration
│   │   ├── security.py             # Password hashing & auth helpers
│   │   └── exceptions.py           # Custom exception definitions
│   ├── integrations/
│   │   ├── minio/                  # MinIO S3 object storage client & bucket manager
│   │   ├── milvus/                 # Milvus vector database client & collection repository
│   │   ├── rabbitmq/               # RabbitMQ pika connection manager & publisher factory
│   │   └── ollama/                 # Ollama LLM client with session pooling & retry logic
│   ├── ml/
│   │   └── inference/
│   │       └── speaker_embedding.py# SpeechBrain ECAPA-VoxCeleb 192d embedding extractor
│   ├── models/                     # SQLAlchemy ORM database models
│   │   ├── base.py                 # Base model class with UUID primary keys & timestamps
│   │   ├── call_job.py             # Call jobs table model (transcript, qa_score, qa_scorecard_json)
│   │   ├── employee.py             # Employee profile model
│   │   ├── department.py           # Department model
│   │   ├── designation.py          # Designation model
│   │   ├── shift.py                # Shift model
│   │   └── voice_sample.py         # Voice enrollment sample metadata model
│   ├── schemas/                    # Pydantic validation & serialization schemas
│   │   ├── call_job.py             # Call job & QA scorecard response schemas
│   │   ├── employee.py             # Employee schemas
│   │   ├── department.py           # Department schemas
│   │   ├── designation.py          # Designation schemas
│   │   ├── shift.py                # Shift schemas
│   │   └── voice_sample.py         # Voice sample schemas
│   ├── services/
│   │   ├── analytics/
│   │   │   └── qa_scorecard_service.py # Enterprise Schema v1.0 LLM scorecard generator
│   │   ├── call/
│   │   │   └── call_processor.py   # Multi-stage ML pipeline coordinator
│   │   ├── voice/
│   │   │   └── enrollment_service.py # Voice sample embedding & Milvus vector indexer
│   │   ├── department_service.py   # Department service layer
│   │   ├── designation_service.py  # Designation service layer
│   │   ├── employee_service.py     # Employee service layer
│   │   └── shift_service.py        # Shift service layer
│   └── workers/
│       ├── base.py                 # Base RabbitMQ worker class
│       ├── voice_enrollment_worker.py # Background worker for voice sample vector indexing
│       ├── call_processing_worker.py  # Background worker for Stage 1 audio processing
│       └── qa_audit_worker.py      # Background worker for Stage 2 LLM QA auditing
├── docker/
│   ├── Dockerfile.api              # Dockerfile for main FastAPI API service
│   ├── Dockerfile.call_worker      # Dockerfile for Stage 1 Call Processing Worker
│   ├── Dockerfile.frontend         # Dockerfile for NGINX frontend
│   ├── Dockerfile.qa_worker        # Dockerfile for Stage 2 QA Audit Worker
│   └── Dockerfile.voice_worker     # Dockerfile for Voice Enrollment Worker
├── deploy/
│   └── docker-compose.yml          # Full 11-service Docker Compose infrastructure stack
├── migrations/                     # Database migration assets
├── tests/
│   └── unit/                       # Pytest unit test suites
├── pyproject.toml                  # Project metadata & dependencies
├── requirements.txt                # Python package dependencies list
└── README.md                       # Project technical documentation
```

---

## Technology Stack

- **Core Framework**: Python 3.11 / 3.14, FastAPI, Pydantic v2, SQLAlchemy 2.0
- **Database**: PostgreSQL 16
- **Object Storage**: MinIO (S3-compatible)
- **Message Broker**: RabbitMQ 3 (with Management Plugin)
- **Vector Database**: Milvus v2.4.0 (PyMilvus & Milvus Lite)
- **Speech-to-Text**: Faster-Whisper (`medium` model, CUDA / CTranslate2 backend)
- **Speaker Diarization**: Pyannote Audio (`pyannote/speaker-diarization-community-1`)
- **Voice Embeddings**: SpeechBrain (`speechbrain/spkrec-ecapa-voxceleb`)
- **LLM Engine**: Ollama (`qwen3.5:9b` / `llama3`)
- **Web Server & Containerization**: Docker, Docker Compose, NGINX

---

## AI/ML Pipeline & Models

### 1. Speech-to-Text (STT)
- **Model**: `Faster-Whisper` (`medium` model size)
- **Library**: `faster-whisper>=1.0.0`
- **Function**: Converts audio signals into text with exact word-level start and end timestamps.

### 2. Speaker Diarization
- **Model**: `Pyannote Audio` (`pyannote/speaker-diarization-community-1`)
- **Function**: Separates multi-speaker audio into discrete temporal speaker turns (`SPEAKER_00`, `SPEAKER_01`).

### 3. Voice Biometrics & Embeddings
- **Model**: `SpeechBrain` (`speechbrain/spkrec-ecapa-voxceleb`)
- **Dimensions**: 192-dimensional vector embedding per audio segment.
- **Matching Metric**: Cosine similarity against Milvus vector collection (`voice_embeddings`).
- **Identification Threshold**: `0.50` cosine similarity cutoff.

### 4. Conversation Reconstruction
- Combines Whisper word timestamps with Pyannote speaker segment bounds.
- Maps recognized voice vectors to enrolled Employee profiles (e.g. `Vijay Rajput`).
- Unrecognized speakers default to `Customer`.

### 5. Ollama LLM QA Audit Engine
- **Model**: `qwen3.5:9b` (or `llama3`) via Ollama local API (`http://localhost:11434`).
- **Format**: JSON mode (`format="json"`) with `"options": {"num_predict": 1024, "temperature": 0.1}`.
- **Reliability**:
  - Connection pooling via `requests.Session()`.
  - Automatic 3-attempt retry logic with backoff for cold starts.
  - Transcript safety capping (max 6,000 characters) for fast inference.

---

## Enterprise QA Scorecard Schema (v1.0)

VoxAudit standardizes all QA outputs into **Enterprise Schema v1.0**:

```json
{
  "schema_version": "1.0",
  "evaluation_status": "complete",

  "call": {
    "call_id": "e6cf5a4e-4924-42e0-a0d3-e8bf30147397",
    "duration_seconds": 303.03,
    "agent_speaker": "Vijay Rajput",
    "customer_speaker": "Customer"
  },

  "conversation_metrics": {
    "agent_talk_time_seconds": 235.49,
    "customer_talk_time_seconds": 67.54,
    "agent_talk_ratio_percentage": 77.7,
    "customer_talk_ratio_percentage": 22.3,
    "talk_listen_ratio": {
      "target_agent_ratio": { "min_percentage": 40.0, "max_percentage": 65.0 },
      "status": "above_target",
      "score": 15.0,
      "max_score": 25.0
    },
    "turn_count": 12,
    "interruptions": 0,
    "silence_duration_seconds": 0.0,
    "average_response_time_seconds": 1.5
  },

  "agent_evaluation": {
    "professional_greeting": { "status": "evaluated", "score": 10.0, "max_score": 10.0, "passed": true, "evidence": [], "reason": "Greets customer warmly." },
    "problem_understanding": { "status": "evaluated", "score": 15.0, "max_score": 15.0, "passed": true, "evidence": [], "reason": "Clarified issue." },
    "empathy": { "status": "evaluated", "score": 12.0, "max_score": 15.0, "passed": true, "evidence": [], "reason": "Acknowledged issue." },
    "communication": { "status": "evaluated", "score": 10.0, "max_score": 10.0, "passed": true, "evidence": [], "reason": "Clear explanation." },
    "professionalism": { "status": "evaluated", "score": 10.0, "max_score": 10.0, "passed": true, "evidence": [], "reason": "Polite throughout." },
    "resolution": { "status": "evaluated", "score": 20.0, "max_score": 20.0, "passed": true, "resolution_status": "Resolved", "evidence": [], "reason": "Issue solved." },
    "professional_closing": { "status": "evaluated", "score": 5.0, "max_score": 5.0, "passed": true, "evidence": [], "reason": "Thanks customer." }
  },

  "customer_experience": {
    "sentiment": { "initial": "Neutral", "middle": "Neutral", "final": "Positive", "trend": "improving", "confidence": 0.95 },
    "frustration": { "initial": "Low", "final": "Low", "trend": "stable", "confidence": 0.90 },
    "satisfaction": { "level": "Satisfied", "confidence": 0.95 },
    "issue_resolution": { "status": "Resolved", "confidence": 0.95, "evidence": [] },
    "customer_effort": { "level": "Low effort", "confidence": 0.88, "reason": "One-call resolution." }
  },

  "compliance": {
    "status": "evaluated",
    "score": 10.0,
    "max_score": 10.0,
    "passed": true,
    "checks": ["Standard Disclosure"],
    "violations": [],
    "flagged_keywords": [],
    "evidence": []
  },

  "overall_evaluation": {
    "score": 88.0,
    "max_score": 100.0,
    "confidence": 0.94,
    "grade": "A"
  },

  "insights": {
    "strengths": ["Clear communication", "Empathetic tone"],
    "weaknesses": ["Talk ratio slightly high"],
    "action_items": ["Send confirmation receipt"]
  },

  "evaluation_error": {
    "has_error": false,
    "code": null,
    "service": "ollama",
    "message": null,
    "retryable": false
  }
}
```

---

## Worker Architecture & Message Queues

VoxAudit uses RabbitMQ for event-driven asynchronous processing across 3 dedicated workers:

| Worker Module | Queue Name | Routing Key | Purpose |
| :--- | :--- | :--- | :--- |
| [`voice_enrollment_worker.py`](file:///c:/Users/VIJAY/Desktop/GitHub/VoxAudit/app/workers/voice_enrollment_worker.py) | `voice_enrollment_jobs` | `voice.enrollment` | Computes ECAPA 192d embeddings from voice samples and indexes vectors into Milvus. |
| [`call_processing_worker.py`](file:///c:/Users/VIJAY/Desktop/GitHub/VoxAudit/app/workers/call_processing_worker.py) | `call_processing_jobs` | `call.processing` | Runs Stage 1 heavy audio ML pipeline (Faster-Whisper + Pyannote + Milvus speaker matching). |
| [`qa_audit_worker.py`](file:///c:/Users/VIJAY/Desktop/GitHub/VoxAudit/app/workers/qa_audit_worker.py) | `qa_audit_jobs` | `call.qa_audit` | Runs Stage 2 LLM QA audit via Ollama and updates PostgreSQL `call_jobs` table. |

---

## Database & Storage Architecture

### PostgreSQL Database Schema
- **`employees`**: Employee master profile (ID, name, email, department, designation, shift).
- **`departments`**: Organizational department records.
- **`designations`**: Job title and role definitions.
- **`shifts`**: Employee work shift schedules.
- **`voice_samples`**: Audio enrollment sample metadata and indexing status.
- **`call_jobs`**: Core call processing records:
  - `id` (`UUID`): Call job unique identifier.
  - `status` (`VARCHAR`): `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`.
  - `duration_seconds` (`FLOAT`): Total call audio duration.
  - `transcript_json` (`JSON`): Speaker-attributed conversation turns and speaker mappings.
  - `qa_score` (`FLOAT`, Indexed): Overall 100-point QA evaluation score.
  - `qa_scorecard_json` (`JSON`): Full Enterprise Schema v1.0 QA evaluation report.

### MinIO Object Storage
- **Bucket**: `voice-samples`
- **Objects**: Raw uploaded audio files stored by UUID key (e.g. `calls/{call_id}.wav`).

### Milvus Vector Database
- **Collection Name**: `voice_embeddings`
- **Metric Type**: Cosine similarity (`COSINE`)
- **Index Type**: `HNSW` (High-Dimensional Nearest Neighbor Search)
- **Fields**: `vector_id`, `embedding` (192d float vector), `employee_id`, `voice_sample_id`.

---

## Redis Integration Status

- **Current Status**: **Planned / Not currently implemented**
- **Explanation**: VoxAudit currently uses **RabbitMQ** for message queuing, **PostgreSQL** for job state tracking, and **Milvus** for vector caching. Redis is not required to run VoxAudit in development or production.
- **Future Use Case**: Redis will be added for API rate-limiting and real-time WebSocket session caching in future releases.

---

## Environment Variables

Copy `.env.example` to `.env` in the root directory:

```ini
APP_NAME=VoxAudit
APP_VERSION=0.1.0
ENVIRONMENT=development
DEBUG=true

# PostgreSQL Database Connection
DATABASE_URL=postgresql+psycopg2://voxaudit:voxaudit_password@localhost:5432/voxaudit

# Object Storage (MinIO)
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_SECURE=false
MINIO_BUCKET=voice-samples

# Message Broker (RabbitMQ)
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_VHOST=/
RABBITMQ_CALL_QUEUE=call_processing_jobs
RABBITMQ_CALL_ROUTING_KEY=call.processing
RABBITMQ_QA_QUEUE=qa_audit_jobs
RABBITMQ_QA_ROUTING_KEY=call.qa_audit

# Vector Database (Milvus)
MILVUS_HOST=localhost
MILVUS_PORT=19530

# Ollama LLM Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3.5:9b
OLLAMA_TIMEOUT_SECONDS=600.0

# PyTorch / Audio ML Device
EMBEDDING_DEVICE=auto
EMBEDDING_MODEL=speechbrain/spkrec-ecapa-voxceleb
```

---

## GPU Acceleration & Configuration

VoxAudit utilizes GPU acceleration for Faster-Whisper, Pyannote Audio, and Ollama LLM inference.

### 1. Windows GPU Environment Setup
If running locally on Windows with an NVIDIA GPU (e.g. NVIDIA GeForce RTX 3050):

```powershell
# Set CUDA device and force Ollama GPU offloading
[System.Environment]::SetEnvironmentVariable('CUDA_VISIBLE_DEVICES', '0', 'User')
[System.Environment]::SetEnvironmentVariable('OLLAMA_NUM_GPU', '99', 'User')
```

### 2. Docker GPU Reservation
In [`deploy/docker-compose.yml`](file:///c:/Users/VIJAY/Desktop/GitHub/VoxAudit/deploy/docker-compose.yml), GPU reservations are enabled for `call-worker`, `voice-worker`, and `ollama`:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

---

## API Documentation

Once the server is running, interactive Swagger API documentation is available at:
`http://localhost:8000/docs`

### Key API Endpoints

#### 1. Calls & QA Scorecards
- `POST /api/v1/calls/upload` - Upload audio call recording for Stage 1 processing.
- `POST /api/v1/calls/{call_id}/audit` - Queue Stage 2 async QA scorecard audit job.
- `GET /api/v1/calls/{call_id}` - Retrieve call job status, transcript, and QA score.
- `GET /api/v1/calls/{call_id}/scorecard` - Retrieve Enterprise Schema v1.0 QA scorecard payload.
- `GET /api/v1/calls` - List call jobs with optional filtering by employee or QA score.

#### 2. Employees & Voice Enrollment
- `POST /api/v1/employees` - Register a new employee.
- `POST /api/v1/voice-samples/upload` - Upload voice sample for biometrics enrollment.
- `GET /api/v1/employees/{employee_id}/scorecard-summary` - Get aggregated QA scorecard summary for an employee.

#### 3. Infrastructure & Vectors
- `GET /api/v1/health` - Check health status of PostgreSQL, MinIO, RabbitMQ, and Milvus.
- `GET /api/v1/vectors/count` - Count indexed voice embeddings in Milvus.

---

## Local Development Setup

### Prerequisites
- Python 3.11 (or conda environment `voxaudit`)
- Docker & Docker Compose (for running infrastructure services)

---

### Step 1: Launch Infrastructure Services via Docker

To run VoxAudit locally while developing, start the backend infrastructure dependencies (**PostgreSQL**, **MinIO**, **RabbitMQ**, **Etcd**, **Milvus**, and **Ollama**) in Docker with a single command:

```bash
docker-compose -f deploy/docker-compose.yml up -d postgres minio rabbitmq etcd milvus ollama
```

Download the `qwen3.5:9b` LLM model inside the Docker Ollama instance:
```bash
docker exec -it voxaudit-ollama ollama pull qwen3.5:9b
```

---

### Step 2: Python Application Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/VijayRajput4455/VoxAudit.git
   cd VoxAudit
   ```

2. **Activate Python Virtual Environment**:
   ```bash
   conda activate voxaudit
   # or: source venv/bin/activate
   ```

3. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Start Main API Server**:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

5. **Start Background Workers**:
   ```bash
   # Terminal 1: Call Processing Worker (Stage 1 Audio ML Pipeline)
   python -m app.workers.call_processing_worker

   # Terminal 2: QA Audit Worker (Stage 2 LLM QA Scorecard Engine)
   python -m app.workers.qa_audit_worker

   # Terminal 3: Voice Enrollment Worker (Biometric Vector Indexing)
   python -m app.workers.voice_enrollment_worker
   ```


---

## Docker Deployment

To launch the complete VoxAudit 11-service production infrastructure stack (PostgreSQL, MinIO, RabbitMQ, Etcd, Milvus, API, NGINX Frontend, Voice Worker, Call Worker, Ollama, QA Worker):

```bash
docker-compose -f deploy/docker-compose.yml up -d --build
```

To pull the Qwen 3.5 model inside the Docker Ollama container:
```bash
docker exec -it voxaudit-ollama ollama pull qwen3.5:9b
```

To view logs for any service:
```bash
docker logs -f voxaudit-qa-worker
docker logs -f voxaudit-api
```

---

## Testing & Verification

VoxAudit includes Pytest unit test suites covering the QA Scorecard Service and QA Audit Worker:

```bash
pytest tests/unit/services/test_qa_scorecard.py tests/unit/workers/test_qa_audit_worker.py
```

---

## Logging & Observability (Grafana + Loki)

VoxAudit includes a pre-configured, production-ready observability and log aggregation stack:

- **Structured JSON Logging**: Standardized log records formatted with timestamps, log level, service name, environment, request correlation IDs, module names, and exception tracebacks ([`app/core/logging.py`](file:///c:/Users/VIJAY/Desktop/GitHub/VoxAudit/app/core/logging.py)).
- **Loki Engine** (Port `3100`): Ingests and indexes structured JSON log streams from file logs and Docker containers.
- **Promtail Shipper**: Scrapes `logs/voxaudit.log` and microservice containers, automatically parsing JSON fields into indexed labels (`level`, `service`, `module`, `request_id`).
- **Grafana Dashboard** (Port `3000`): Pre-provisioned enterprise dashboard available at `http://localhost:3000`:
  - **Credentials**: Username `admin` / Password `admin`
  - **Live Ingestion & Volume Rate**: Real-time stacked time-series chart of logs by severity level (`INFO`, `WARNING`, `ERROR`, `CRITICAL`).
  - **Health KPIs**: Live counters for Ingested Logs, Errors, Warnings, and Critical Events.
  - **Error Center**: Dedicated panel streaming only errors with full stack traces.
  - **Interactive Search**: Filter logs by service dropdown, severity level, or free-text / Request ID search.

```bash
# Launch full observability stack alongside backend infrastructure
docker compose -f deploy/docker-compose.yml up -d loki promtail grafana
```


---

## Security & Performance Considerations

- **Credential Protection**: Sensitive API keys and tokens are loaded strictly via environment variables (`.env`). Hardcoded secret keys are rejected by secret scanning.
- **Connection Pooling**: `requests.Session()` is used in `OllamaClient` to enable HTTP Keep-Alive connection reuse across LLM evaluations.
- **Singleton Pattern**: Core integration factories (`get_ollama_client()`, `get_rabbitmq_publisher()`) use `@lru_cache` to eliminate redundant connection setup overhead.

---

## Future Improvements & Roadmap

- [ ] **Redis Caching Layer**: Add Redis for API rate limiting and response caching.
- [ ] **Real-Time Streaming QA**: Support WebSocket streaming transcription and real-time agent assist prompts.
- [ ] **Multi-Model Support**: Add cloud fallback options (Claude, OpenAI) alongside local Ollama inference.
- [ ] **Advanced Compliance Rule Builder**: Visual UI for defining custom compliance regex rules per department.

---

## License

This project is licensed under the MIT License.