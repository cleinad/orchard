'use client';

import ThemePicker from '@/app/components/ThemePicker';
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
        <span className="ml-px inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-pulse bg-muted/70" />
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
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-stone-200/20 blur-[120px] dark:bg-stone-800/15" />
        <div className="absolute -bottom-32 -right-32 h-[400px] w-[400px] rounded-full bg-stone-200/30 blur-[100px] dark:bg-stone-800/20" />
        <div className="absolute left-1/2 top-1/3 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-stone-100/15 blur-[80px] dark:bg-stone-800/10" />
      </div>

      <main
        className={`relative mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-8 sm:px-10 transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Header */}
        <header className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-heading text-lg text-foreground">
              Keen
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemePicker />
            <a
              href="/login"
              className="rounded-lg px-4 py-2 text-sm text-muted transition hover:text-foreground"
            >
              Log in
            </a>
            <a
              href="/home"
              className="rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-sm transition hover:opacity-80"
            >
              Get started
            </a>
          </div>
        </header>

        {/* Hero */}
        <section className="flex flex-1 flex-col items-center justify-center pb-16 pt-12">
          <div className="flex max-w-2xl flex-col items-center text-center">
            <div
              className={`mb-6 inline-flex items-center gap-2 rounded-full border border-muted/20 bg-surface/50 px-3.5 py-1.5 text-xs tracking-wide text-muted transition-all duration-500 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
              style={{ transitionDelay: '100ms' }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted" />
              Private by design
            </div>

            <h1
              className={`font-heading text-[2.75rem] font-normal leading-[1.15] tracking-tight text-foreground sm:text-5xl transition-all duration-600 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
              style={{ transitionDelay: '200ms' }}
            >
              Your voice becomes
              <br />
              <span className="text-muted">structure.</span>
            </h1>

            <p
              className={`mt-6 max-w-md text-base leading-relaxed text-muted transition-all duration-600 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
              style={{ transitionDelay: '350ms' }}
            >
              Speak naturally. Keen listens, organizes your thoughts into
              threads, routes actions to your tools — and commits nothing
              without your word.
            </p>

            <div
              className={`mt-10 flex items-center gap-3 transition-all duration-500 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
              style={{ transitionDelay: '500ms' }}
            >
              <a
                href="/home"
                className="group flex items-center gap-2 rounded-xl bg-foreground px-6 py-3 text-sm text-background shadow-md transition hover:opacity-80"
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
              <span className="text-xs text-muted">
                No setup required
              </span>
            </div>
          </div>

          {/* Thread preview card */}
          <div
            className={`mt-20 w-full max-w-lg transition-all duration-700 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`}
            style={{ transitionDelay: '650ms' }}
          >
            <div className="rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
              {/* Card header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500/80" />
                  <span className="text-xs font-medium text-muted">
                    Thread &mdash; Product sync
                  </span>
                </div>
                <span className="text-xs tracking-wider text-muted/60 uppercase">
                  Now
                </span>
              </div>

              {/* Transcript line */}
              <div className="mt-4 rounded-xl bg-foreground/[0.03] px-4 py-3.5 dark:bg-foreground/[0.04]">
                <p className="text-sm leading-relaxed text-foreground/80">
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
                      className="rounded-md bg-foreground/[0.03] px-2.5 py-1 text-xs text-muted ring-1 ring-black/[0.04] dark:bg-foreground/[0.04] dark:ring-white/[0.06]"
                    >
                      {tag}
                    </span>
                  ),
                )}
              </div>
            </div>

            {/* Floating subcard */}
            <div className="mx-4 -mt-px rounded-b-xl bg-foreground/[0.02] px-4 py-2.5 ring-1 ring-black/[0.04] ring-t-0 dark:bg-foreground/[0.02] dark:ring-white/[0.04]">
              <div className="flex items-center justify-between text-xs text-muted/70">
                <span>3 actions queued</span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1 w-1 rounded-full bg-muted/50" />
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
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-black/[0.04] sm:grid-cols-3 dark:bg-white/[0.04]">
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
                className="bg-surface px-5 py-5"
              >
                <h3 className="text-sm font-medium text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col items-start justify-between gap-3 border-t border-black/[0.06] pt-6 text-xs text-muted dark:border-white/[0.06] sm:flex-row sm:items-center">
          <span>&copy; 2026 Keen</span>
          <span>Deliberate, voice-led work</span>
        </footer>
      </main>
    </div>
  );
}
