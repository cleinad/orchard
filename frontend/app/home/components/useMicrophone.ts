import { useCallback, useRef, useState } from 'react';

export type MicStatus = 'idle' | 'listening' | 'blocked' | 'error';

export function useMicrophone() {
  const [status, setStatus] = useState<MicStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startingRef = useRef(false);
  const sessionRef = useRef(0);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    if (startingRef.current) {
      return null;
    }
    startingRef.current = true;
    const sessionId = sessionRef.current + 1;
    sessionRef.current = sessionId;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setErrorMessage('Microphone access is not supported in this browser.');
      startingRef.current = false;
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (sessionRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return null;
      }

      const AudioContextConstructor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextConstructor) {
        setStatus('error');
        setErrorMessage('Audio context is unavailable in this browser.');
        stream.getTracks().forEach((track) => track.stop());
        startingRef.current = false;
        return null;
      }

      const audioContext = new AudioContextConstructor();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.85;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      analyserRef.current = analyser;
      audioContextRef.current = audioContext;
      streamRef.current = stream;
      setStatus('listening');
      setErrorMessage(null);

      startingRef.current = false;
      return { stream, analyser, sessionId };
    } catch (error) {
      setStatus('blocked');
      setErrorMessage('Microphone permission was denied.');
      startingRef.current = false;
      return null;
    }
  }, []);

  return {
    status,
    errorMessage,
    analyser: analyserRef.current,
    start,
    stop,
    sessionId: sessionRef.current,
  };
}
