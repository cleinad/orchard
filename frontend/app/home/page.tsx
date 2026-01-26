import ThemeToggle from '@/app/components/ThemeToggle';

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

        <footer className="mt-auto flex flex-col items-start justify-between gap-3 border-t border-slate-200/60 pt-6 text-xs text-slate-400 dark:border-slate-800 sm:flex-row sm:items-center">
          <span>© 2026 Novus</span>
          <span>Voice-first control panel</span>
        </footer>
      </main>
    </div>
  );
}
