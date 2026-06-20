"use client";

import {
  useCallback,
  useEffect,
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

interface UseTranscriptNavigationParams {
  activeMessages: Message[];
  containerRef: RefObject<HTMLDivElement | null>;
  currentMapMessageId: string | null;
  input: string;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  setCurrentMapMessageId: Dispatch<SetStateAction<string | null>>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function useTranscriptNavigation({
  activeMessages,
  containerRef,
  currentMapMessageId,
  input,
  messagesEndRef,
  setCurrentMapMessageId,
  textareaRef,
}: UseTranscriptNavigationParams) {
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const userHasScrolledRef = useRef(false);
  const scrollInstantRef = useRef(true);
  const programmaticTranscriptNavigationRef = useRef(false);
  const transcriptNavigationTimeoutRef = useRef<number | null>(null);
  const transcriptNavigationEndHandlerRef = useRef<EventListener | null>(null);
  const visibleMapMessageAnimationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    userHasScrolledRef.current = userHasScrolled;
  }, [userHasScrolled]);

  const setUserHasScrolledState = useCallback((nextValue: boolean) => {
    userHasScrolledRef.current = nextValue;
    setUserHasScrolled((current) => (current === nextValue ? current : nextValue));
  }, []);

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

  useEffect(() => {
    if (!messagesEndRef.current) {
      return;
    }

    if (!userHasScrolledRef.current) {
      const behavior = scrollInstantRef.current ? 'instant' : 'smooth';
      scrollInstantRef.current = false;
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, [activeMessages, messagesEndRef]);

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

    if (!programmaticTranscriptNavigationRef.current) {
      const isAtBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      setUserHasScrolledState(!isAtBottom);
    }

    scheduleCurrentVisibleMapMessageUpdate();
  }, [containerRef, scheduleCurrentVisibleMapMessageUpdate, setUserHasScrolledState]);

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

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [input, textareaRef]);

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
    scrollInstantRef,
    setUserHasScrolledState,
    userHasScrolled,
  };
}
