from fastapi import APIRouter, status

router = APIRouter()


@router.get(
    "/",
    status_code=status.HTTP_200_OK,
    summary="Health check",
)
def health_check():
    return {
        "status": "healthy",
        "service": "VoxAudit",
    }