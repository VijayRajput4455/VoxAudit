from app.models.base import Base
from app.models.call_job import CallJob
from app.models.department import Department
from app.models.designation import Designation
from app.models.employee import Employee
from app.models.entity_sequence import EntitySequence
from app.models.shift import Shift
from app.models.voice_sample import VoiceSample

__all__ = [
    "Base",
    "CallJob",
    "Department",
    "Designation",
    "Employee",
    "EntitySequence",
    "Shift",
    "VoiceSample",
]