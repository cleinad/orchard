import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioVisualization } from '@/app/home/components/useAudioVisualization';
import { useMicrophone } from '@/app/home/components/useMicrophone';
import { usePersistedBoolean } from '@/app/home/components/usePersistedBoolean';
import { useTranscription } from '@/app/home/components/useTranscription';
import { useTTS } from '@/app/home/components/useTTS';

export function useHomeVoice(ttsStorageKey: string) {
  const [ttsEnabled, setTtsEnabled] = usePersistedBoolean(ttsStorageKey, false);
  const [micActive, setMicActive] = useState(false);

  const tts = useTTS();
  const microphone = useMicrophone();
  const transcription = useTranscription();
  const visualization = useAudioVisualization({
    analyser: microphone.analyser,
    isActive: micActive,
  });

  const startMic = useCallback(async () => {
    tts.stop();
    const result = await microphone.start();
    if (!result) {
      return;
    }

    setMicActive(true);
    void transcription.start(result.stream, result.sessionId);
  }, [microphone, transcription, tts]);

  const stopMic = useCallback(() => {
    microphone.stop();
    transcription.stop();
    transcription.clearTranscript();
    setMicActive(false);
  }, [microphone, transcription]);

  const toggleTtsEnabled = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      if (!next) {
        tts.stop();
      }
      return next;
    });
  }, [setTtsEnabled, tts]);

  const microphoneRef = useRef(microphone);
  const transcriptionRef = useRef(transcription);
  microphoneRef.current = microphone;
  transcriptionRef.current = transcription;

  useEffect(() => {
    return () => {
      microphoneRef.current.stop();
      transcriptionRef.current.stop();
    };
  }, []);

  useEffect(() => {
    const hasTranscript =
      transcription.interimTranscript || transcription.finalTranscript;
    if (micActive && hasTranscript && (tts.isPlaying || tts.isLoading)) {
      tts.stop();
    }
  }, [
    micActive,
    transcription.finalTranscript,
    transcription.interimTranscript,
    tts,
  ]);

  return {
    micActive,
    ttsEnabled,
    tts,
    microphone,
    transcription,
    visualization,
    startMic,
    stopMic,
    toggleTtsEnabled,
  };
}
