import Link from "next/link";
import { marketingBackdropStyle } from "@/lib/marketing-backdrop";

export default function Home() {
  return (
    <div className="relative min-h-[100dvh]" style={{ colorScheme: "light" }}>
      <div aria-hidden="true" style={marketingBackdropStyle} />

      <div className="relative z-10 flex min-h-[100dvh] flex-col px-6 pb-10 pt-7 sm:px-10 sm:pt-9 lg:px-14">
        <header className="flex w-full items-center justify-between">
          <Link
            href="/"
            className="font-heading text-[1.4rem] tracking-[-0.04em] text-neutral-900"
          >
            Keen
          </Link>
          <Link
            href="/login"
            className="font-sans text-sm text-neutral-600 transition hover:text-neutral-900"
          >
            Log in
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center">
          <section className="flex max-w-3xl flex-col items-center text-center">
            {/* Slightly relaxed leading so “A workspace for” / “deep exploration.” don’t collide when the headline wraps */}
            <h1 className="max-w-4xl font-heading text-[clamp(3.4rem,9vw,6.8rem)] leading-[1.08] tracking-[-0.065em] text-neutral-900">
              A workspace for deep exploration.
            </h1>
            {/* Fixed Satoshi via `font-sans`; hero title stays Fraunces (`font-heading`). Use `font-reading` when text should follow the user body-font setting. */}
            <p className="mt-6 max-w-2xl font-sans text-[1.08rem] leading-[1.7] text-neutral-600 sm:text-[1.22rem]">
              Research deeply, branch into new questions, and build
              understanding over time without restarting from scratch.
            </p>
            <div className="mt-10">
              <Link
                href="/home"
                className="inline-flex items-center justify-center rounded-full bg-neutral-900 px-6 py-3 font-sans text-sm text-white transition hover:opacity-90"
              >
                Start exploring
              </Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
