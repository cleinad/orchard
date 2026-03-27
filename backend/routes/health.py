import os

from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "keen-backend"}


@router.get("/health")
def health_check():
    """Detailed health check endpoint."""
    api_key_configured = bool(os.getenv("DEEPGRAM_API_KEY"))
    return {
        "status": "ok",
        "service": "keen-backend",
        "deepgram_api_key_configured": api_key_configured,
        "websocket_endpoints": ["/ws/echo", "/ws/deepgram"],
    }
