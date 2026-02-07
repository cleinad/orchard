uv sync
uv run python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000 --env-file .env

instead of this ^ which does not work, run:
```bash
 uv run uvicorn main:app --reload --ws wsproto
 ```