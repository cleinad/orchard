import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PopoverState } from '@/app/home/components/TextSelectionPopover';
import type { ThreadMeta } from '@/app/home/components/MarkdownWithThreads';
import type { ThreadMessage } from '@/app/home/components/ThreadPanel';

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
}
.dark::highlight(${ACTIVE_SELECTION_HIGHLIGHT}) {
  background-color: color-mix(in srgb, var(--accent) 36%, transparent);
}`;
  document.head.appendChild(style);
}

interface ActiveThread {
  id: string | null;
  highlightedText: string;
  sourceMessageId: string;
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

export function useHomeThreads(
  learningMode: boolean,
  scrollContainerRef: RefObject<HTMLDivElement | null>
) {
  const [popoverState, setPopoverState] = useState<PopoverState | null>(null);
  const [activeThread, setActiveThread] = useState<ActiveThread | null>(null);
  const [threadPanelOpen, setThreadPanelOpen] = useState(false);
  const [threadPanelInitialMessages, setThreadPanelInitialMessages] =
    useState<ThreadMessage[] | null>(null);
  const [threadPanelDraftInput, setThreadPanelDraftInput] = useState<string | null>(null);
  const [pendingThreadMessage, setPendingThreadMessage] = useState<string | null>(null);
  const highlightedRangeRef = useRef<Range | null>(null);

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

  // Inject ::highlight() styles at runtime (not parsed by build)
  useEffect(() => {
    ensureHighlightStylesInjected();
  }, []);

  useEffect(() => {
    return () => {
      clearPersistentHighlight();
    };
  }, [clearPersistentHighlight]);

  const resetThreadUi = useCallback(() => {
    clearPersistentHighlight();
    setPopoverState(null);
    setActiveThread(null);
    setThreadPanelOpen(false);
    setThreadPanelInitialMessages(null);
    setThreadPanelDraftInput(null);
    setPendingThreadMessage(null);
  }, [clearPersistentHighlight]);

  const dismissPopover = useCallback(() => {
    clearPersistentHighlight();
    setPopoverState(null);
  }, [clearPersistentHighlight]);

  const handlePointerUp = useCallback(() => {
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

    const selectedText = selection.toString().trim();
    if (selectedText.length < 2 || selectedText.length > 500) {
      return;
    }

    const range = selection.getRangeAt(0);
    const messageEl =
      (range.startContainer as HTMLElement).closest?.('[data-message-id]') ||
      (range.startContainer.parentElement as HTMLElement)?.closest?.(
        '[data-message-id]'
      );

    if (!messageEl) {
      return;
    }

    const endMessageEl =
      (range.endContainer as HTMLElement).closest?.('[data-message-id]') ||
      (range.endContainer.parentElement as HTMLElement)?.closest?.(
        '[data-message-id]'
      );

    if (!endMessageEl || endMessageEl !== messageEl) {
      return;
    }

    const messageId = messageEl.getAttribute('data-message-id');
    const messageRole = messageEl.getAttribute('data-message-role');

    if (!messageId || messageRole !== 'assistant') {
      return;
    }

    const clientRects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 0 || rect.height > 0
    );
    const rect = clientRects[0] ?? range.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    setPersistentHighlight(range);

    setPopoverState({
      anchorRect: {
        left: rect.left - containerRect.left + scrollContainer.scrollLeft,
        top: rect.top - containerRect.top + scrollContainer.scrollTop,
        width: rect.width,
        height: rect.height,
      },
      selectedText,
      sourceMessageId: messageId,
    });
  }, [learningMode, scrollContainerRef, setPersistentHighlight]);

  const handleGraduateToThread = useCallback(
    (
      threadId: string | null,
      sourceMessageId: string,
      highlightedText: string,
      options?: {
        pendingMessage?: string;
        draftInput?: string;
        initialMessages?: ThreadMessage[];
      }
    ) => {
      setActiveThread({ id: threadId, highlightedText, sourceMessageId });
      setThreadPanelInitialMessages(options?.initialMessages || null);
      setThreadPanelDraftInput(options?.draftInput ?? null);
      setPendingThreadMessage(options?.pendingMessage || null);
      setThreadPanelOpen(true);
      setPopoverState(null);
    },
    []
  );

  const handleThreadClick = useCallback((thread: ThreadMeta) => {
    clearPersistentHighlight();
    setPopoverState(null);
    setActiveThread({
      id: thread.threadId,
      highlightedText: thread.highlightedText,
      sourceMessageId: thread.sourceMessageId,
    });
    setThreadPanelInitialMessages(null);
    setThreadPanelDraftInput(null);
    setPendingThreadMessage(null);
    setThreadPanelOpen(true);
  }, [clearPersistentHighlight]);

  const clearPendingThreadMessage = useCallback(() => {
    setPendingThreadMessage(null);
  }, []);

  const closeThreadPanel = useCallback(() => {
    if (!popoverState) {
      clearPersistentHighlight();
    }
    setThreadPanelOpen(false);
    setActiveThread(null);
    setThreadPanelInitialMessages(null);
    setThreadPanelDraftInput(null);
    setPendingThreadMessage(null);
  }, [clearPersistentHighlight, popoverState]);

  return {
    popoverState,
    activeThread,
    threadPanelOpen,
    threadPanelInitialMessages,
    threadPanelDraftInput,
    pendingThreadMessage,
    resetThreadUi,
    dismissPopover,
    handlePointerUp,
    handleGraduateToThread,
    handleThreadClick,
    clearPendingThreadMessage,
    closeThreadPanel,
  };
}
