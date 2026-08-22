from unittest.mock import MagicMock
from app.services.analytics.qa_scorecard_service import QAScorecardService


def test_qa_scorecard_enterprise_schema_computation():
    mock_ollama = MagicMock()
    mock_ollama.generate_json.return_value = {
        "schema_version": "1.0",
        "evaluation_status": "complete",
        "overall_evaluation": {
            "score": 90.0,
            "max_score": 100.0,
            "confidence": 0.95,
            "grade": "A",
        },
        "insights": {
            "strengths": ["Polite greeting"],
            "weaknesses": [],
            "action_items": ["Send confirmation email"],
        },
        "agent_evaluation": {
            "professional_greeting": {"status": "evaluated", "score": 10.0, "max_score": 10.0, "passed": True, "evidence": [], "reason": "Greeting verified."},
        },
        "customer_experience": {
            "sentiment": {"initial": "Neutral", "final": "Positive", "trend": "improving", "confidence": 0.95},
            "frustration": {"initial": "Low", "final": "Low", "trend": "stable", "confidence": 0.90},
            "satisfaction": {"level": "Satisfied", "confidence": 0.95},
            "issue_resolution": {"status": "Resolved", "confidence": 0.95, "evidence": []},
            "customer_effort": {"level": "Low effort", "confidence": 0.88, "reason": "Quick fix"},
        },
        "evaluation_error": {
            "has_error": False,
            "code": None,
            "service": "ollama",
            "message": None,
            "retryable": False,
        },
    }

    service = QAScorecardService(ollama_client=mock_ollama)

    sample_turns = [
        {
            "start": 2.38,
            "end": 3.86,
            "speaker": "SPEAKER_01",
            "speaker_name": "Customer",
            "text": "Hello, I am having a problem with my account.",
        },
        {
            "start": 4.37,
            "end": 8.47,
            "speaker": "SPEAKER_00",
            "speaker_name": "Vijay Rajput",
            "text": "Hello! Welcome to Support. My name is Vijay Rajput.",
        },
    ]

    speaker_mappings = {"SPEAKER_00": "Vijay Rajput", "SPEAKER_01": "Customer"}

    scorecard = service.compute_scorecard(
        transcript_turns=sample_turns,
        speaker_mappings=speaker_mappings,
        identified_employee_name="Vijay Rajput",
        duration_seconds=10.0,
        call_id="call-123",
    )

    assert scorecard["schema_version"] == "1.0"
    assert scorecard["overall_qa_score"] == 90.0
    assert scorecard["evaluation_status"] == "complete"
    assert scorecard["customer_experience"]["satisfaction"]["level"] == "Satisfied"
    assert mock_ollama.generate_json.called


def test_qa_scorecard_empty_turns():
    service = QAScorecardService()
    scorecard = service.compute_scorecard(
        transcript_turns=[],
        speaker_mappings={},
        identified_employee_name=None,
        duration_seconds=0.0,
    )

    assert scorecard["schema_version"] == "1.0"
    assert scorecard["evaluation_status"] == "partial"
    assert scorecard["overall_qa_score"] == 50.0
    assert scorecard["evaluation_error"]["has_error"] is True
