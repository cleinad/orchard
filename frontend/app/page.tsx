import type { CSSProperties } from "react";

// Subtext: Satoshi (same stack as `lib/body-font.ts`); hero title stays Fraunces via `font-heading`.
const subtextStyle = {
  fontFamily: '"Satoshi", system-ui, sans-serif',
};

/**
 * Full-viewport backdrop (fixed + inline styles):
 * - `body` uses theme `--background` (often near-black in dark mode); `absolute inset-0` layers
 *   inside a `min-h-*` wrapper can fail to cover the viewport in some layouts, so the dark body
 *   shows through and the gradient “disappears”.
 * - Inline `backgroundImage` avoids relying on Tailwind arbitrary `bg-[linear-gradient(...)]`
 *   and keeps multi-stop gradients reliable across builds.
 * - `colorScheme: "light"` keeps browser UI heuristics from fighting a light marketing surface
 *   while `html` may still have `color-scheme: dark` from the theme script.
 */
const landingBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 0,
  pointerEvents: "none",
  colorScheme: "light",
  backgroundColor: "#cfe0f4",
  backgroundImage: [
    // Soft top highlight (not near-opaque white — that was washing out all blue).
    "radial-gradient(ellipse 120% 90% at 50% 0%, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 55%)",
    // Side glows (replaces separate blurred divs so we don’t depend on filter/compositing quirks).
    "radial-gradient(circle at 50% 0%, rgba(124, 147, 184, 0.22) 0%, rgba(124, 147, 184, 0) 72%)",
    "radial-gradient(circle at 100% 22%, rgba(176, 197, 224, 0.35) 0%, rgba(176, 197, 224, 0) 70%)",
    "radial-gradient(ellipse at 50% 100%, rgba(159, 182, 212, 0.35) 0%, rgba(159, 182, 212, 0) 72%)",
    // Base vertical blue wash.
    "linear-gradient(180deg, #ffffff 0%, #f2f7fd 36%, #b9d0ec 100%)",
  ].join(", "),
};

export default function Home() {
  return (
    <div className="relative min-h-[100dvh]" style={{ colorScheme: "light" }}>
      <div aria-hidden="true" style={landingBackdropStyle} />

      <div className="relative z-10 flex min-h-[100dvh] flex-col px-6 pb-10 pt-7 sm:px-10 sm:pt-9 lg:px-14">
        <header className="flex w-full items-center justify-between">
          <a
            href="/"
            className="font-heading text-[1.4rem] tracking-[-0.04em] text-neutral-900"
          >
            Keen
          </a>
          <a
            href="/login"
            className="text-sm text-neutral-600 transition hover:text-neutral-900"
          >
            Log in
          </a>
        </header>

        <main className="flex flex-1 items-center justify-center">
          <section className="flex max-w-3xl flex-col items-center text-center">
            {/* Slightly relaxed leading so “A workspace for” / “deep exploration.” don’t collide when the headline wraps */}
            <h1 className="max-w-4xl font-heading text-[clamp(3.4rem,9vw,6.8rem)] leading-[1.08] tracking-[-0.065em] text-neutral-900">
              A workspace for deep exploration.
            </h1>
            <p
              className="mt-6 max-w-2xl text-[1.08rem] leading-[1.7] text-neutral-600 sm:text-[1.22rem]"
              style={subtextStyle}
            >
              Research deeply, branch into new questions, and build
              understanding over time without restarting from scratch.
            </p>
            <div className="mt-10">
              <a
                href="/home"
                className="inline-flex items-center justify-center rounded-full bg-neutral-900 px-6 py-3 text-sm text-white transition hover:opacity-90"
              >
                Start exploring
              </a>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
