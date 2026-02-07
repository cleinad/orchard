import { useCallback, useRef, useState } from 'react';

export type TTSStatus = 'idle' | 'loading' | 'playing' | 'error';

export function useTTS() {
  const [status, setStatus] = useState<TTSStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
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

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => setStatus('playing');
      audio.onended = () => {
        setStatus('idle');
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setStatus('error');
        setError('Failed to play audio');
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
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
