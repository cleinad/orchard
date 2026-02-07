'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMicrophone } from './useMicrophone';
import { useAudioVisualization } from './useAudioVisualization';
import { useTranscription } from './useTranscription';

interface MicVisualizerProps {
  onSendTranscript?: (transcript: string) => void;
  onTranscriptUpdate?: (final: string, interim: string) => void;
  isProcessing?: boolean;
}

function MicDodecahedron() {
  return (
    <svg viewBox="0 0 120 120" className="h-20 w-20">
      <defs>
        <linearGradient id="micDodecaStroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke="url(#micDodecaStroke)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="60,8 108,38 90,102 30,102 12,38" />
        <polygon points="60,24 92,44 80,88 40,88 28,44" />
        <line x1="60" y1="8" x2="60" y2="24" />
        <line x1="108" y1="38" x2="92" y2="44" />
        <line x1="90" y1="102" x2="80" y2="88" />
        <line x1="30" y1="102" x2="40" y2="88" />
        <line x1="12" y1="38" x2="28" y2="44" />
        <line x1="60" y1="24" x2="108" y2="38" />
        <line x1="92" y1="44" x2="90" y2="102" />
        <line x1="80" y1="88" x2="30" y2="102" />
        <line x1="40" y1="88" x2="12" y2="38" />
      </g>
    </svg>
  );
}

export default function MicVisualizer({ onSendTranscript, onTranscriptUpdate, isProcessing }: MicVisualizerProps) {
  const [active, setActive] = useState(false);
  const microphone = useMicrophone();
  const transcription = useTranscription();
  const visualization = useAudioVisualization({
    analyser: microphone.analyser,
    isActive: active,
  });

  // Notify parent of transcript updates
  useEffect(() => {
    if (onTranscriptUpdate) {
      onTranscriptUpdate(transcription.finalTranscript, transcription.interimTranscript);
    }
  }, [transcription.finalTranscript, transcription.interimTranscript, onTranscriptUpdate]);

  const handleSendTranscript = useCallback(() => {
    const transcript = transcription.finalTranscript.trim();
    if (transcript && onSendTranscript) {
      onSendTranscript(transcript);
      // Clear the transcript after sending
      transcription.stop();
      microphone.stop();
      setActive(false);
    }
  }, [transcription, onSendTranscript, microphone]);

  const stopMic = useCallback(() => {
    microphone.stop();
    transcription.stop();
    setActive(false);
  }, [microphone, transcription]);

  const startMic = useCallback(async () => {
    const result = await microphone.start();
    if (result) {
      setActive(true);
      void transcription.start(result.stream, result.sessionId);
    }
  }, [microphone, transcription]);

  const toggleMic = useCallback(() => {
    if (active) {
      stopMic();
    } else {
      startMic();
    }
  }, [active, startMic, stopMic]);

  useEffect(() => {
    return () => {
      stopMic();
    };
  }, [stopMic]);

  const hasTranscript =
    transcription.finalTranscript.length > 0 || transcription.interimTranscript.length > 0;
  const showTranscriptPanel =
    active || hasTranscript || transcription.status !== 'idle';
  const transcriptBadge =
    transcription.status === 'connected'
      ? 'Live'
      : transcription.status === 'connecting'
      ? 'Connecting'
      : transcription.status === 'error'
      ? 'Error'
      : active
      ? 'Ready'
      : 'Idle';

  return (
    <div className="mt-6 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-100">
            {active ? 'Mic open — talk to animate.' : 'Click and start speaking'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Your voice energizes the line below.
          </p>
        </div>

        <div className="relative">
          <div
            ref={visualization.visualRef}
            className="relative h-20 w-full"
          >
            <svg
              viewBox="0 0 240 60"
              className="absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="micLineGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="50%" stopColor="#a78bfa" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
              </defs>
              <polyline
                ref={visualization.lineRef}
                className="mic-line"
                points="0,30 240,30"
              />
              <polyline
                ref={visualization.glowRef}
                className="mic-line-glow"
                points="0,30 240,30"
              />
            </svg>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-sky-200/20 via-white/20 to-emerald-200/20 blur-xl" />
          </div>

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              aria-pressed={active}
              onClick={toggleMic}
              className={`pointer-events-auto group relative z-10 flex h-24 w-24 items-center justify-center rounded-[28px] border transition ${
                active
                  ? 'border-sky-400/70 bg-sky-200/40 shadow-[0_0_28px_rgba(56,189,248,0.28)] dark:border-sky-400/70 dark:bg-sky-500/10'
                  : 'border-slate-200 bg-white/90 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/70'
              }`}
            >
              <span
                className={`absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-sky-300/40 via-indigo-300/30 to-emerald-300/30 opacity-0 blur-2xl transition ${
                  active ? 'opacity-100' : 'group-hover:opacity-80'
                }`}
              />
              <MicDodecahedron />
              <span className="sr-only">
                {active ? 'Disable microphone' : 'Enable microphone'}
              </span>
            </button>
          </div>
        </div>

        <div
          className={`rounded-xl border border-slate-200/70 bg-white/80 p-3 text-sm text-slate-700 shadow-inner transition-all duration-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 ${
            showTranscriptPanel ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
          }`}
          aria-live="polite"
        >
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-semibold uppercase tracking-wide">
              Transcript
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                transcription.status === 'connected'
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : transcription.status === 'connecting'
                  ? 'bg-sky-500/10 text-sky-500'
                  : transcription.status === 'error'
                  ? 'bg-rose-500/10 text-rose-500'
                  : 'bg-slate-500/10 text-slate-400'
              }`}
            >
              {transcriptBadge}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed">
            {hasTranscript ? (
              <>
                <span>{transcription.finalTranscript}</span>
                {transcription.interimTranscript && (
                  <span className="text-slate-400 italic">
                    {' '}
                    {transcription.interimTranscript}
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-400">
                Start talking to see live transcription.
              </span>
            )}
          </p>
          {transcription.error && (
            <p className="mt-2 text-xs text-rose-500">{transcription.error}</p>
          )}
          {transcription.finalTranscript.trim() && onSendTranscript && (
            <button
              type="button"
              onClick={handleSendTranscript}
              disabled={isProcessing}
              className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              {isProcessing ? 'Thinking...' : 'Send to Novus'}
            </button>
          )}
        </div>

        {microphone.status === 'blocked' && (
          <p className="text-xs text-amber-500">
            Microphone permission denied. Check browser settings.
          </p>
        )}
        {microphone.status === 'error' && microphone.errorMessage && (
          <p className="text-xs text-rose-500">{microphone.errorMessage}</p>
        )}
      </div>

      <style jsx>{`
        .mic-line {
          fill: none;
          stroke: #94a3b8;
          stroke-width: 1.4;
          opacity: 0.45;
        }

        .mic-line-glow {
          fill: none;
          stroke: url(#micLineGradient);
          stroke-width: 2.2;
          stroke-dasharray: 12 10;
          animation: mic-dash 2.8s linear infinite;
          opacity: var(--mic-glow, 0.2);
          filter: drop-shadow(
            0 0 12px rgba(56, 189, 248, var(--mic-glow, 0.2))
          );
        }

        @keyframes mic-dash {
          to {
            stroke-dashoffset: -44;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .mic-line-glow {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
