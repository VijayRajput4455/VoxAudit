import os
import tempfile
import pytest
from app.core.logging import SafeRotatingFileHandler, setup_logging


def test_safe_rotating_file_handler_handles_permission_error():
    with tempfile.TemporaryDirectory() as tmpdir:
        log_file = os.path.join(tmpdir, "test.log")
        handler = SafeRotatingFileHandler(log_file, maxBytes=100, backupCount=3)

        # Write enough data to trigger rollover
        import logging
        logger = logging.getLogger("test_logger")
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)

        # Lock the log file by keeping another open handle on Windows
        with open(log_file, "a") as lock_handle:
            # Emit logs exceeding maxBytes while log_file is locked by open handle
            for i in range(20):
                logger.info(f"Log line {i} " + ("x" * 50))

        handler.close()
        logger.removeHandler(handler)
        assert os.path.exists(log_file)


def test_setup_logging_runs_without_error():
    setup_logging()
