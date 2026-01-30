"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

import ThemeToggle from '@/app/components/ThemeToggle';

type MicStatus = 'idle' | 'listening' | 'blocked' | 'error';

function MicDodecahedron() {
  return (
    <svg viewBox="0 0 120 120" className="h-12 w-12">
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

function MicVisualizer() {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<MicStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lineRef = useRef<SVGPolylineElement | null>(null);
  const glowRef = useRef<SVGPolylineElement | null>(null);
  const visualRef = useRef<HTMLDivElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef(0);

  const stopMic = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    dataRef.current = null;
    setActive(false);
    setStatus('idle');
    if (visualRef.current) {
      visualRef.current.style.setProperty('--mic-glow', '0');
    }
  }, []);

  const animateLine = useCallback(() => {
    const analyser = analyserRef.current;
    const data = dataRef.current;
    const line = lineRef.current;
    const glow = glowRef.current;
    const visual = visualRef.current;
    if (!analyser || !data || !line || !glow || !visual) {
      return;
    }

    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const value = (data[i] - 128) / 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / data.length);
    const intensity = Math.min(1, rms * 3.2);
    const baseAmplitude = 6 + intensity * 18;
    const width = 240;
    const height = 60;
    const mid = height / 2;
    const segments = 48;
    phaseRef.current += 0.08 + intensity * 0.18;

    const points: string[] = [];
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const wave =
        Math.sin(t * Math.PI * 4 + phaseRef.current) +
        0.55 * Math.sin(t * Math.PI * 9 - phaseRef.current * 1.2);
      const falloff = Math.sin(Math.PI * t);
      const y = mid + wave * baseAmplitude * falloff;
      const x = t * width;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }

    const pointString = points.join(' ');
    line.setAttribute('points', pointString);
    glow.setAttribute('points', pointString);
    visual.style.setProperty('--mic-glow', (0.18 + intensity * 0.75).toFixed(2));

    rafRef.current = requestAnimationFrame(animateLine);
  }, []);

  const startMic = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setErrorMessage('Microphone access is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextConstructor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextConstructor) {
        setStatus('error');
        setErrorMessage('Audio context is unavailable in this browser.');
        return;
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

      const data = new Uint8Array(analyser.fftSize);
      analyserRef.current = analyser;
      dataRef.current = data;
      audioContextRef.current = audioContext;
      streamRef.current = stream;
      setActive(true);
      setStatus('listening');
      setErrorMessage(null);

      rafRef.current = requestAnimationFrame(animateLine);
    } catch (error) {
      setStatus('blocked');
      setErrorMessage('Microphone permission was denied.');
    }
  }, [animateLine]);

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

  return (
    <div className="mt-6 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          aria-pressed={active}
          onClick={toggleMic}
          className={`group relative flex h-16 w-16 items-center justify-center rounded-2xl border transition ${
            active
              ? 'border-sky-400/70 bg-sky-200/40 shadow-[0_0_24px_rgba(56,189,248,0.25)] dark:border-sky-400/70 dark:bg-sky-500/10'
              : 'border-slate-200 bg-white/90 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/70'
          }`}
        >
          <span
            className={`absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-sky-300/40 via-indigo-300/30 to-emerald-300/30 opacity-0 blur-2xl transition ${
              active ? 'opacity-100' : 'group-hover:opacity-80'
            }`}
          />
          <MicDodecahedron />
          <span className="sr-only">
            {active ? 'Disable microphone' : 'Enable microphone'}
          </span>
        </button>

        <div className="min-w-[200px] flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {active ? 'Mic open — talk to animate.' : 'Tap the dodecahedron to talk.'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Your voice energizes the line below.
          </p>

          <div
            ref={visualRef}
            className={`mt-3 overflow-hidden transition-all duration-500 ${
              active ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="relative h-16 w-full">
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
                  ref={lineRef}
                  className="mic-line"
                  points="0,30 240,30"
                />
                <polyline
                  ref={glowRef}
                  className="mic-line-glow"
                  points="0,30 240,30"
                />
              </svg>
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-sky-200/20 via-white/20 to-emerald-200/20 blur-xl" />
            </div>
          </div>

          {status === 'blocked' && (
            <p className="mt-2 text-xs text-amber-500">
              Microphone permission denied. Check browser settings.
            </p>
          )}
          {status === 'error' && errorMessage && (
            <p className="mt-2 text-xs text-rose-500">{errorMessage}</p>
          )}
        </div>
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

/**
 * Home page - protected by proxy.ts middleware
 * Only authenticated users can access this page (proxy redirects unauthenticated users to /login)
 */
export default function HomePage() {
  const threads = [
    {
      title: "Business Pivot",
      summary: "Refine launch narrative and timeline.",
      status: "2 open loops",
    },
    {
      title: "Recruiting",
      summary: "Schedule founder interview and debrief.",
      status: "1 open loop",
    },
    {
      title: "Health",
      summary: "Draft nutrition plan and training cadence.",
      status: "0 open loops",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fbfaf7] text-slate-950 dark:bg-[#060606] dark:text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-140px] h-72 w-72 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-400/30" />
        <div className="absolute bottom-[-160px] right-[-120px] h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-400/30" />
        <div className="absolute inset-x-0 top-[18%] h-px bg-gradient-to-r from-transparent via-slate-200/70 to-transparent dark:via-slate-700/60" />
      </div>

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Novus</p>
            <h1 className="font-heading text-2xl text-slate-950 dark:text-white">
              Voice session
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-800/80">
              End session
            </button>
          </div>
        </header>

        <section className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
              <h2 className="font-heading text-lg text-slate-950 dark:text-white">
                Next actions
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <li className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                  Draft follow-up email for two prospects.
                </li>
                <li className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                  Schedule 30-min internal debrief.
                </li>
                <li className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                  Summarize objections into the pivot thread.
                </li>
              </ul>
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg text-slate-950 dark:text-white">
                Threads
              </h2>
              <button className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white">
                New
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm text-slate-600 dark:text-slate-300">
              {threads.map((thread) => (
                <div
                  key={thread.title}
                  className="rounded-xl border border-slate-200/70 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <p className="font-heading text-base text-slate-900 dark:text-white">
                    {thread.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {thread.summary}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">{thread.status}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="mt-8">
          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-heading text-sm text-slate-500 dark:text-slate-400">
                Talking area
              </span>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-500">
                Listening
              </span>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200/70 bg-white px-4 py-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              "Capture my thoughts from today's customer calls and propose next
              actions."
            </div>
            <MicVisualizer />
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-400">
              <span className="rounded-full border border-slate-200/80 px-3 py-1 dark:border-slate-800">
                Hold to talk
              </span>
              <span className="rounded-full border border-slate-200/80 px-3 py-1 dark:border-slate-800">
                Auto transcript
              </span>
              <span className="rounded-full border border-slate-200/80 px-3 py-1 dark:border-slate-800">
                Commit gating
              </span>
            </div>
          </div>
        </section>

        <footer className="mt-auto flex flex-col items-start justify-between gap-3 border-t border-slate-200/60 pt-6 text-xs text-slate-400 dark:border-slate-800 sm:flex-row sm:items-center">
          <span>© 2026 Novus</span>
          <span>Voice-first control panel</span>
        </footer>
      </main>
    </div>
  );
}
