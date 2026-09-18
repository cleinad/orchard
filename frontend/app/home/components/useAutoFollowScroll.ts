'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  getScrollKeyIntent,
  isAtScrollBottom,
  shouldPauseFollow,
} from '@/app/home/components/scrollFollow';

interface UseAutoFollowScrollParams {
  containerRef: RefObject<HTMLElement | null>;
  contentKey: unknown;
  enabled: boolean;
  resetKey: unknown;
}

/**
 * Keeps a scroll container pinned to its growing bottom while content streams,
 * and hands control back to the reader as soon as they scroll away.
 *
 * This is the lighter sibling of the main transcript's
 * `useTranscriptNavigation` follow/pause behaviour: auto-follow is instant, user
 * gestures pause it, and any in-flight smooth scroll is frozen at its current
 * position so scrolling up stays put instead of fighting the stream.
 */
export function useAutoFollowScroll({
  containerRef,
  contentKey,
  enabled,
  resetKey,
}: UseAutoFollowScrollParams) {
  const followingRef = useRef(true);
  const pointerDownRef = useRef(false);

  const pauseFollow = useCallback(
    (allowAtBottom: boolean) => {
      const container = containerRef.current;
      if (!container || !followingRef.current) return;
      if (!shouldPauseFollow(container, allowAtBottom)) return;

      followingRef.current = false;
      // Freeze any smooth navigation already in flight so the reader's position sticks.
      container.scrollTo({ top: container.scrollTop, behavior: 'instant' });
    },
    [containerRef]
  );

  const resumeFollowIfAtBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container || followingRef.current) return;
    if (isAtScrollBottom(container)) {
      followingRef.current = true;
    }
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const handleWheel = (event: WheelEvent) => {
      pauseFollow(event.deltaY < 0);
    };
    const handleTouchMove = () => {
      pauseFollow(false);
    };
    const handlePointerDown = () => {
      pointerDownRef.current = true;
    };
    const handlePointerUp = () => {
      pointerDownRef.current = false;
    };
    const handleScroll = () => {
      if (pointerDownRef.current) {
        pauseFollow(false);
      }
      resumeFollowIfAtBottom();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const activeElement = document.activeElement;
      const intent = getScrollKeyIntent({
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        defaultPrevented: event.defaultPrevented,
        isEditableTarget:
          target instanceof HTMLElement
          && (target.isContentEditable
            || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)),
        isInteractiveTarget:
          target instanceof Element
          && Boolean(target.closest('a, button, summary, [role="button"], [role="link"]')),
        isWithinContainer: Boolean(activeElement) && container.contains(activeElement),
      });

      if (intent) {
        pauseFollow(intent.allowAtBottom);
      }
    };

    container.addEventListener('wheel', handleWheel, { capture: true, passive: true });
    container.addEventListener('touchmove', handleTouchMove, { capture: true, passive: true });
    container.addEventListener('pointerdown', handlePointerDown, { capture: true });
    container.addEventListener('scroll', handleScroll);
    window.addEventListener('pointerup', handlePointerUp, { capture: true });
    window.addEventListener('pointercancel', handlePointerUp, { capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
      container.removeEventListener('touchmove', handleTouchMove, { capture: true });
      container.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pointerup', handlePointerUp, { capture: true });
      window.removeEventListener('pointercancel', handlePointerUp, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [containerRef, enabled, pauseFollow, resumeFollowIfAtBottom]);

  useEffect(() => {
    if (!enabled) return;

    // Opening the panel or switching threads always resumes following and pins
    // to the bottom, regardless of where the previous thread was left.
    followingRef.current = true;
    const container = containerRef.current;
    if (!container) return;

    const frame = window.requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: 'instant' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [containerRef, enabled, resetKey]);

  useEffect(() => {
    if (!enabled || !followingRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({ top: container.scrollHeight, behavior: 'instant' });
  }, [containerRef, contentKey, enabled]);
}
