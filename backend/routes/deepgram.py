import os

from fastapi import APIRouter, HTTPException

from services.deepgram import _deepgram_request

router = APIRouter()


@router.post("/api/deepgram/token")
def create_deepgram_token():
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="DEEPGRAM_API_KEY not set.")

    project_id = os.getenv("DEEPGRAM_PROJECT_ID")
    if not project_id:
        raise HTTPException(status_code=500, detail="DEEPGRAM_PROJECT_ID not set.")

    ttl_seconds = int(os.getenv("DEEPGRAM_TOKEN_TTL", "600"))
    scopes_env = os.getenv("DEEPGRAM_TOKEN_SCOPES", "listen:write")
    scopes = [scope.strip() for scope in scopes_env.split(",") if scope.strip()]

    payload = {
        "comment": "Keen browser token",
        "time_to_live": ttl_seconds,
        "scopes": scopes,
    }

    response = _deepgram_request(
        f"https://api.deepgram.com/v1/projects/{project_id}/keys",
        api_key,
        payload=payload,
    )
    token = response.get("key")
    if not token:
        raise HTTPException(
            status_code=502, detail="Deepgram token response missing key."
        )
    return {"token": token}
