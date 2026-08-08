"use client";

import { useEffect, useRef } from "react";

type LandingDemoVideoProps = {
  src: string;
  poster: string;
  label: string;
  eager?: boolean;
  className?: string;
};

export default function LandingDemoVideo({
  src,
  poster,
  label,
  eager = false,
  className = "",
}: LandingDemoVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    const video = videoRef.current;
    if (!video) return;

    let isNearViewport = false;

    const syncPlayback = () => {
      if (reducedMotion.matches) {
        video.pause();
        video.currentTime = 0;
        return;
      }

      if (isNearViewport) {
        void video.play().catch(() => {
          // The poster remains visible if the browser blocks autoplay.
        });
      } else {
        video.pause();
      }
    };

    const syncReducedMotion = () => {
      syncPlayback();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isNearViewport = entry.isIntersecting;
        syncPlayback();
      },
      {
        rootMargin: eager ? "0px" : "80px 0px",
        threshold: eager ? 0.15 : 0.01,
      }
    );

    observer.observe(video);
    syncReducedMotion();
    reducedMotion.addEventListener("change", syncReducedMotion);

    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener("change", syncReducedMotion);
      video.pause();
    };
  }, [eager]);

  return (
    <video
      ref={videoRef}
      muted
      loop
      playsInline
      preload={eager ? "metadata" : "none"}
      poster={poster}
      aria-label={label}
      className={`block aspect-video h-auto w-full bg-white object-cover ${className}`}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
