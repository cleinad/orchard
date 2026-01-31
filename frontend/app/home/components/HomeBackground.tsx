'use client';

import { useEffect, useRef } from 'react';

export default function HomeBackground() {
  const cursorGlowRef = useRef<HTMLDivElement | null>(null);
  const cursorFrameRef = useRef<number | null>(null);
  const cursorPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const glow = cursorGlowRef.current;
    if (!glow) {
      return;
    }

    const update = () => {
      cursorFrameRef.current = null;
      glow.style.setProperty('--cursor-x', `${cursorPosRef.current.x}px`);
      glow.style.setProperty('--cursor-y', `${cursorPosRef.current.y}px`);
    };

    const handleMove = (event: PointerEvent) => {
      cursorPosRef.current = { x: event.clientX, y: event.clientY };
      if (cursorFrameRef.current === null) {
        cursorFrameRef.current = requestAnimationFrame(update);
      }
    };

    cursorPosRef.current = {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.35,
    };
    update();

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerdown', handleMove);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerdown', handleMove);
      if (cursorFrameRef.current !== null) {
        cancelAnimationFrame(cursorFrameRef.current);
      }
    };
  }, []);

  return (
    <div ref={cursorGlowRef} className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-0 opacity-100 transition duration-300 ease-out dark:opacity-0"
        style={{
          background:
            'radial-gradient(120px circle at var(--cursor-x, 50%) var(--cursor-y, 35%), rgba(250, 204, 21, 0.26), rgba(250, 204, 21, 0.12) 30%, transparent 70%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-0 transition duration-300 ease-out dark:opacity-100"
        style={{
          background:
            'radial-gradient(120px circle at var(--cursor-x, 50%) var(--cursor-y, 35%), rgba(251, 146, 60, 0.28), rgba(251, 146, 60, 0.12) 30%, transparent 70%)',
        }}
      />
      <div className="absolute -left-32 top-[-140px] h-72 w-72 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-400/30" />
      <div className="absolute bottom-[-160px] right-[-120px] h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-400/30" />
      <div className="absolute inset-x-0 top-[18%] h-px bg-gradient-to-r from-transparent via-slate-200/70 to-transparent dark:via-slate-700/60" />
    </div>
  );
}
