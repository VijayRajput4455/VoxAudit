from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeResponse,
    EmployeeUpdate,
)
from app.services.employee_service import EmployeeService


router = APIRouter()


@router.post(
    "/",
    response_model=EmployeeResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_employee(
    data: EmployeeCreate,
    db: Session = Depends(get_db),
):
    service = EmployeeService(db)

    try:
        return service.create_employee(data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )


@router.post(
    "/bulk-import",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    summary="Bulk import multiple employees",
)
def bulk_import_employees(
    items: list[EmployeeCreate],
    db: Session = Depends(get_db),
):
    service = EmployeeService(db)
    created = []
    errors = []

    for idx, data in enumerate(items):
        try:
            emp = service.create_employee(data)
            created.append(emp)
        except Exception as exc:
            errors.append({"row": idx + 1, "first_name": data.first_name, "error": str(exc)})

    return {
        "imported_count": len(created),
        "error_count": len(errors),
        "errors": errors,
    }


@router.get(
    "/",
    response_model=list[EmployeeResponse],
)
def get_employees(
    db: Session = Depends(get_db),
):
    service = EmployeeService(db)

    return service.get_employees()


@router.get(
    "/{employee_id}",
    response_model=EmployeeResponse,
)
def get_employee(
    employee_id: UUID,
    db: Session = Depends(get_db),
):
    service = EmployeeService(db)

    employee = service.get_employee(employee_id)

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found.",
        )

    return employee


@router.put("/{employee_id}", response_model=EmployeeResponse)
@router.patch(
    "/{employee_id}",
    response_model=EmployeeResponse,
)
def update_employee(
    employee_id: UUID,
    data: EmployeeUpdate,
    db: Session = Depends(get_db),
):
    service = EmployeeService(db)

    employee = service.update_employee(
        employee_id,
        data,
    )

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found.",
        )

    return employee


@router.delete(
    "/{employee_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_employee(
    employee_id: UUID,
    db: Session = Depends(get_db),
):
    service = EmployeeService(db)

    deleted = service.delete_employee(employee_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found.",
        )


@router.get(
    "/{employee_id}/scorecard-summary",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Get Employee Aggregate QA & CX Scorecard Summary",
)
def get_employee_scorecard_summary(
    employee_id: UUID,
    db: Session = Depends(get_db),
) -> dict:
    """Calculates aggregate QA score and customer sentiment metrics for an employee across all calls."""
    from sqlalchemy import select
    from app.models.call_job import CallJob

    service = EmployeeService(db)
    employee = service.get_employee(employee_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")

    statement = select(CallJob).where(
        CallJob.identified_employee_id == employee_id,
        CallJob.status == "COMPLETED",
    )
    calls = db.scalars(statement).all()

    total_calls = len(calls)
    if total_calls == 0:
        return {
            "employee_id": str(employee_id),
            "employee_name": employee.name,
            "total_calls_audited": 0,
            "average_qa_score": 0.0,
            "sentiment_breakdown": {"Positive": 0, "Neutral": 0, "Negative": 0},
            "issue_resolution_rate": "0%",
        }

    qa_scores = [c.qa_score for c in calls if c.qa_score is not None]
    avg_qa = round(sum(qa_scores) / len(qa_scores), 1) if qa_scores else 0.0

    sentiment_counts = {"Positive": 0, "Neutral": 0, "Negative": 0}
    resolved_count = 0

    for c in calls:
        if c.qa_scorecard_json and "customer_experience" in c.qa_scorecard_json:
            cx = c.qa_scorecard_json["customer_experience"]
            sent = cx.get("customer_sentiment", "Neutral")
            sentiment_counts[sent] = sentiment_counts.get(sent, 0) + 1
            if cx.get("issue_resolution") == "Resolved":
                resolved_count += 1

    resolution_rate = round((resolved_count / total_calls) * 100, 1)

    return {
        "employee_id": str(employee_id),
        "employee_name": employee.name,
        "total_calls_audited": total_calls,
        "average_qa_score": avg_qa,
        "sentiment_breakdown": sentiment_counts,
        "issue_resolution_rate": f"{resolution_rate}%",
    }