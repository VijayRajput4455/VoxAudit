from typing import Any, Dict, List, Optional
import re

from app.core.logging import get_logger
from app.integrations.ollama.client import OllamaClient

logger = get_logger(__name__)


class QAScorecardService:
    """Enterprise Ollama LLM-powered Call QA Evaluation & Customer Experience (CX) Analytics Engine."""

    def __init__(self, ollama_client: Optional[OllamaClient] = None) -> None:
        self.ollama_client = ollama_client if ollama_client is not None else OllamaClient()

    def compute_scorecard(
        self,
        transcript_turns: List[Dict[str, Any]],
        speaker_mappings: Dict[str, str],
        identified_employee_name: Optional[str] = None,
        duration_seconds: float = 0.0,
        call_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Evaluates call transcript using Ollama LLM and generates Enterprise v1.0 JSON QA Evaluation Report."""
        if not transcript_turns:
            return self._empty_scorecard(call_id, duration_seconds)

        # 1. Identify Agent vs Customer speakers and resolve human names
        agent_speaker_key = "SPEAKER_00"
        customer_speaker_key = "SPEAKER_01"

        if identified_employee_name:
            for key, name in speaker_mappings.items():
                if name == identified_employee_name:
                    agent_speaker_key = key
                    break

        for key in speaker_mappings.keys():
            if key != agent_speaker_key:
                customer_speaker_key = key
                break

        agent_speaker_name = identified_employee_name or speaker_mappings.get(agent_speaker_key, "Agent")
        customer_speaker_name = speaker_mappings.get(customer_speaker_key, "Customer")
        if customer_speaker_name == agent_speaker_name:
            customer_speaker_name = "Customer"


        # 2. Calculate Conversation Timing Metrics
        agent_turns = [t for t in transcript_turns if t.get("speaker") == agent_speaker_key]
        customer_turns = [t for t in transcript_turns if t.get("speaker") != agent_speaker_key]

        agent_talk_time = sum(t["end"] - t["start"] for t in agent_turns)
        customer_talk_time = sum(t["end"] - t["start"] for t in customer_turns)
        total_talk_time = agent_talk_time + customer_talk_time

        if total_talk_time > 0:
            agent_talk_ratio = round((agent_talk_time / total_talk_time) * 100, 1)
            customer_talk_ratio = round((customer_talk_time / total_talk_time) * 100, 1)
        else:
            agent_talk_ratio = 50.0
            customer_talk_ratio = 50.0

        if agent_talk_ratio < 40.0:
            talk_ratio_status = "below_target"
            talk_ratio_score = 15.0
        elif agent_talk_ratio > 65.0:
            talk_ratio_status = "above_target"
            talk_ratio_score = 15.0
        else:
            talk_ratio_status = "within_target"
            talk_ratio_score = 25.0

        # Interruptions & turn analysis
        interruptions = 0
        silence_duration = 0.0
        for i in range(1, len(transcript_turns)):
            prev = transcript_turns[i - 1]
            curr = transcript_turns[i]
            gap = curr["start"] - prev["end"]
            if gap < -0.1 and curr.get("speaker") != prev.get("speaker"):
                interruptions += 1
            elif gap > 3.0:
                silence_duration += gap

        # 3. Format Call Transcript for Prompt
        formatted_transcript = []
        for t in transcript_turns:
            spk_name = t.get("speaker_name", t.get("speaker", "Unknown"))
            formatted_transcript.append(f"[{t['start']}s - {t['end']}s] {spk_name}: {t['text']}")

        transcript_str = "\n".join(formatted_transcript)

        system_prompt = (
            "You are an Enterprise AI Call Quality & Compliance Auditor. "
            "You strictly evaluate customer support calls and output valid JSON conforming exactly to the requested Schema v1.0."
        )

        user_prompt = f"""
Analyze the following customer support call transcript and evaluate the Agent ({agent_speaker_name}).

=== CALL TRANSCRIPT ===
{transcript_str}
=======================

=== METRICS DATA ===
Call ID: {call_id or 'N/A'}
Call Duration: {duration_seconds} seconds
Agent Talk Ratio: {agent_talk_ratio}%
Customer Talk Ratio: {customer_talk_ratio}%
Turn Count: {len(transcript_turns)}
Interruptions Count: {interruptions}
====================

Output a valid JSON object strictly matching this Enterprise v1.0 Schema format:
{{
  "schema_version": "1.0",
  "evaluation_status": "complete",

  "call": {{
    "call_id": "{call_id or ''}",
    "duration_seconds": {duration_seconds},
    "agent_speaker": "{agent_speaker_name}",
    "customer_speaker": "{customer_speaker_name}"
  }},


  "conversation_metrics": {{
    "agent_talk_time_seconds": {round(agent_talk_time, 2)},
    "customer_talk_time_seconds": {round(customer_talk_time, 2)},
    "agent_talk_ratio_percentage": {agent_talk_ratio},
    "customer_talk_ratio_percentage": {customer_talk_ratio},

    "talk_listen_ratio": {{
      "target_agent_ratio": {{
        "min_percentage": 40.0,
        "max_percentage": 65.0
      }},
      "status": "{talk_ratio_status}",
      "score": {talk_ratio_score},
      "max_score": 25.0
    }},

    "turn_count": {len(transcript_turns)},
    "interruptions": {interruptions},
    "silence_duration_seconds": {round(silence_duration, 2)},
    "average_response_time_seconds": 1.5
  }},

  "agent_evaluation": {{
    "professional_greeting": {{
      "status": "evaluated",
      "score": 10.0,
      "max_score": 10.0,
      "passed": true,
      "evidence": ["Greeting turn snippet"],
      "reason": "Reason for greeting score"
    }},
    "problem_understanding": {{
      "status": "evaluated",
      "score": 15.0,
      "max_score": 15.0,
      "passed": true,
      "evidence": [],
      "reason": "Reason for understanding score"
    }},
    "empathy": {{
      "status": "evaluated",
      "score": 12.0,
      "max_score": 15.0,
      "passed": true,
      "evidence": [],
      "reason": "Reason for empathy score"
    }},
    "communication": {{
      "status": "evaluated",
      "score": 10.0,
      "max_score": 10.0,
      "passed": true,
      "evidence": [],
      "reason": "Reason for communication score"
    }},
    "professionalism": {{
      "status": "evaluated",
      "score": 10.0,
      "max_score": 10.0,
      "passed": true,
      "evidence": [],
      "reason": "Reason for professionalism score"
    }},
    "resolution": {{
      "status": "evaluated",
      "score": 20.0,
      "max_score": 20.0,
      "passed": true,
      "resolution_status": "Resolved", // Must be "Resolved", "Partially Resolved", or "Unresolved"
      "evidence": [],
      "reason": "Reason for resolution score"
    }},
    "professional_closing": {{
      "status": "evaluated",
      "score": 5.0,
      "max_score": 5.0,
      "passed": true,
      "evidence": [],
      "reason": "Reason for closing score"
    }}
  }},

  "customer_experience": {{
    "sentiment": {{
      "initial": "Neutral", // "Positive", "Neutral", or "Negative"
      "middle": "Neutral",
      "final": "Positive",
      "trend": "improving", // "improving", "stable", or "worsening"
      "confidence": 0.92
    }},
    "frustration": {{
      "initial": "Low", // "Low", "Medium", or "High"
      "final": "Low",
      "trend": "stable",
      "confidence": 0.90
    }},
    "satisfaction": {{
      "level": "Satisfied", // "Satisfied", "Neutral", or "Dissatisfied"
      "confidence": 0.95
    }},
    "issue_resolution": {{
      "status": "Resolved", // "Resolved", "Partially Resolved", or "Unresolved"
      "confidence": 0.95,
      "evidence": []
    }},
    "customer_effort": {{
      "level": "Low effort", // "Low effort", "Medium effort", or "High effort"
      "confidence": 0.88,
      "reason": "Reason for effort level"
    }}
  }},

  "compliance": {{
    "status": "evaluated",
    "score": 10.0,
    "max_score": 10.0,
    "passed": true,
    "checks": ["Standard Disclosure"],
    "violations": [],
    "flagged_keywords": [],
    "evidence": []
  }},

  "overall_evaluation": {{
    "score": 88.0, // 0.0 to 100.0
    "max_score": 100.0,
    "confidence": 0.94,
    "grade": "A" // "A", "B", "C", "D", or "F"
  }},

  "insights": {{
    "strengths": ["Strength 1", "Strength 2"],
    "weaknesses": ["Weakness 1"],
    "action_items": ["Action item 1", "Action item 2"]
  }},

  "evaluation_error": {{
    "has_error": false,
    "code": null,
    "service": "ollama",
    "message": null,
    "retryable": false
  }}
}}
"""

        try:
            llm_result = self.ollama_client.generate_json(
                prompt=user_prompt,
                system_prompt=system_prompt,
            )

            # Standardize top-level overall score compatibility
            if "overall_evaluation" in llm_result and "score" in llm_result["overall_evaluation"]:
                score_val = llm_result["overall_evaluation"]["score"]
                llm_result["overall_qa_score"] = float(score_val) if score_val is not None else 50.0

            logger.info(f"Ollama LLM successfully generated Enterprise v1.0 QA Report for call. Overall Score: {llm_result.get('overall_qa_score')}/100")
            return llm_result

        except Exception as exc:
            logger.warning(f"Ollama LLM evaluation failed ({str(exc)}). Generating partial fallback schema.", exc_info=True)
            return self._partial_fallback_scorecard(
                call_id=call_id,
                duration_seconds=duration_seconds,
                agent_speaker=agent_speaker_name,
                customer_speaker=customer_speaker_name,
                agent_talk_time=agent_talk_time,
                customer_talk_time=customer_talk_time,
                agent_talk_ratio=agent_talk_ratio,
                customer_talk_ratio=customer_talk_ratio,
                talk_ratio_status=talk_ratio_status,
                talk_ratio_score=talk_ratio_score,
                turn_count=len(transcript_turns),
                interruptions=interruptions,
                silence_duration=silence_duration,
                error_message=str(exc),
            )

    def _partial_fallback_scorecard(
        self,
        call_id: Optional[str],
        duration_seconds: float,
        agent_speaker: str,
        customer_speaker: str,
        agent_talk_time: float,
        customer_talk_time: float,
        agent_talk_ratio: float,
        customer_talk_ratio: float,
        talk_ratio_status: str,
        talk_ratio_score: float,
        turn_count: int,
        interruptions: int,
        silence_duration: float,
        error_message: str,
    ) -> Dict[str, Any]:
        """Provides full Enterprise Schema v1.0 partial fallback when Ollama is offline."""
        return {
            "schema_version": "1.0",
            "evaluation_status": "partial",
            "overall_qa_score": 50.0,

            "call": {
                "call_id": call_id,
                "duration_seconds": duration_seconds,
                "agent_speaker": agent_speaker,
                "customer_speaker": customer_speaker,
            },

            "conversation_metrics": {
                "agent_talk_time_seconds": round(agent_talk_time, 2),
                "customer_talk_time_seconds": round(customer_talk_time, 2),
                "agent_talk_ratio_percentage": agent_talk_ratio,
                "customer_talk_ratio_percentage": customer_talk_ratio,

                "talk_listen_ratio": {
                    "target_agent_ratio": {
                        "min_percentage": 40.0,
                        "max_percentage": 65.0,
                    },
                    "status": talk_ratio_status,
                    "score": talk_ratio_score,
                    "max_score": 25.0,
                },

                "turn_count": turn_count,
                "interruptions": interruptions,
                "silence_duration_seconds": round(silence_duration, 2),
                "average_response_time_seconds": None,
            },

            "agent_evaluation": {
                "professional_greeting": {"status": "not_evaluated", "score": None, "max_score": 10.0, "passed": None, "evidence": [], "reason": None},
                "problem_understanding": {"status": "not_evaluated", "score": None, "max_score": 15.0, "passed": None, "evidence": [], "reason": None},
                "empathy": {"status": "not_evaluated", "score": None, "max_score": 15.0, "passed": None, "evidence": [], "reason": None},
                "communication": {"status": "not_evaluated", "score": None, "max_score": 10.0, "passed": None, "evidence": [], "reason": None},
                "professionalism": {"status": "not_evaluated", "score": None, "max_score": 10.0, "passed": None, "evidence": [], "reason": None},
                "resolution": {"status": "not_evaluated", "score": None, "max_score": 20.0, "passed": None, "resolution_status": None, "evidence": [], "reason": None},
                "professional_closing": {"status": "not_evaluated", "score": None, "max_score": 5.0, "passed": None, "evidence": [], "reason": None},
            },

            "customer_experience": {
                "sentiment": {"initial": None, "middle": None, "final": None, "trend": None, "confidence": None},
                "frustration": {"initial": None, "final": None, "trend": None, "confidence": None},
                "satisfaction": {"level": None, "confidence": None},
                "issue_resolution": {"status": None, "confidence": None, "evidence": []},
                "customer_effort": {"level": None, "confidence": None, "reason": None},
            },

            "compliance": {
                "status": "not_evaluated",
                "score": None,
                "max_score": 10.0,
                "passed": None,
                "checks": [],
                "violations": [],
                "flagged_keywords": [],
                "evidence": [],
            },

            "overall_evaluation": {
                "score": 50.0,
                "max_score": 100.0,
                "confidence": None,
                "grade": "C",
            },

            "insights": {
                "strengths": [],
                "weaknesses": [],
                "action_items": [],
            },

            "evaluation_error": {
                "has_error": True,
                "code": "LLM_UNAVAILABLE",
                "service": "ollama",
                "message": f"Ollama service was unavailable during evaluation ({error_message}).",
                "retryable": True,
            },
        }

    def _empty_scorecard(self, call_id: Optional[str], duration_seconds: float) -> Dict[str, Any]:
        """Returns empty Enterprise Schema v1.0 payload."""
        return self._partial_fallback_scorecard(
            call_id=call_id,
            duration_seconds=duration_seconds,
            agent_speaker="SPEAKER_00",
            customer_speaker="SPEAKER_01",
            agent_talk_time=0.0,
            customer_talk_time=0.0,
            agent_talk_ratio=0.0,
            customer_talk_ratio=0.0,
            talk_ratio_status="below_target",
            talk_ratio_score=0.0,
            turn_count=0,
            interruptions=0,
            silence_duration=0.0,
            error_message="Empty transcript.",
        )
