import json
from urllib.error import HTTPError, URLError
from urllib.request import Request as URLRequest, urlopen

from fastapi import HTTPException

_DEEPGRAM_DEFAULTS = {
    "model": "nova-2",
    "interim_results": "true",
    "punctuate": "true",
    "smart_format": "true",
    # Keep this in sync with the frontend recorder format unless you change codecs.
    "content-type": "audio/webm;codecs=opus",
}

# Allow overriding defaults and adding extra Deepgram params from the client.
# Add new keys here if you need to pass through other Deepgram options later.
_DEEPGRAM_ALLOWED_PARAMS = set(_DEEPGRAM_DEFAULTS) | {"encoding", "sample_rate"}


def _deepgram_request(url: str, api_key: str, payload: dict | None = None) -> dict:
    headers = {"Authorization": f"Token {api_key}"}
    data = None
    method = "GET"
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
        method = "POST"

    request = URLRequest(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8") if exc.fp else str(exc)
        raise HTTPException(status_code=exc.code, detail=f"Deepgram error: {detail}")
    except URLError as exc:
        raise HTTPException(
            status_code=502, detail=f"Deepgram connection error: {exc.reason}"
        )
