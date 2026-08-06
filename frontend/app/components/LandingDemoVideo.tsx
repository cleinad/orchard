"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const isNearViewportRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const playbackModeRef = useRef<"auto" | "paused" | "playing">("auto");
  const [isPlaying, setIsPlaying] = useState(false);

  const syncPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const shouldPlay =
      isNearViewportRef.current
      && playbackModeRef.current !== "paused"
      && (playbackModeRef.current === "playing" || !reducedMotionRef.current);

    if (!shouldPlay) {
      video.pause();
      return;
    }

    void video.play().catch(() => {
      // The poster remains visible if the browser blocks autoplay.
    });
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    const video = videoRef.current;
    if (!video) return;
    const syncReducedMotion = () => {
      reducedMotionRef.current = reducedMotion.matches;
      syncPlayback();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isNearViewportRef.current = entry.isIntersecting;
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
  }, [eager, syncPlayback]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      playbackModeRef.current = "playing";
      void video.play().catch(() => {
        // The visible control remains available if playback cannot start.
      });
      return;
    }

    playbackModeRef.current = "paused";
    video.pause();
  };

  return (
    <div className="relative w-full">
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload={eager ? "metadata" : "none"}
        poster={poster}
        aria-label={label}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className={`block aspect-video h-auto w-full bg-white object-cover ${className}`}
      >
        <source src={src} type="video/mp4" />
      </video>
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={isPlaying ? "Pause demo" : "Play demo"}
        aria-pressed={isPlaying}
        className="absolute bottom-3 right-3 inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-[#111827]/78 px-3 font-sans text-xs font-medium text-white shadow-[0_5px_16px_rgba(15,23,42,0.25)] backdrop-blur-sm transition-colors duration-150 hover:bg-[#111827]/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3749ad] motion-reduce:transition-none"
      >
        {isPlaying ? (
          <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 fill-current">
            <path d="M2 1.5h2.5v9H2zm5.5 0H10v9H7.5z" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 fill-current">
            <path d="M3 1.6v8.8L10 6z" />
          </svg>
        )}
        {isPlaying ? "Pause" : "Play"}
      </button>
    </div>
  );
}
