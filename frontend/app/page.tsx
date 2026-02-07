'use client';

import ThemeToggle from '@/app/components/ThemeToggle';
import { useEffect, useState } from 'react';

function TypingText({ text, delay = 0 }: { text: string; delay?: number }) {
  const [displayed, setDisplayed] = useState('');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, 32);
    return () => clearInterval(interval);
  }, [started, text]);

  return (
    <span>
      {displayed}
      {started && displayed.length < text.length && (
        <span className="ml-px inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-pulse bg-amber-600/70 dark:bg-amber-400/70" />
      )}
    </span>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#faf9f6] text-stone-900 dark:bg-[#0c0c0b] dark:text-stone-100">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-amber-100/50 blur-[120px] dark:bg-amber-900/15" />
        <div className="absolute -bottom-32 -right-32 h-[400px] w-[400px] rounded-full bg-stone-200/40 blur-[100px] dark:bg-stone-800/20" />
        <div className="absolute left-1/2 top-1/3 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-orange-50/30 blur-[80px] dark:bg-orange-950/10" />
      </div>

      {/* Subtle grain overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
      />

      <main
        className={`relative mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-8 sm:px-10 transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-heading text-lg text-stone-900 dark:text-stone-100">
              Novus
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a
              href="/login"
              className="rounded-lg px-4 py-2 text-sm text-stone-600 transition hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            >
              Log in
            </a>
            <a
              href="/home"
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-stone-50 shadow-sm transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
            >
              Get started
            </a>
          </div>
        </header>

        {/* Hero */}
        <section className="flex flex-1 flex-col items-center justify-center pb-16 pt-12">
          <div className="flex max-w-2xl flex-col items-center text-center">
            <div
              className={`mb-6 inline-flex items-center gap-2 rounded-full border border-amber-200/60 bg-amber-50/50 px-3.5 py-1.5 text-xs tracking-wide text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300 transition-all duration-500 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
              style={{ transitionDelay: '100ms' }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
              Private by design
            </div>

            <h1
              className={`font-heading text-[2.75rem] font-normal leading-[1.15] tracking-tight text-stone-900 dark:text-stone-50 sm:text-5xl transition-all duration-600 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
              style={{ transitionDelay: '200ms' }}
            >
              Your voice becomes
              <br />
              <span className="text-stone-400 dark:text-stone-500">structure.</span>
            </h1>

            <p
              className={`mt-6 max-w-md text-base leading-relaxed text-stone-500 dark:text-stone-400 transition-all duration-600 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
              style={{ transitionDelay: '350ms' }}
            >
              Speak naturally. Novus listens, organizes your thoughts into
              threads, routes actions to your tools — and commits nothing
              without your word.
            </p>

            <div
              className={`mt-10 flex items-center gap-3 transition-all duration-500 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
              style={{ transitionDelay: '500ms' }}
            >
              <a
                href="/home"
                className="group flex items-center gap-2 rounded-xl bg-stone-900 px-6 py-3 text-sm text-stone-50 shadow-md shadow-stone-900/10 transition hover:bg-stone-800 hover:shadow-lg hover:shadow-stone-900/15 dark:bg-stone-100 dark:text-stone-900 dark:shadow-stone-100/5 dark:hover:bg-stone-200"
              >
                Start a thread
                <svg
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                  />
                </svg>
              </a>
              <span className="text-xs text-stone-400 dark:text-stone-500">
                No setup required
              </span>
            </div>
          </div>

          {/* Thread preview card */}
          <div
            className={`mt-20 w-full max-w-lg transition-all duration-700 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}
            style={{ transitionDelay: '650ms' }}
          >
            <div className="rounded-2xl border border-stone-200/80 bg-white/70 p-5 shadow-sm backdrop-blur-sm dark:border-stone-800/60 dark:bg-stone-900/50">
              {/* Card header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500/80" />
                  <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                    Thread &mdash; Product sync
                  </span>
                </div>
                <span className="text-[10px] tracking-wider text-stone-400 uppercase dark:text-stone-500">
                  Now
                </span>
              </div>

              {/* Transcript line */}
              <div className="mt-4 rounded-xl bg-stone-50/80 px-4 py-3.5 dark:bg-stone-800/40">
                <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                  &ldquo;
                  <TypingText
                    text="Summarize the pivot discussion, surface blockers, and draft next actions for the team."
                    delay={1200}
                  />
                  &rdquo;
                </p>
              </div>

              {/* Tags */}
              <div className="mt-3.5 flex flex-wrap gap-2">
                {['Summarize', 'Extract blockers', 'Draft actions'].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-stone-200/80 bg-stone-50/50 px-2.5 py-1 text-[11px] text-stone-400 dark:border-stone-700/60 dark:bg-stone-800/30 dark:text-stone-500"
                    >
                      {tag}
                    </span>
                  ),
                )}
              </div>
            </div>

            {/* Floating subcard */}
            <div className="mx-4 -mt-px rounded-b-xl border border-t-0 border-stone-200/50 bg-stone-50/50 px-4 py-2.5 dark:border-stone-800/40 dark:bg-stone-900/30">
              <div className="flex items-center justify-between text-[11px] text-stone-400 dark:text-stone-500">
                <span>3 actions queued</span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1 w-1 rounded-full bg-amber-500/70" />
                  Awaiting approval
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Features strip */}
        <section
          className={`mb-16 transition-all duration-700 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
          style={{ transitionDelay: '800ms' }}
        >
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-stone-200/70 bg-stone-200/50 sm:grid-cols-3 dark:border-stone-800/50 dark:bg-stone-800/30">
            {[
              {
                title: 'Voice-native',
                desc: 'Speak freely. Your words are transcribed, structured, and understood in real time.',
              },
              {
                title: 'Thread memory',
                desc: 'Every conversation persists as a searchable, referenceable thread you control.',
              },
              {
                title: 'Commit gating',
                desc: 'Actions are proposed, never forced. Nothing happens until you give the word.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-white/60 px-5 py-5 dark:bg-stone-900/40"
              >
                <h3 className="text-sm font-medium text-stone-800 dark:text-stone-200">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col items-start justify-between gap-3 border-t border-stone-200/50 pt-6 text-xs text-stone-400 dark:border-stone-800/40 dark:text-stone-500 sm:flex-row sm:items-center">
          <span>&copy; 2026 Novus</span>
          <span>Deliberate, voice-led work</span>
        </footer>
      </main>
    </div>
  );
}
