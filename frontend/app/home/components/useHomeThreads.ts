import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  getOffsetsFromRange,
  restoreRangeFromOffsets,
} from '@/app/home/components/selectableTextIndex';
import type { PopoverState } from '@/app/home/components/TextSelectionPopover';
import type { ThreadSession, ThreadSource } from '@/app/home/components/threadTypes';

const ACTIVE_SELECTION_HIGHLIGHT = 'keen-active-selection';
const HIGHLIGHT_STYLE_ID = 'keen-active-selection-styles';

/** Inject ::highlight() CSS at runtime; build CSS parser (Turbopack) doesn't support this pseudo-element. */
function ensureHighlightStylesInjected() {
  if (typeof document === 'undefined' || document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
::highlight(${ACTIVE_SELECTION_HIGHLIGHT}) {
  background-color: color-mix(in srgb, var(--accent) 28%, transparent);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--accent) 45%, transparent);
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.16em;
}
.dark::highlight(${ACTIVE_SELECTION_HIGHLIGHT}) {
  background-color: color-mix(in srgb, var(--accent) 36%, transparent);
}`;
  document.head.appendChild(style);
}

function getHighlightRegistry() {
  if (
    typeof CSS === 'undefined'
    || typeof Highlight === 'undefined'
    || !('highlights' in CSS)
  ) {
    return null;
  }

  return (CSS as typeof CSS & {
    highlights?: {
      set: (name: string, highlight: Highlight) => void;
      delete: (name: string) => void;
    };
  }).highlights ?? null;
}

interface ActiveSelection {
  anchorRect: PopoverState['anchorRect'];
  selectedText: string;
  sourceMessageId: string;
  startOffset: number;
  endOffset: number;
}

interface CreateThreadSessionOptions {
  makeActive?: boolean;
}

export function useHomeThreads(
  learningMode: boolean,
  scrollContainerRef: RefObject<HTMLDivElement | null>
) {
  const [popoverState, setPopoverState] = useState<PopoverState | null>(null);
  const [highlightSource, setHighlightSource] = useState<ThreadSource | null>(null);
  const [threadPanelOpen, setThreadPanelOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [threadSessionsById, setThreadSessionsById] = useState<Record<string, ThreadSession>>({});
  const highlightedRangeRef = useRef<Range | null>(null);
  const selectionResolveTimerRef = useRef<number | null>(null);

  const clearPersistentHighlight = useCallback(() => {
    highlightedRangeRef.current = null;
    getHighlightRegistry()?.delete(ACTIVE_SELECTION_HIGHLIGHT);
  }, []);

  const setPersistentHighlight = useCallback((range: Range) => {
    const nextRange = range.cloneRange();
    highlightedRangeRef.current = nextRange;

    const highlightRegistry = getHighlightRegistry();
    if (!highlightRegistry) {
      return;
    }

    highlightRegistry.set(ACTIVE_SELECTION_HIGHLIGHT, new Highlight(nextRange));
  }, []);

  useEffect(() => {
    ensureHighlightStylesInjected();
  }, []);

  useEffect(() => {
    return () => {
      if (selectionResolveTimerRef.current !== null) {
        window.clearTimeout(selectionResolveTimerRef.current);
      }
      clearPersistentHighlight();
    };
  }, [clearPersistentHighlight]);

  const activeSession =
    activeSessionId
      ? threadSessionsById[activeSessionId] ?? null
      : null;

  const resetThreadUi = useCallback(() => {
    clearPersistentHighlight();
    setPopoverState(null);
    setHighlightSource(null);
    setThreadPanelOpen(false);
    setActiveSessionId(null);
    setThreadSessionsById({});
  }, [clearPersistentHighlight]);

  const dismissPopover = useCallback(() => {
    setPopoverState(null);
    setHighlightSource(activeSession);
  }, [activeSession]);

  const resolveMessageContentElement = (node: Node) => {
    if (node instanceof Element) {
      return node.closest('[data-message-content]');
    }

    return node.parentElement?.closest('[data-message-content]') ?? null;
  };

  const resolveActiveSelection = useCallback(() => {
    if (!learningMode) {
      return;
    }

    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      return;
    }

    const range = selection.getRangeAt(0);
    const messageContentEl = resolveMessageContentElement(range.startContainer);
    const endMessageContentEl = resolveMessageContentElement(range.endContainer);

    if (!messageContentEl || !endMessageContentEl || endMessageContentEl !== messageContentEl) {
      return;
    }

    const resolvedOffsets = getOffsetsFromRange(messageContentEl, range);
    if (!resolvedOffsets) {
      return;
    }

    const selectedText = resolvedOffsets.selectedText;
    if (selectedText.length < 2 || selectedText.length > 500) {
      return;
    }

    const messageEl = messageContentEl.closest('[data-message-id]');
    const messageId = messageEl?.getAttribute('data-message-id');
    const messageRole = messageEl?.getAttribute('data-message-role');

    if (!messageId || messageRole !== 'assistant' || messageId.startsWith('streaming-')) {
      return;
    }

    const clientRects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 0 || rect.height > 0
    );
    const rect = clientRects[0] ?? range.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const nextSelection: ActiveSelection = {
      anchorRect: {
        left: rect.left - containerRect.left + scrollContainer.scrollLeft,
        top: rect.top - containerRect.top + scrollContainer.scrollTop,
        width: rect.width,
        height: rect.height,
      },
      selectedText,
      sourceMessageId: messageId,
      startOffset: resolvedOffsets.startOffset,
      endOffset: resolvedOffsets.endOffset,
    };

    setHighlightSource({
      highlightedText: nextSelection.selectedText,
      sourceMessageId: nextSelection.sourceMessageId,
      startOffset: nextSelection.startOffset,
      endOffset: nextSelection.endOffset,
    });
    setPopoverState({
      anchorRect: nextSelection.anchorRect,
      highlightedText: nextSelection.selectedText,
      selectedText: nextSelection.selectedText,
      sourceMessageId: nextSelection.sourceMessageId,
      startOffset: nextSelection.startOffset,
      endOffset: nextSelection.endOffset,
    });
  }, [learningMode, scrollContainerRef]);

  const handlePointerUp = useCallback(() => {
    if (!learningMode) {
      return;
    }

    if (selectionResolveTimerRef.current !== null) {
      window.clearTimeout(selectionResolveTimerRef.current);
    }

    selectionResolveTimerRef.current = window.setTimeout(() => {
      selectionResolveTimerRef.current = null;
      resolveActiveSelection();
    }, 0);
  }, [learningMode, resolveActiveSelection]);

  useLayoutEffect(() => {
    if (!highlightSource) {
      clearPersistentHighlight();
      return;
    }

    const scrollContainer = scrollContainerRef.current;
    const messageEl = scrollContainer?.querySelector<HTMLElement>(
      `[data-message-id="${highlightSource.sourceMessageId}"]`
    );
    const messageContentEl = messageEl?.querySelector<HTMLElement>('[data-message-content]');

    if (!messageContentEl) {
      clearPersistentHighlight();
      return;
    }

    const range = restoreRangeFromOffsets(
      messageContentEl,
      highlightSource.startOffset,
      highlightSource.endOffset
    );

    if (!range) {
      clearPersistentHighlight();
      return;
    }

    setPersistentHighlight(range);
  }, [clearPersistentHighlight, highlightSource, scrollContainerRef, setPersistentHighlight]);

  const createThreadSession = useCallback(
    (session: ThreadSession, options?: CreateThreadSessionOptions) => {
      setThreadSessionsById((prev) => ({
        ...prev,
        [session.sessionId]: session,
      }));

      if (options?.makeActive) {
        setActiveSessionId(session.sessionId);
        setThreadPanelOpen(true);
        setPopoverState(null);
        setHighlightSource(session);
      }

      return session.sessionId;
    },
    []
  );

  const updateThreadSession = useCallback(
    (
      sessionId: string,
      updater: (session: ThreadSession) => ThreadSession
    ) => {
      setThreadSessionsById((prev) => {
        const existing = prev[sessionId];
        if (!existing) {
          return prev;
        }

        const nextSession = updater(existing);
        if (nextSession === existing) {
          return prev;
        }

        return {
          ...prev,
          [sessionId]: nextSession,
        };
      });
    },
    []
  );

  const activateThreadSession = useCallback(
    (sessionId: string) => {
      const session = threadSessionsById[sessionId];
      if (!session) {
        return;
      }

      setActiveSessionId(sessionId);
      setThreadPanelOpen(true);
      setPopoverState(null);
      setHighlightSource(session);
    },
    [threadSessionsById]
  );

  const closeThreadPanel = useCallback(() => {
    setThreadPanelOpen(false);
    setActiveSessionId(null);
    setHighlightSource(popoverState);
  }, [popoverState]);

  const findThreadSessionId = useCallback(
    (threadId: string) => {
      return Object.values(threadSessionsById).find((session) => session.threadId === threadId)?.sessionId ?? null;
    },
    [threadSessionsById]
  );

  return {
    popoverState,
    activeSessionId,
    activeSession,
    threadPanelOpen,
    threadSessionsById,
    resetThreadUi,
    dismissPopover,
    handlePointerUp,
    createThreadSession,
    updateThreadSession,
    activateThreadSession,
    closeThreadPanel,
    findThreadSessionId,
  };
}
