"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { Message } from '@/app/home/types';

const MAP_SCROLL_TOP_OFFSET = 104;
const TRANSCRIPT_NAVIGATION_LOCK_MS = 700;
const JUMP_TO_MESSAGE_MAX_ATTEMPTS = 8;
const SCROLL_BOTTOM_EPSILON_PX = 2;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

interface UseTranscriptNavigationParams {
  activeMessages: Message[];
  containerRef: RefObject<HTMLDivElement | null>;
  currentMapMessageId: string | null;
  getSavedScrollPosition: (key: string) => number | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  scrollRestorationKey: string | null;
  setSavedScrollPosition: (key: string, scrollTop: number) => void;
  setCurrentMapMessageId: Dispatch<SetStateAction<string | null>>;
}

export function useTranscriptNavigation({
  activeMessages,
  containerRef,
  currentMapMessageId,
  getSavedScrollPosition,
  messagesEndRef,
  scrollRestorationKey,
  setSavedScrollPosition,
  setCurrentMapMessageId,
}: UseTranscriptNavigationParams) {
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const userHasScrolledRef = useRef(false);
  const autoFollowPausedByUserRef = useRef(false);
  const userMovedAwayAfterPauseRef = useRef(false);
  const transcriptPointerDownRef = useRef(false);
  const activeMessagesLengthRef = useRef(activeMessages.length);
  const pendingScrollRestoreKeyRef = useRef<string | null>(scrollRestorationKey);
  const previousScrollRestorationKeyRef = useRef<string | null>(scrollRestorationKey);
  const scrollRestorationKeyRef = useRef<string | null>(scrollRestorationKey);
  const skipNextAutoScrollKeyRef = useRef<string | null>(null);
  const blockAutoScrollUntilRef = useRef(0);
  const programmaticTranscriptNavigationRef = useRef(false);
  const transcriptNavigationTimeoutRef = useRef<number | null>(null);
  const transcriptNavigationEndHandlerRef = useRef<EventListener | null>(null);
  const visibleMapMessageAnimationFrameRef = useRef<number | null>(null);

  scrollRestorationKeyRef.current = scrollRestorationKey;
  activeMessagesLengthRef.current = activeMessages.length;
  if (previousScrollRestorationKeyRef.current !== scrollRestorationKey) {
    pendingScrollRestoreKeyRef.current = scrollRestorationKey;
    previousScrollRestorationKeyRef.current = scrollRestorationKey;
  }

  useEffect(() => {
    userHasScrolledRef.current = userHasScrolled;
  }, [userHasScrolled]);

  const setUserHasScrolledState = useCallback((nextValue: boolean) => {
    userHasScrolledRef.current = nextValue;
    if (!nextValue) {
      autoFollowPausedByUserRef.current = false;
      userMovedAwayAfterPauseRef.current = false;
    }
    setUserHasScrolled((current) => (current === nextValue ? current : nextValue));
  }, []);

  const saveCurrentScrollPosition = useCallback(() => {
    const key = scrollRestorationKeyRef.current;
    const container = containerRef.current;
    if (!key || !container || activeMessagesLengthRef.current === 0) {
      return;
    }

    setSavedScrollPosition(key, container.scrollTop);
  }, [containerRef, setSavedScrollPosition]);

  const endProgrammaticTranscriptNavigation = useCallback(() => {
    programmaticTranscriptNavigationRef.current = false;

    if (transcriptNavigationTimeoutRef.current !== null) {
      window.clearTimeout(transcriptNavigationTimeoutRef.current);
      transcriptNavigationTimeoutRef.current = null;
    }

    const container = containerRef.current;
    const scrollEndHandler = transcriptNavigationEndHandlerRef.current;
    if (container && scrollEndHandler) {
      container.removeEventListener('scrollend', scrollEndHandler);
    }

    transcriptNavigationEndHandlerRef.current = null;
  }, [containerRef]);

  const beginProgrammaticTranscriptNavigation = useCallback(() => {
    const container = containerRef.current;
    endProgrammaticTranscriptNavigation();
    programmaticTranscriptNavigationRef.current = true;

    if (container) {
      const handleScrollEnd: EventListener = () => {
        endProgrammaticTranscriptNavigation();
      };

      transcriptNavigationEndHandlerRef.current = handleScrollEnd;
      container.addEventListener('scrollend', handleScrollEnd, { once: true });
    }

    transcriptNavigationTimeoutRef.current = window.setTimeout(() => {
      endProgrammaticTranscriptNavigation();
    }, TRANSCRIPT_NAVIGATION_LOCK_MS);
  }, [containerRef, endProgrammaticTranscriptNavigation]);

  useEffect(() => {
    return () => {
      endProgrammaticTranscriptNavigation();
    };
  }, [endProgrammaticTranscriptNavigation]);

  const pauseAutoFollow = useCallback((allowAtBottom = false) => {
    const container = containerRef.current;
    if (!container || autoFollowPausedByUserRef.current) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const canScroll = container.scrollHeight - container.clientHeight > SCROLL_BOTTOM_EPSILON_PX;
    if (
      distanceFromBottom <= SCROLL_BOTTOM_EPSILON_PX
      && (!allowAtBottom || !canScroll)
    ) {
      return;
    }

    autoFollowPausedByUserRef.current = true;
    userMovedAwayAfterPauseRef.current = distanceFromBottom > SCROLL_BOTTOM_EPSILON_PX;
    endProgrammaticTranscriptNavigation();
    setUserHasScrolledState(true);

    // Freeze any smooth navigation already in flight at its current position.
    container.scrollTo({ top: container.scrollTop, behavior: 'instant' });
  }, [containerRef, endProgrammaticTranscriptNavigation, setUserHasScrolledState]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handlePointerDown = () => {
      transcriptPointerDownRef.current = true;
    };
    const handlePointerUp = () => {
      transcriptPointerDownRef.current = false;
    };
    const handlePointerScroll = () => {
      if (transcriptPointerDownRef.current) {
        pauseAutoFollow();
      }
    };
    const handleWheel = (event: WheelEvent) => {
      pauseAutoFollow(event.deltaY < 0);
    };
    const handleTouchMove = () => {
      pauseAutoFollow();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      const isInteractiveTarget =
        target instanceof Element
        && Boolean(target.closest('a, button, summary, [role="button"], [role="link"]'));
      const activeElement = document.activeElement;

      if (
        event.defaultPrevented
        || event.metaKey
        || event.ctrlKey
        || event.altKey
        || isEditableTarget
        || isInteractiveTarget
        || !SCROLL_KEYS.has(event.key)
        || !activeElement
        || !container.contains(activeElement)
      ) {
        return;
      }

      const movesAwayFromBottom =
        ['ArrowUp', 'PageUp', 'Home'].includes(event.key)
        || (event.key === ' ' && event.shiftKey);
      pauseAutoFollow(movesAwayFromBottom);
    };

    container.addEventListener('wheel', handleWheel, { capture: true, passive: true });
    container.addEventListener('touchmove', handleTouchMove, { capture: true, passive: true });
    container.addEventListener('pointerdown', handlePointerDown, { capture: true });
    container.addEventListener('scroll', handlePointerScroll);
    window.addEventListener('pointerup', handlePointerUp, { capture: true });
    window.addEventListener('pointercancel', handlePointerUp, { capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
      container.removeEventListener('touchmove', handleTouchMove, { capture: true });
      container.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      container.removeEventListener('scroll', handlePointerScroll);
      window.removeEventListener('pointerup', handlePointerUp, { capture: true });
      window.removeEventListener('pointercancel', handlePointerUp, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [containerRef, pauseAutoFollow]);

  useLayoutEffect(() => {
    if (
      !scrollRestorationKey
      || pendingScrollRestoreKeyRef.current !== scrollRestorationKey
      || activeMessages.length === 0
    ) {
      return;
    }

    const savedScrollTop = getSavedScrollPosition(scrollRestorationKey);
    const container = containerRef.current;
    if (!container) {
      return;
    }

    pendingScrollRestoreKeyRef.current = null;

    if (savedScrollTop === null) {
      return;
    }

    container.scrollTop = savedScrollTop;
    skipNextAutoScrollKeyRef.current = scrollRestorationKey;
    blockAutoScrollUntilRef.current = performance.now() + 600;

    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setUserHasScrolledState(!isAtBottom);

    let frame: number | null = null;
    let attempts = 0;
    const reapplyScroll = () => {
      if (scrollRestorationKeyRef.current === scrollRestorationKey) {
        container.scrollTop = savedScrollTop;
      }
      attempts += 1;
      if (attempts < 8) {
        frame = window.requestAnimationFrame(reapplyScroll);
      }
    };

    frame = window.requestAnimationFrame(reapplyScroll);

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [
    activeMessages,
    containerRef,
    getSavedScrollPosition,
    scrollRestorationKey,
    setUserHasScrolledState,
  ]);

  useEffect(() => {
    if (!messagesEndRef.current) {
      return;
    }

    if (skipNextAutoScrollKeyRef.current === scrollRestorationKey) {
      skipNextAutoScrollKeyRef.current = null;
      return;
    }

    if (
      scrollRestorationKey
      && performance.now() < blockAutoScrollUntilRef.current
    ) {
      return;
    }

    if (!userHasScrolledRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, [activeMessages, messagesEndRef, scrollRestorationKey]);

  const updateCurrentVisibleMapMessage = useCallback(() => {
    visibleMapMessageAnimationFrameRef.current = null;
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const messageElements = Array.from(
      container.querySelectorAll<HTMLElement>('[data-message-id]')
    );
    if (messageElements.length === 0) {
      setCurrentMapMessageId(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const anchorY = containerRect.top + Math.min(container.clientHeight * 0.34, 240);
    let bestId = messageElements[messageElements.length - 1]?.dataset.messageId ?? null;
    let bestScore = Number.POSITIVE_INFINITY;

    messageElements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.bottom < containerRect.top + 24 || rect.top > containerRect.bottom - 24) {
        return;
      }

      const score =
        rect.top <= anchorY && rect.bottom >= anchorY
          ? 0
          : Math.min(Math.abs(rect.top - anchorY), Math.abs(rect.bottom - anchorY));

      if (score < bestScore) {
        bestScore = score;
        bestId = element.dataset.messageId ?? bestId;
      }
    });

    setCurrentMapMessageId(bestId);
  }, [containerRef, setCurrentMapMessageId]);

  const scheduleCurrentVisibleMapMessageUpdate = useCallback(() => {
    if (visibleMapMessageAnimationFrameRef.current !== null) {
      return;
    }

    visibleMapMessageAnimationFrameRef.current = window.requestAnimationFrame(
      updateCurrentVisibleMapMessage
    );
  }, [updateCurrentVisibleMapMessage]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const key = scrollRestorationKeyRef.current;
    if (
      key
      && activeMessagesLengthRef.current > 0
      && pendingScrollRestoreKeyRef.current !== key
    ) {
      setSavedScrollPosition(key, container.scrollTop);
    }

    if (!programmaticTranscriptNavigationRef.current) {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;

      if (autoFollowPausedByUserRef.current) {
        if (distanceFromBottom > SCROLL_BOTTOM_EPSILON_PX) {
          userMovedAwayAfterPauseRef.current = true;
        } else if (userMovedAwayAfterPauseRef.current) {
          setUserHasScrolledState(false);
        }
      } else {
        setUserHasScrolledState(distanceFromBottom >= 100);
      }
    }

    scheduleCurrentVisibleMapMessageUpdate();
  }, [
    containerRef,
    scheduleCurrentVisibleMapMessageUpdate,
    setSavedScrollPosition,
    setUserHasScrolledState,
  ]);

  useEffect(() => {
    if (activeMessages.length === 0) {
      setCurrentMapMessageId(null);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      updateCurrentVisibleMapMessage();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeMessages, setCurrentMapMessageId, updateCurrentVisibleMapMessage]);

  useEffect(() => {
    return () => {
      if (visibleMapMessageAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(visibleMapMessageAnimationFrameRef.current);
      }
    };
  }, []);

  const jumpToMessage = useCallback((messageId: string) => {
    const selector =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? `[data-message-id="${CSS.escape(messageId)}"]`
        : `[data-message-id="${messageId.replace(/["\\]/g, '\\$&')}"]`;

    setUserHasScrolledState(true);
    let attempts = 0;

    const scrollToTarget = () => {
      const container = containerRef.current;
      const target = container?.querySelector<HTMLElement>(selector);
      if (!container || !target) {
        if (typeof window !== 'undefined' && attempts < JUMP_TO_MESSAGE_MAX_ATTEMPTS) {
          attempts += 1;
          window.requestAnimationFrame(scrollToTarget);
        }
        return;
      }

      beginProgrammaticTranscriptNavigation();
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const nextTop = Math.max(
        0,
        container.scrollTop + (targetRect.top - containerRect.top) - MAP_SCROLL_TOP_OFFSET
      );

      container.scrollTo({
        top: nextTop,
        behavior: 'smooth',
      });
    };

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(scrollToTarget);
      return;
    }

    scrollToTarget();
  }, [beginProgrammaticTranscriptNavigation, containerRef, setUserHasScrolledState]);

  return {
    currentMapMessageId,
    endProgrammaticTranscriptNavigation,
    handleScroll,
    jumpToMessage,
    saveCurrentScrollPosition,
    setUserHasScrolledState,
    userHasScrolled,
  };
}
