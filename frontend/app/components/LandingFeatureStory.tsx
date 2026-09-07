"use client";

import { useEffect, useRef, useState } from "react";
import LandingDemoVideo from "./LandingDemoVideo";

const features = [
  {
    name: "Ask without losing your place.",
    description:
      "Inline threads open beside any part of an answer, so you can explore the detail without derailing the conversation.",
    video: "/demos/orchard-inline-thread-demo.mp4",
    poster: "/demos/orchard-inline-thread-demo-poster.jpg",
    videoLabel:
      "Orchard demo showing an inline follow-up about how long non-REM sleep lasts.",
    chapterBackground:
      "bg-[radial-gradient(82%_80%_at_82%_60%,rgba(181,64,84,0.065)_0%,rgba(181,64,84,0.03)_42%,transparent_70%),linear-gradient(180deg,#f2f5f8_0%,#f4f3f5_30%,#f7eef1_62%,#f7eef1_82%,#eff3e7_100%)]",
  },
  {
    name: "Explore another path. Keep the first.",
    description:
      "Conversation branches begin from any response and preserve the original, so you can move freely between different directions.",
    video: "/demos/orchard-branching-demo.mp4",
    poster: "/demos/orchard-branching-demo-poster.jpg",
    videoLabel:
      "Orchard demo showing a new conversation branch created from the sleep discussion.",
    chapterBackground:
      "bg-[linear-gradient(180deg,#eff3e7_0%,#eff3e7_82%,#e5e9f6_100%)]",
  },
  {
    name: "Get the depth you need.",
    description:
      "Response style sets the length and explanation level for each chat, without making you repeat your preferences.",
    video: "/demos/orchard-response-style-demo.mp4",
    poster: "/demos/orchard-response-style-demo-poster.jpg",
    videoLabel:
      "Orchard demo showing response length and knowledge-level settings for a Chinese sushi-ordering lesson.",
    chapterBackground:
      "bg-[linear-gradient(180deg,#e5e9f6_0%,#e5e9f6_82%,#dce2ef_100%)]",
  },
] as const;

function FeatureMedia({
  feature,
  visible,
}: {
  feature: (typeof features)[number];
  visible: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[1.25rem] border border-white/80 bg-white shadow-[0_28px_70px_-38px_rgba(24,33,58,0.55)] transition duration-700 ease-out motion-reduce:transform-none motion-reduce:opacity-100 motion-reduce:transition-none sm:rounded-[1.5rem] ${
        visible
          ? "translate-y-0 scale-100 opacity-100"
          : "translate-y-2 scale-100 opacity-100"
      }`}
    >
      <LandingDemoVideo
        src={feature.video}
        poster={feature.poster}
        label={feature.videoLabel}
      />
    </div>
  );
}

export default function LandingFeatureStory() {
  const [visibleFeatures, setVisibleFeatures] = useState(
    () => features.map(() => true)
  );
  const featureRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) {
      return;
    }

    const viewportBottom = window.innerHeight * 0.88;
    setVisibleFeatures(
      featureRefs.current.map((feature) => {
        if (!feature) return true;

        const rect = feature.getBoundingClientRect();
        const visibleHeight = Math.max(
          0,
          Math.min(rect.bottom, viewportBottom) - Math.max(rect.top, 0)
        );

        return visibleHeight / rect.height >= 0.18;
      })
    );

    const observer = new IntersectionObserver(
      (entries) => {
        const revealedIndexes = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => Number((entry.target as HTMLElement).dataset.index));

        if (revealedIndexes.length === 0) return;

        setVisibleFeatures((current) =>
          current.map(
            (isVisible, index) =>
              isVisible || revealedIndexes.includes(index)
          )
        );

        entries
          .filter((entry) => entry.isIntersecting)
          .forEach((entry) => observer.unobserve(entry.target));
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.18 }
    );

    featureRefs.current.forEach((feature) => {
      if (feature) observer.observe(feature);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <section
      aria-labelledby="landing-features-heading"
      className="relative w-full bg-[#f2f5f8]"
    >
      <h2 id="landing-features-heading" className="sr-only">
        What makes Orchard different
      </h2>

      {features.map((feature, index) => {
        const isVisible = visibleFeatures[index];
        const isReversed = index === 1;
        const isCentered = index === 2;

        return (
          <article
            key={feature.name}
            ref={(node) => {
              featureRefs.current[index] = node;
            }}
            data-index={index}
            className={`relative overflow-hidden ${feature.chapterBackground}`}
          >
            <div className="mx-auto w-full max-w-[74rem] px-5 sm:px-10 lg:px-12">
              {isCentered ? (
                <div className="py-20 sm:py-28 lg:pb-40 lg:pt-32">
                  <div
                    className={`mx-auto max-w-[43rem] text-center transition duration-700 ease-out motion-reduce:transform-none motion-reduce:opacity-100 motion-reduce:transition-none ${
                      isVisible
                        ? "translate-y-0 opacity-100"
                        : "translate-y-2 opacity-100"
                    }`}
                  >
                    <FeatureCopy feature={feature} centered />
                  </div>
                  <div className="mx-auto mt-10 max-w-[64rem] sm:mt-14">
                    <FeatureMedia feature={feature} visible={isVisible} />
                  </div>
                </div>
              ) : (
                <div
                  className={`grid items-center gap-10 py-20 sm:gap-14 sm:py-28 lg:gap-20 lg:py-36 ${
                    isReversed
                      ? "lg:grid-cols-[1.08fr_0.92fr]"
                      : "lg:grid-cols-2"
                  }`}
                >
                  <div
                    className={`max-w-[31rem] transition duration-700 ease-out motion-reduce:transform-none motion-reduce:opacity-100 motion-reduce:transition-none ${
                      isReversed ? "lg:order-2 lg:ml-auto" : ""
                    } ${
                      isVisible
                        ? "translate-y-0 opacity-100"
                        : "translate-y-2 opacity-100"
                    }`}
                  >
                    <FeatureCopy feature={feature} />
                  </div>
                  <div className={isReversed ? "lg:order-1" : ""}>
                    <FeatureMedia
                      feature={feature}
                      visible={isVisible}
                    />
                  </div>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function FeatureCopy({
  feature,
  centered = false,
}: {
  feature: (typeof features)[number];
  centered?: boolean;
}) {
  return (
    <>
      <h3 className="text-balance font-serif text-[clamp(2.5rem,3.8vw,3.75rem)] font-normal leading-[1.02] tracking-[-0.025em] text-[#111827]">
        {feature.name}
      </h3>
      <p
        className={`mt-5 max-w-xl text-pretty font-sans text-[1.05rem] leading-[1.65] text-[#4b5563] sm:text-lg ${
          centered ? "mx-auto" : ""
        }`}
      >
        {feature.description}
      </p>
    </>
  );
}
