import Image from "next/image";
import Link from "next/link";
import LandingDemoVideo from "./components/LandingDemoVideo";
import LandingFeatureStory from "./components/LandingFeatureStory";
import PublicFooter from "./components/PublicFooter";
import PublicHeader from "./components/PublicHeader";
import { buttonStyles, cx } from "./components/buttonStyles";
import landingFruitPeach from "./assets/landing-fruit-peach-collage.jpg";
import landingFruitPlum from "./assets/landing-fruit-plum-collage.jpg";

export default function Home() {
  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-[#f7f9fc] text-[#111827]"
      style={{ colorScheme: "light" }}
    >
      <PublicHeader />

      <main className="flex-1">
        <section className="bg-[linear-gradient(180deg,#f7f9fc_0%,#f7f9fc_76%,#f2f5f8_100%)]">
          <div className="mx-auto w-full max-w-[74rem] px-5 pb-12 pt-9 sm:px-10 sm:pb-16 sm:pt-12 lg:px-12">
            <div className="max-w-[50rem]">
              <h1 className="text-balance font-serif text-[clamp(3rem,4vw,3.75rem)] font-normal leading-[0.98] tracking-[-0.025em] text-[#111827]">
                The chat for questions that lead to more questions.
              </h1>
              <p className="mt-5 max-w-[42rem] text-pretty font-sans text-[1.05rem] leading-[1.55] text-[#4b5563] sm:text-lg">
                Explore every follow-up without interrupting the
                conversation—or losing where you started.
              </p>
              <Link
                href="/home"
                className={cx(
                  "mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-[#3749ad] px-4 font-sans text-[13px] font-medium text-white hover:bg-[#2f3f96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3749ad]",
                  buttonStyles.transition
                )}
              >
                Try Orchard
              </Link>
            </div>

            <div className="relative mx-auto mt-10 w-[94%] max-w-[60rem] sm:mt-12">
              <div
                aria-hidden="true"
                className="absolute inset-0 translate-x-3 translate-y-3 overflow-hidden rounded-[1.4rem] sm:translate-x-6 sm:translate-y-6 sm:rounded-[1.75rem] lg:translate-x-8 lg:translate-y-8"
              >
                <Image
                  src={landingFruitPeach}
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 640px) 94vw, 60rem"
                  className="object-cover object-center"
                />
                <div className="absolute inset-0 bg-white/[0.06]" />
              </div>

              <figure className="relative z-10 overflow-hidden rounded-[1.4rem] border border-[#d8dee8] bg-white shadow-[0_34px_84px_-42px_rgba(31,42,72,0.58)] sm:rounded-[1.75rem]">
                <LandingDemoVideo
                  src="/demos/orchard-sleep-demo.mp4"
                  poster="/demos/orchard-sleep-demo-poster.jpg"
                  label="Orchard demo showing a conversation about sleep, an inline follow-up, and a branched conversation."
                  eager
                />
              </figure>
            </div>
          </div>
        </section>

        <LandingFeatureStory />

        <section className="relative isolate flex min-h-[44rem] overflow-hidden bg-[#17246e] text-white sm:min-h-[50rem]">
          <Image
            src={landingFruitPlum}
            alt=""
            fill
            sizes="100vw"
            className="-z-20 object-cover object-[25%_center] sm:object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(55,73,173,0.14),rgba(20,31,94,0.2)_55%,rgba(10,18,59,0.42))]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#dce2ef] via-[#dce2ef]/45 to-transparent"
          />

          <div className="relative z-10 mx-auto flex w-full max-w-[74rem] flex-col px-5 pt-24 sm:px-10 sm:pt-32 lg:px-12">
            <div className="mx-auto flex max-w-[42rem] flex-1 flex-col items-center justify-center pb-20 text-center sm:pb-24">
              <h2 className="text-balance font-serif text-[clamp(2.9rem,5vw,4.8rem)] font-normal leading-[0.96] tracking-[-0.03em]">
                Follow the thought all the way.
              </h2>
              <p className="mt-6 max-w-[34rem] text-pretty font-sans text-[1.05rem] leading-[1.65] text-white/75 sm:text-lg">
                Orchard gives every question room to go further, without losing
                where the conversation began.
              </p>
              <Link
                href="/home"
                className={cx(
                  "mt-8 inline-flex h-10 items-center justify-center rounded-lg bg-white px-4 font-sans text-[13px] font-medium text-[#253376] hover:bg-[#f0f2fb] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white",
                  buttonStyles.transition
                )}
              >
                Try Orchard
              </Link>
            </div>

            <PublicFooter tone="dark" />
          </div>
        </section>
      </main>
    </div>
  );
}
