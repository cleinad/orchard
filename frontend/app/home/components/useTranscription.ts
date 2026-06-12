import { useCallback, useRef, useState } from 'react';

export type TranscriptStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface UseTranscriptionProps {
  onStop?: () => void;
}

interface DeepgramTokenResponse {
  accessToken: string;
  expiresIn: number;
}

function isDeepgramTokenResponse(value: unknown): value is DeepgramTokenResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const response = value as Record<string, unknown>;
  return (
    typeof response.accessToken === 'string' &&
    response.accessToken.length > 0 &&
    typeof response.expiresIn === 'number'
  );
}

async function createDeepgramToken() {
  const response = await fetch('/api/deepgram/token', { method: 'POST' });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String(data.error)
        : 'Unable to create Deepgram token';
    throw new Error(message);
  }

  if (!isDeepgramTokenResponse(data)) {
    throw new Error('Invalid Deepgram token response');
  }

  return data;
}

export function useTranscription({ onStop }: UseTranscriptionProps = {}) {
  const [status, setStatus] = useState<TranscriptStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sessionRef = useRef(0);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    mediaRecorderRef.current = null;

    const ws = wsRef.current;
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    ) {
      ws.close();
    }
    wsRef.current = null;
    setStatus('idle');
    setError(null);
    setInterimTranscript('');
    onStop?.();
  }, [onStop]);

  const clearTranscript = useCallback(() => {
    setFinalTranscript('');
    setInterimTranscript('');
  }, []);

  const start = useCallback(
    async (stream: MediaStream, sessionId: number) => {
      const isStale = () => sessionRef.current !== sessionId;
      sessionRef.current = sessionId;

      if (isStale()) {
        return;
      }
      if (typeof MediaRecorder === 'undefined') {
        if (isStale()) {
          return;
        }
        setStatus('error');
        setError('MediaRecorder is not supported in this browser.');
        return;
      }

      const mimeTypeCandidates = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/webm',
      ];
      const selectedMimeType = mimeTypeCandidates.find((candidate) =>
        MediaRecorder.isTypeSupported(candidate)
      );

      let recorder: MediaRecorder;
      try {
        recorder = selectedMimeType
          ? new MediaRecorder(stream, { mimeType: selectedMimeType })
          : new MediaRecorder(stream);
      } catch (error) {
        if (isStale()) {
          return;
        }
        setStatus('error');
        setError('Unable to capture audio for transcription.');
        return;
      }

      const recorderMimeType =
        recorder.mimeType || selectedMimeType || 'audio/webm;codecs=opus';
      const wsUrl = new URL('wss://api.deepgram.com/v1/listen');
      wsUrl.searchParams.set('model', 'nova-2');
      wsUrl.searchParams.set('interim_results', 'true');
      wsUrl.searchParams.set('punctuate', 'true');
      wsUrl.searchParams.set('smart_format', 'true');
      wsUrl.searchParams.set('content-type', recorderMimeType);

      setStatus('connecting');
      setError(null);
      setFinalTranscript('');
      setInterimTranscript('');

      if (isStale()) {
        return;
      }

      let token: DeepgramTokenResponse;
      try {
        token = await createDeepgramToken();
      } catch (error) {
        if (isStale()) {
          return;
        }
        setStatus('error');
        setError(
          error instanceof Error
            ? `Cannot start transcription: ${error.message}`
            : 'Cannot start transcription.'
        );
        return;
      }

      if (isStale()) {
        return;
      }

      // Untested in a real browser/mic flow; this follows Deepgram's browser auth docs.
      const ws = new WebSocket(wsUrl.toString(), ['token', token.accessToken]);
      wsRef.current = ws;

      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(event.data);
        }
      };

      ws.onopen = () => {
        if (isStale()) {
          ws.close();
          return;
        }
        setStatus('connected');
        recorder.start(250);
      };

      ws.onclose = (event) => {
        const closeInfo = {
          code: event.code,
          reason: event.reason || 'No reason provided',
          wasClean: event.wasClean,
          url: wsUrl.toString(),
        };
        console.error('[Deepgram] WebSocket connection closed:', closeInfo);

        const closeCodeMessages: Record<number, string> = {
          1000: 'Connection closed normally',
          1001: 'Connection going away',
          1002: 'Protocol error',
          1003: 'Unsupported data type',
          1006: 'Connection closed abnormally',
          1011: 'Server error',
          1012: 'Service restart',
          1013: 'Try again later',
          1014: 'Bad gateway',
          1015: 'TLS handshake failed',
        };

        if (recorder.state !== 'inactive') {
          recorder.stop();
        }

        if (isStale()) {
          return;
        }

        if (!event.wasClean && event.code !== 1000) {
          setStatus('error');
          let errorMsg = closeCodeMessages[event.code] || `Connection closed (code: ${event.code})`;
          if (event.reason) {
            errorMsg += `: ${event.reason}`;
          }
          if (event.code === 1006) {
            errorMsg += '. Check Deepgram connectivity and token configuration.';
          }
          setError(errorMsg);
        } else {
          setStatus('idle');
        }
      };

      ws.onerror = (error) => {
        console.error('[Deepgram] WebSocket connection error:', error);

        if (isStale()) {
          return;
        }
        setStatus('error');
        const errorMsg = ws.readyState === WebSocket.CLOSED
          ? 'Failed to establish Deepgram WebSocket connection.'
          : 'Deepgram WebSocket connection error occurred.';
        setError(errorMsg);
      };

      ws.onmessage = (event) => {
        if (isStale()) {
          return;
        }
        try {
          const message = JSON.parse(event.data);
          const transcript = message?.channel?.alternatives?.[0]?.transcript as
            | string
            | undefined;
          if (!transcript) {
            return;
          }
          if (message?.is_final) {
            setFinalTranscript((prev) =>
              prev ? `${prev} ${transcript}` : transcript
            );
            setInterimTranscript('');
          } else {
            setInterimTranscript(transcript);
          }
        } catch (error) {
          // Ignore malformed messages.
        }
      };
    },
    [onStop]
  );

  return {
    status,
    error,
    finalTranscript,
    interimTranscript,
    start,
    stop,
    clearTranscript,
  };
}
