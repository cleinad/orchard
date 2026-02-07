import asyncio
import logging
import os
from urllib.parse import urlencode

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from websockets.asyncio.client import connect as ws_connect
from websockets.exceptions import InvalidStatusCode, ConnectionClosedError, InvalidURI

from services.deepgram import _DEEPGRAM_DEFAULTS, _DEEPGRAM_ALLOWED_PARAMS

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/deepgram")
async def deepgram_proxy(websocket: WebSocket):
    """
    WebSocket proxy endpoint for Deepgram transcription.
    Accepts audio data from the client and forwards it to Deepgram,
    then relays transcription results back to the client.
    """
    # Log connection attempt immediately
    logger.info(f"Deepgram proxy endpoint hit. Headers: {dict(websocket.headers)}")

    # Log connection details before accepting
    # Access headers and query params before accept() to help debug
    try:
        client_origin = websocket.headers.get("origin", "unknown")
        client_host = websocket.headers.get("host", "unknown")
        client_headers = dict(websocket.headers)
        query_params = dict(websocket.query_params)

        logger.info(f"WebSocket connection attempt received")
        logger.info(f"  Origin: {client_origin}")
        logger.info(f"  Host: {client_host}")
        logger.info(f"  Query params: {query_params}")
        logger.info(f"  Headers: {list(client_headers.keys())}")

        # Log specific WebSocket upgrade headers
        upgrade_header = websocket.headers.get("upgrade", "").lower()
        connection_header = websocket.headers.get("connection", "").lower()
        sec_websocket_key = websocket.headers.get("sec-websocket-key", "")
        sec_websocket_version = websocket.headers.get("sec-websocket-version", "")

        logger.info(f"  Upgrade: {upgrade_header}")
        logger.info(f"  Connection: {connection_header}")
        logger.info(f"  Sec-WebSocket-Key: {sec_websocket_key[:20]}..." if sec_websocket_key else "  Sec-WebSocket-Key: (missing)")
        logger.info(f"  Sec-WebSocket-Version: {sec_websocket_version}")

    except Exception as e:
        logger.error(f"Error reading WebSocket request details: {type(e).__name__}: {e}", exc_info=True)

    try:
        # Accept WebSocket connection
        # FastAPI/Starlette will validate the WebSocket upgrade request
        # If headers are invalid, this will raise an exception
        await websocket.accept()
        logger.info("WebSocket connection accepted from client")
    except Exception as e:
        # If accept fails, the connection is already rejected
        # This could be due to invalid headers, missing upgrade headers, etc.
        logger.error(f"WebSocket accept failed: {type(e).__name__}: {e}", exc_info=True)
        # Try to close with error code if connection is still open
        try:
            await websocket.close(code=1008, reason=f"Connection rejected: {str(e)[:100]}")
        except Exception:
            pass
        return

    # Check for API key before proceeding
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        error_msg = "DEEPGRAM_API_KEY not configured"
        logger.error(error_msg)
        await websocket.close(code=1011, reason=error_msg)
        return

    # Log API key status (masked for security)
    api_key_preview = f"{api_key[:8]}...{api_key[-4:]}" if len(api_key) > 12 else "***"
    logger.info(f"Using Deepgram API key: {api_key_preview}")

    # Build query parameters from defaults and client overrides
    params: dict[str, str] = {
        key: default for key, default in _DEEPGRAM_DEFAULTS.items() if default
    }
    for key in _DEEPGRAM_ALLOWED_PARAMS:
        value = websocket.query_params.get(key)
        if value:
            params[key] = value

    logger.info(f"Deepgram connection parameters: {params}")
    logger.info(f"Client query params: {dict(websocket.query_params)}")

    # Construct Deepgram WebSocket URL with query parameters
    deepgram_url = "wss://api.deepgram.com/v1/listen"
    if params:
        deepgram_url = f"{deepgram_url}?{urlencode(params)}"

    logger.info(f"Connecting to Deepgram: {deepgram_url}")

    # Prepare headers for Deepgram connection
    deepgram_headers = {
        "Authorization": f"Token {api_key}"
    }

    try:
        # Connect to Deepgram WebSocket with proper headers and connection options
        # Add ping_interval to keep connection alive and timeout for connection attempts
        logger.info("Attempting to establish Deepgram WebSocket connection...")
        async with ws_connect(
            deepgram_url,
            additional_headers=deepgram_headers,
            max_size=4 * 1024 * 1024,  # 4MB max message size
            ping_interval=20,  # Send ping every 20 seconds to keep connection alive
            ping_timeout=10,  # Wait 10 seconds for pong response
            close_timeout=10,  # Wait 10 seconds for clean close
        ) as deepgram_ws:
            logger.info("Successfully connected to Deepgram WebSocket")

            async def client_to_deepgram() -> None:
                """Forward audio data from client to Deepgram."""
                try:
                    bytes_sent = 0
                    while True:
                        message = await websocket.receive()
                        if message.get("type") == "websocket.disconnect":
                            logger.info(f"Client disconnected. Total bytes sent to Deepgram: {bytes_sent}")
                            break
                        # Forward binary audio data to Deepgram
                        data = message.get("bytes")
                        if data:
                            bytes_sent += len(data)
                            await deepgram_ws.send(data)
                except WebSocketDisconnect:
                    logger.info("Client WebSocket disconnected")
                except Exception as e:
                    logger.error(f"Error in client_to_deepgram: {type(e).__name__}: {e}", exc_info=True)
                finally:
                    # Clean up Deepgram connection when client disconnects
                    try:
                        await deepgram_ws.close()
                        logger.info("Closed Deepgram WebSocket connection")
                    except Exception as e:
                        logger.warning(f"Error closing Deepgram connection: {e}")

            async def deepgram_to_client() -> None:
                """Forward transcription results from Deepgram to client."""
                try:
                    messages_received = 0
                    async for message in deepgram_ws:
                        messages_received += 1
                        # Forward Deepgram responses (JSON text or binary) to client
                        if isinstance(message, (bytes, bytearray)):
                            await websocket.send_bytes(message)
                        else:
                            await websocket.send_text(message)
                    logger.info(f"Deepgram connection closed. Total messages received: {messages_received}")
                except Exception as e:
                    logger.error(f"Error in deepgram_to_client: {type(e).__name__}: {e}", exc_info=True)
                finally:
                    # Close client connection when Deepgram disconnects
                    try:
                        await websocket.close()
                        logger.info("Closed client WebSocket connection")
                    except Exception as e:
                        logger.warning(f"Error closing client connection: {e}")

            # Run both forwarding tasks concurrently
            await asyncio.gather(client_to_deepgram(), deepgram_to_client())
    except InvalidStatusCode as exc:
        # Handle HTTP error responses from Deepgram
        # Deepgram returns custom headers: dg-request-id and dg-error on connection failures
        error_msg = f"Deepgram connection rejected: HTTP {exc.status_code}"
        # Try to extract Deepgram error headers if available
        # Note: websockets library may not expose response headers directly
        # Check response object if it exists
        if hasattr(exc, "response") and hasattr(exc.response, "headers"):
            headers = exc.response.headers
            dg_error = headers.get("dg-error", "")
            dg_request_id = headers.get("dg-request-id", "")
            if dg_error:
                error_msg += f" - Error: {dg_error}"
            if dg_request_id:
                error_msg += f" - Request ID: {dg_request_id}"
        logger.error(f"Deepgram WebSocket connection failed: {error_msg}")
        logger.error(f"Deepgram URL: {deepgram_url}")
        logger.error(f"Deepgram params: {params}")
        logger.error(f"Exception details: {exc}", exc_info=True)
        await websocket.close(code=1011, reason=error_msg[:123])  # WebSocket close reason max 123 bytes
    except ConnectionClosedError as exc:
        # Handle connection closed errors
        error_msg = f"Deepgram connection closed: {exc.code} - {exc.reason}"
        logger.error(f"Deepgram WebSocket connection closed: {error_msg}")
        logger.error(f"Exception details: {exc}", exc_info=True)
        await websocket.close(code=1011, reason=error_msg[:123])
    except InvalidURI as exc:
        # Handle invalid URI errors
        error_msg = f"Invalid Deepgram URI: {exc}"
        logger.error(f"Deepgram WebSocket URI error: {error_msg}")
        logger.error(f"URL attempted: {deepgram_url}")
        await websocket.close(code=1011, reason=error_msg[:123])
    except Exception as exc:
        # Handle other connection errors (network issues, timeouts, etc.)
        error_msg = f"Deepgram WebSocket error: {type(exc).__name__}: {exc}"
        logger.error(error_msg, exc_info=True)
        logger.error(f"Deepgram URL: {deepgram_url}")
        logger.error(f"Deepgram params: {params}")
        await websocket.close(code=1011, reason=str(exc)[:123])
