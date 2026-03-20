'use client';

import { useEffect, useRef } from 'react';

export default function HomeBackground() {
  const cursorGlowRef = useRef<HTMLDivElement | null>(null);
  const cursorFrameRef = useRef<number | null>(null);
  const cursorPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const glow = cursorGlowRef.current;
    if (!glow) return;

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
    <div ref={cursorGlowRef} className="pointer-events-none fixed inset-0">
      <div
        className="absolute inset-0 transition duration-500 ease-out"
        style={{
          background:
            "radial-gradient(200px circle at var(--cursor-x, 50%) var(--cursor-y, 35%), var(--ambient-cursor-glow), transparent 60%)",
        }}
      />

      <div
        className="absolute -left-40 -top-40 h-96 w-96 rounded-full blur-3xl"
        style={{ background: "var(--ambient-blob-a)" }}
      />
      <div
        className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full blur-3xl"
        style={{ background: "var(--ambient-blob-b)" }}
      />
    </div>
  );
}
