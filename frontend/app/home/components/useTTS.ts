import { useCallback, useRef, useState } from 'react';

export type TTSStatus = 'idle' | 'loading' | 'playing' | 'error';

export function useTTS() {
  const [status, setStatus] = useState<TTSStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (readerRef.current) {
      readerRef.current.cancel().catch(() => {});
      readerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setStatus('idle');
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Stop any ongoing playback
    stop();

    setStatus('loading');
    setError(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Track timing for verification
    const startTime = performance.now();
    console.log('[TTS] Request started at', startTime.toFixed(2), 'ms');

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `TTS request failed: ${response.status}`);
      }

      const body = response.body;
      const canStream = !!body
        && typeof MediaSource !== 'undefined'
        && MediaSource.isTypeSupported('audio/mpeg');

      console.log('[TTS] Streaming mode:', canStream ? 'MediaSource (streaming)' : 'Blob (buffered)');

      if (canStream) {
        // Streaming playback — audio starts as the first chunks arrive
        const mediaSource = new MediaSource();
        const url = URL.createObjectURL(mediaSource);
        objectUrlRef.current = url;

        const audio = new Audio();
        audio.src = url;
        audioRef.current = audio;

        audio.onended = () => {
          if (abortController.signal.aborted) return;
          console.log('[TTS] Playback ended');
          setStatus('idle');
        };
        audio.onerror = () => {
          if (abortController.signal.aborted) return;
          setStatus('error');
          setError('Failed to play audio');
        };

        mediaSource.addEventListener('sourceopen', async () => {
          const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
          const reader = body.getReader();
          readerRef.current = reader;
          let started = false;
          const queue: Uint8Array[] = [];
          let streamDone = false;
          let chunkCount = 0;
          let totalBytes = 0;
          let firstChunkTime: number | null = null;
          let playbackStartTime: number | null = null;

          const flush = () => {
            if (sourceBuffer.updating || queue.length === 0) return;
            if (mediaSource.readyState !== 'open') return;
            try {
              sourceBuffer.appendBuffer(queue.shift()!.buffer as ArrayBuffer);
            } catch {
              // MediaSource may have been detached by stop()
            }
          };

          sourceBuffer.addEventListener('updateend', () => {
            if (queue.length > 0) {
              flush();
            } else if (streamDone && mediaSource.readyState === 'open') {
              try { mediaSource.endOfStream(); } catch { /* already ended */ }
            }
          });

          try {
            while (true) {
              if (abortController.signal.aborted) return;
              const { done, value } = await reader.read();
              if (done) {
                streamDone = true;
                readerRef.current = null;
                const endTime = performance.now();
                const totalTime = endTime - startTime;
                console.log('[TTS] Stream complete:', {
                  chunks: chunkCount,
                  totalBytes,
                  totalTime: `${totalTime.toFixed(2)}ms`,
                  timeToFirstChunk: firstChunkTime ? `${(firstChunkTime - startTime).toFixed(2)}ms` : 'N/A',
                  timeToPlayback: playbackStartTime ? `${(playbackStartTime - startTime).toFixed(2)}ms` : 'N/A',
                  streamingLatency: playbackStartTime && firstChunkTime ? `${(playbackStartTime - firstChunkTime).toFixed(2)}ms` : 'N/A',
                });
                if (!sourceBuffer.updating && queue.length === 0 && mediaSource.readyState === 'open') {
                  try { mediaSource.endOfStream(); } catch { /* already ended */ }
                }
                break;
              }
              
              // Track first chunk arrival
              if (firstChunkTime === null) {
                firstChunkTime = performance.now();
                console.log('[TTS] First chunk received at', `${(firstChunkTime - startTime).toFixed(2)}ms`, 'after request start');
              }
              
              chunkCount++;
              totalBytes += value.length;
              queue.push(value);
              flush();

              if (!started && !abortController.signal.aborted) {
                started = true;
                playbackStartTime = performance.now();
                console.log('[TTS] Playback started at', `${(playbackStartTime - startTime).toFixed(2)}ms`, 'after request start');
                console.log('[TTS] Started playing after', chunkCount, 'chunk(s),', totalBytes, 'bytes received');
                setStatus('playing');
                audio.play().catch(() => {
                  if (abortController.signal.aborted) return;
                  setStatus('error');
                  setError('Browser blocked audio playback');
                });
              }
            }
          } catch {
            if (!abortController.signal.aborted) {
              setStatus('error');
              setError('Streaming playback failed');
            }
          }
        }, { once: true });
      } else {
        // Fallback: buffer then play (abort still kills the download mid-stream)
        const blobStartTime = performance.now();
        console.log('[TTS] Buffering entire response...');
        const audioBlob = await response.blob();
        const blobEndTime = performance.now();
        const bufferTime = blobEndTime - blobStartTime;
        console.log('[TTS] Blob buffered:', {
          size: `${(audioBlob.size / 1024).toFixed(2)} KB`,
          bufferTime: `${bufferTime.toFixed(2)}ms`,
          totalTimeToBuffer: `${(blobEndTime - startTime).toFixed(2)}ms`,
        });
        if (abortController.signal.aborted) return;

        const url = URL.createObjectURL(audioBlob);
        objectUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onplay = () => {
          const playTime = performance.now();
          console.log('[TTS] Playback started (buffered mode) at', `${(playTime - startTime).toFixed(2)}ms`, 'after request start');
          setStatus('playing');
        };
        audio.onended = () => setStatus('idle');
        audio.onerror = () => {
          setStatus('error');
          setError('Failed to play audio');
        };

        await audio.play();
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStatus('idle');
        return;
      }
      setStatus('error');
      setError(err instanceof Error ? err.message : 'TTS failed');
    }
  }, [stop]);

  return {
    status,
    error,
    speak,
    stop,
    isPlaying: status === 'playing',
    isLoading: status === 'loading',
  };
}
