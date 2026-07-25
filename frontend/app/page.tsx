import Image from "next/image";
import Link from "next/link";
import OrchardBrand from "./components/OrchardBrand";
import orchardDuskBackdrop from "./assets/orchard-dusk-backdrop.png";

export default function Home() {
  return (
    <div
      className="relative min-h-[100dvh] overflow-hidden bg-[#111411] text-white"
      style={{ colorScheme: "dark" }}
    >
      <Image
        src={orchardDuskBackdrop}
        alt=""
        fill
        priority
        sizes="100vw"
        className="scale-[1.01] object-cover object-center"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,10,7,0.28),rgba(7,10,7,0.08)_42%,rgba(7,10,7,0.56)),linear-gradient(90deg,rgba(7,10,7,0.38),transparent_35%,transparent_70%,rgba(7,10,7,0.18))]"
      />

      <div className="relative z-10 flex min-h-[100dvh] flex-col px-5 pb-8 pt-5 sm:px-10 sm:pb-10 sm:pt-8 lg:px-14">
        <header className="flex w-full items-center justify-between">
          <OrchardBrand className="text-white" />
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center font-sans text-sm text-white/75 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            Log in
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center">
          <section className="flex w-full max-w-5xl -translate-y-[2vh] flex-col items-center px-1 text-center sm:-translate-y-[3vh]">
            <h1 className="max-w-4xl text-balance font-serif text-[clamp(3.2rem,7vw,6.4rem)] font-normal leading-[0.88] text-white">
              A place for ideas to grow.
            </h1>
            <p className="mt-6 max-w-2xl text-balance font-sans text-[1.05rem] leading-[1.6] text-white/80 sm:text-[1.2rem]">
              Research deeply, branch into new questions, and build
              understanding over time without restarting from scratch.
            </p>
            <div className="mt-9">
              <Link
                href="/home"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#27573e] bg-[#27573e] px-6 font-sans text-sm font-medium text-white shadow-[0_12px_34px_rgba(0,0,0,0.18)] transition hover:-translate-y-px hover:bg-[#31684b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transform-none"
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
