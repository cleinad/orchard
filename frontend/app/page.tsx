import ThemeToggle from '@/app/components/ThemeToggle';

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fbfaf7] text-slate-950 dark:bg-[#060606] dark:text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-140px] h-72 w-72 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-400/30" />
        <div className="absolute bottom-[-160px] right-[-120px] h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-400/30" />
        <div className="absolute inset-x-0 top-[22%] h-px bg-gradient-to-r from-transparent via-slate-200/70 to-transparent dark:via-slate-700/60" />
      </div>

      <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between">
          <div>
            {/* <p className="text-xs text-slate-500 dark:text-slate-400">Novus</p> */}
            <h1 className="font-heading text-2xl text-slate-950 dark:text-white">
              Novus
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a
              href="/login"
              className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-800/80"
            >
              Login
            </a>
          </div>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center gap-12 text-center">
          <div className="space-y-6">
            <h1 className="font-heading text-4xl font-medium leading-tight text-slate-950 dark:text-white sm:text-5xl">
              Command your work with calm, voice-led clarity.
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-400">
              Novus turns spoken intent into Thread-native memory, with actions
              routed to your tools and committed only when you say so.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
            <button className="rounded-xl bg-slate-900 px-6 py-3 font-medium text-white shadow-sm transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              Start talking
            </button>
            {/* <button className="rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white">
              Watch a 90-second demo
            </button> */}
          </div>

          <div className="w-full max-w-3xl rounded-2xl border border-slate-200/70 bg-white/80 p-6 text-left shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-heading text-sm text-slate-500 dark:text-slate-400">
                Live thread
              </span>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-500">
                Recording
              </span>
            </div>
            <div className="mt-5 rounded-2xl border border-slate-200/70 bg-white px-4 py-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              “Summarize the pivot discussion and draft next actions.”
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-400">
              <span className="rounded-full border border-slate-200/80 px-3 py-1 dark:border-slate-800">
                Intent routing
              </span>
              <span className="rounded-full border border-slate-200/80 px-3 py-1 dark:border-slate-800">
                Thread memory
              </span>
              <span className="rounded-full border border-slate-200/80 px-3 py-1 dark:border-slate-800">
                Commit gating
              </span>
            </div>
          </div>
        </section>

        <footer className="flex flex-col items-start justify-between gap-3 border-t border-slate-200/60 pt-6 text-xs text-slate-400 dark:border-slate-800 sm:flex-row sm:items-center">
          <span>© 2026 Novus</span>
          <span>Built for deliberate, voice-led work</span>
        </footer>
      </main>
    </div>
  );
}
