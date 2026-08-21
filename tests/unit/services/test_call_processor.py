from unittest.mock import MagicMock

import torch
import pytest

from app.services.call.call_processor import CallProcessor


def test_find_speaker_for_word():
    segments = [
        {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00"},
        {"start": 5.2, "end": 10.0, "speaker": "SPEAKER_01"},
    ]

    # Word directly inside SPEAKER_00 segment
    speaker = CallProcessor.find_speaker_for_word(1.0, 2.0, segments)
    assert speaker == "SPEAKER_00"

    # Word directly inside SPEAKER_01 segment
    speaker = CallProcessor.find_speaker_for_word(6.0, 7.5, segments)
    assert speaker == "SPEAKER_01"

    # Word in small gap (5.0s to 5.2s) uses midpoint fallback
    speaker = CallProcessor.find_speaker_for_word(5.05, 5.15, segments)
    assert speaker in ["SPEAKER_00", "SPEAKER_01"]


def test_build_conversation_merging():
    aligned_words = [
        {"start": 0.0, "end": 1.0, "word": "Hello", "speaker": "SPEAKER_00"},
        {"start": 1.2, "end": 2.0, "word": "there", "speaker": "SPEAKER_00"},
        {"start": 3.0, "end": 4.0, "word": "Hi", "speaker": "SPEAKER_01"},
    ]

    turns = CallProcessor.build_conversation(aligned_words)
    assert len(turns) == 2
    assert turns[0]["speaker"] == "SPEAKER_00"
    assert turns[0]["text"] == "Hello there"
    assert turns[1]["speaker"] == "SPEAKER_01"
    assert turns[1]["text"] == "Hi"
