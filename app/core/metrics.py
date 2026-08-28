"""VoxAudit Prometheus Telemetry & Performance Metrics Engine."""

import time
from typing import Optional
from prometheus_client import Counter, Gauge, Histogram

# -----------------------------------------------------------------------------
# 1. HTTP & API Performance Metrics
# -----------------------------------------------------------------------------
HTTP_REQUESTS_TOTAL = Counter(
    "voxaudit_http_requests_total",
    "Total count of incoming HTTP requests to VoxAudit API",
    ["method", "endpoint", "status_code"],
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "voxaudit_http_request_duration_seconds",
    "HTTP Request Latency in seconds",
    ["method", "endpoint"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0),
)

CALLS_UPLOADED_TOTAL = Counter(
    "voxaudit_calls_uploaded_total",
    "Total count of audio call recordings uploaded for processing",
    ["audio_format"],
)

# -----------------------------------------------------------------------------
# 2. AI / ML Audio & LLM Pipeline Telemetry
# -----------------------------------------------------------------------------
ML_STAGE_DURATION_SECONDS = Histogram(
    "voxaudit_ml_stage_duration_seconds",
    "Execution duration for AI/ML pipeline stages in seconds",
    ["stage"],  # 'whisper', 'diarization', 'embedding', 'qa_audit'
    buckets=(0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 20.0, 45.0, 60.0, 120.0, 300.0),
)

ML_REAL_TIME_FACTOR = Gauge(
    "voxaudit_ml_real_time_factor",
    "Real-Time Factor (RTF = Processing Time / Audio Duration) for speech processing",
    ["model"],
)

OLLAMA_TOKENS_PER_SECOND = Gauge(
    "voxaudit_ollama_tokens_per_second",
    "Ollama LLM token generation speed (eval tokens per second)",
    ["model"],
)

# -----------------------------------------------------------------------------
# 3. GPU & Hardware Infrastructure Telemetry
# -----------------------------------------------------------------------------
GPU_MEMORY_USED_BYTES = Gauge(
    "voxaudit_gpu_memory_used_bytes",
    "Current GPU VRAM memory allocated by PyTorch (bytes)",
    ["device"],
)

GPU_MEMORY_TOTAL_BYTES = Gauge(
    "voxaudit_gpu_memory_total_bytes",
    "Total GPU VRAM memory capacity (bytes)",
    ["device"],
)

GPU_UTILIZATION_PERCENT = Gauge(
    "voxaudit_gpu_utilization_percent",
    "GPU VRAM allocation percentage",
    ["device"],
)

SYSTEM_CPU_PERCENT = Gauge(
    "voxaudit_system_cpu_percent",
    "System host/container CPU utilization percentage",
)

SYSTEM_MEMORY_USED_BYTES = Gauge(
    "voxaudit_system_memory_used_bytes",
    "System host/container RAM memory used (bytes)",
)

SYSTEM_MEMORY_TOTAL_BYTES = Gauge(
    "voxaudit_system_memory_total_bytes",
    "System host/container RAM total capacity (bytes)",
)

# -----------------------------------------------------------------------------
# 4. Asynchronous Worker & Queue Telemetry
# -----------------------------------------------------------------------------
WORKER_PROCESSED_JOBS_TOTAL = Counter(
    "voxaudit_worker_processed_jobs_total",
    "Total number of background jobs processed by workers",
    ["worker", "status"],  # worker: 'call_worker', 'voice_worker', 'qa_worker'
)

WORKER_JOB_DURATION_SECONDS = Histogram(
    "voxaudit_worker_job_duration_seconds",
    "Total end-to-end execution duration of background worker tasks",
    ["worker"],
    buckets=(1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0, 600.0),
)


class StageTimer:
    """Context manager to measure and record execution time for ML pipeline stages."""

    def __init__(self, stage_name: str) -> None:
        self.stage_name = stage_name
        self.start_time = 0.0
        self.duration = 0.0

    def __enter__(self) -> "StageTimer":
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.duration = time.perf_counter() - self.start_time
        ML_STAGE_DURATION_SECONDS.labels(stage=self.stage_name).observe(self.duration)


def collect_hardware_metrics() -> None:
    """Collects real-time GPU VRAM, System CPU %, and RAM metrics."""
    # 1. System CPU & Memory
    try:
        import psutil
        SYSTEM_CPU_PERCENT.set(psutil.cpu_percent(interval=None))
        vmem = psutil.virtual_memory()
        SYSTEM_MEMORY_USED_BYTES.set(vmem.used)
        SYSTEM_MEMORY_TOTAL_BYTES.set(vmem.total)
    except Exception:
        pass

    # 2. CUDA GPU VRAM
    try:
        import torch
        if torch.cuda.is_available():
            for i in range(torch.cuda.device_count()):
                dev_name = f"cuda:{i}"
                used_vram = torch.cuda.memory_allocated(i)
                total_vram = torch.cuda.get_device_properties(i).total_memory
                util_pct = (used_vram / max(1, total_vram)) * 100.0

                GPU_MEMORY_USED_BYTES.labels(device=dev_name).set(used_vram)
                GPU_MEMORY_TOTAL_BYTES.labels(device=dev_name).set(total_vram)
                GPU_UTILIZATION_PERCENT.labels(device=dev_name).set(util_pct)
        else:
            GPU_MEMORY_USED_BYTES.labels(device="none").set(0)
            GPU_MEMORY_TOTAL_BYTES.labels(device="none").set(0)
            GPU_UTILIZATION_PERCENT.labels(device="none").set(0)
    except Exception:
        pass
