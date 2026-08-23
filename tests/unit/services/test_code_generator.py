import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.services.code_generator import CodeGenerator, CodePrefix


@pytest.fixture
def in_memory_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_code_generator_sequential_formatting(in_memory_db):
    # Test sequential generation for DEPT
    code1 = CodeGenerator.generate_code(in_memory_db, CodePrefix.DEPARTMENT)
    assert code1 == "DEPT-000001"

    code2 = CodeGenerator.generate_code(in_memory_db, CodePrefix.DEPARTMENT)
    assert code2 == "DEPT-000002"

    code3 = CodeGenerator.generate_code(in_memory_db, CodePrefix.DEPARTMENT)
    assert code3 == "DEPT-000003"


def test_code_generator_multiple_entity_prefixes(in_memory_db):
    dept_code = CodeGenerator.generate_code(in_memory_db, CodePrefix.DEPARTMENT)
    agnt_code = CodeGenerator.generate_code(in_memory_db, CodePrefix.EMPLOYEE)
    call_code = CodeGenerator.generate_code(in_memory_db, CodePrefix.CALL)
    audt_code = CodeGenerator.generate_code(in_memory_db, CodePrefix.AUDIT)
    desg_code = CodeGenerator.generate_code(in_memory_db, CodePrefix.DESIGNATION)
    shft_code = CodeGenerator.generate_code(in_memory_db, CodePrefix.SHIFT)
    voic_code = CodeGenerator.generate_code(in_memory_db, CodePrefix.VOICE_SAMPLE)

    assert dept_code == "DEPT-000001"
    assert agnt_code == "AGNT-000001"
    assert call_code == "CALL-000001"
    assert audt_code == "AUDT-000001"
    assert desg_code == "DESG-000001"
    assert shft_code == "SHFT-000001"
    assert voic_code == "VOIC-000001"


def test_code_generator_string_prefix(in_memory_db):
    code = CodeGenerator.generate_code(in_memory_db, "dept")
    assert code == "DEPT-000001"
