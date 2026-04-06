import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { PopoverState } from '@/app/home/components/TextSelectionPopover';
import type { ThreadMeta, ThreadSource } from '@/app/home/components/threadTypes';
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

interface ActiveThread extends ThreadSource {
  id: string | null;
}

interface ActiveSelection {
  anchorRect: PopoverState['anchorRect'];
  selectedText: string;
  sourceMessageId: string;
  startOffset: number;
  endOffset: number;
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
  const [activeSelection, setActiveSelection] = useState<ActiveSelection | null>(null);
  const [threadPanelOpen, setThreadPanelOpen] = useState(false);
  const [threadPanelInitialMessages, setThreadPanelInitialMessages] =
    useState<ThreadMessage[] | null>(null);
  const [threadPanelDraftInput, setThreadPanelDraftInput] = useState<string | null>(null);
  const [threadPanelLoadingQuestion, setThreadPanelLoadingQuestion] = useState<string | null>(null);
  const [pendingThreadMessage, setPendingThreadMessage] = useState<string | null>(null);
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

  // Inject ::highlight() styles at runtime (not parsed by build)
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

  const resetThreadUi = useCallback(() => {
    clearPersistentHighlight();
    setPopoverState(null);
    setActiveThread(null);
    setActiveSelection(null);
    setThreadPanelOpen(false);
    setThreadPanelInitialMessages(null);
    setThreadPanelDraftInput(null);
    setThreadPanelLoadingQuestion(null);
    setPendingThreadMessage(null);
  }, [clearPersistentHighlight]);

  const dismissPopover = useCallback(() => {
    clearPersistentHighlight();
    setActiveSelection(null);
    setPopoverState(null);
  }, [clearPersistentHighlight]);

  const resolveMessageContentElement = (node: Node) => {
    if (node instanceof Element) {
      return node.closest('[data-message-content]');
    }

    return node.parentElement?.closest('[data-message-content]') ?? null;
  };

  const getSelectionOffsets = (messageEl: Element, range: Range) => {
    const startRange = document.createRange();
    startRange.selectNodeContents(messageEl);
    startRange.setEnd(range.startContainer, range.startOffset);

    const endRange = document.createRange();
    endRange.selectNodeContents(messageEl);
    endRange.setEnd(range.endContainer, range.endOffset);

    return {
      startOffset: startRange.toString().length,
      endOffset: endRange.toString().length,
    };
  };

  const restoreRangeFromOffsets = (messageEl: Element, startOffset: number, endOffset: number) => {
    const walker = document.createTreeWalker(messageEl, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let startNode: Node | null = null;
    let endNode: Node | null = null;
    let startNodeOffset = 0;
    let endNodeOffset = 0;

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const textLength = node.textContent?.length ?? 0;
      const nextOffset = currentOffset + textLength;

      if (!startNode && startOffset <= nextOffset) {
        startNode = node;
        startNodeOffset = Math.max(0, startOffset - currentOffset);
      }

      if (startNode && endOffset <= nextOffset) {
        endNode = node;
        endNodeOffset = Math.max(0, endOffset - currentOffset);
        break;
      }

      currentOffset = nextOffset;
    }

    if (!startNode || !endNode) {
      return null;
    }

    const range = document.createRange();
    range.setStart(startNode, startNodeOffset);
    range.setEnd(endNode, endNodeOffset);
    return range;
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

    const selectedText = selection.toString().trim();
    if (selectedText.length < 2 || selectedText.length > 500) {
      return;
    }

    const range = selection.getRangeAt(0);
    const messageContentEl = resolveMessageContentElement(range.startContainer);
    const endMessageContentEl = resolveMessageContentElement(range.endContainer);

    if (!messageContentEl || !endMessageContentEl || endMessageContentEl !== messageContentEl) {
      return;
    }

    const messageEl = messageContentEl.closest('[data-message-id]');
    const messageId = messageEl?.getAttribute('data-message-id');
    const messageRole = messageEl?.getAttribute('data-message-role');

    if (!messageId || messageRole !== 'assistant') {
      return;
    }

    const offsets = getSelectionOffsets(messageContentEl, range);
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
      startOffset: offsets.startOffset,
      endOffset: offsets.endOffset,
    };

    setActiveSelection(nextSelection);
    setPopoverState({
      anchorRect: nextSelection.anchorRect,
      highlightedText: nextSelection.selectedText,
      selectedText: nextSelection.selectedText,
      sourceMessageId: nextSelection.sourceMessageId,
      startOffset: nextSelection.startOffset,
      endOffset: nextSelection.endOffset,
    });

    selection.removeAllRanges();
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
    if (!activeSelection) {
      clearPersistentHighlight();
      return;
    }

    const scrollContainer = scrollContainerRef.current;
    const messageEl = scrollContainer?.querySelector<HTMLElement>(
      `[data-message-id="${activeSelection.sourceMessageId}"]`
    );
    const messageContentEl = messageEl?.querySelector<HTMLElement>('[data-message-content]');

    if (!messageContentEl) {
      clearPersistentHighlight();
      return;
    }

    const range = restoreRangeFromOffsets(
      messageContentEl,
      activeSelection.startOffset,
      activeSelection.endOffset
    );

    if (!range) {
      clearPersistentHighlight();
      return;
    }

    setPersistentHighlight(range);
  });

  const handleGraduateToThread = useCallback(
    (
      threadId: string | null,
      source: ThreadSource,
      options?: {
        pendingMessage?: string;
        draftInput?: string;
        loadingQuestion?: string;
        initialMessages?: ThreadMessage[];
      }
    ) => {
      setActiveThread({ id: threadId, ...source });
      setThreadPanelInitialMessages(options?.initialMessages || null);
      setThreadPanelDraftInput(options?.draftInput ?? null);
      setThreadPanelLoadingQuestion(options?.loadingQuestion ?? null);
      setPendingThreadMessage(options?.pendingMessage || null);
      setThreadPanelOpen(true);
      setPopoverState(null);
    },
    []
  );

  const handleThreadClick = useCallback((thread: ThreadMeta) => {
    clearPersistentHighlight();
    setPopoverState(null);
    setActiveSelection(null);
    setActiveThread({
      id: thread.threadId,
      highlightedText: thread.highlightedText,
      sourceMessageId: thread.sourceMessageId,
      startOffset: thread.startOffset,
      endOffset: thread.endOffset,
    });
    setThreadPanelInitialMessages(null);
    setThreadPanelDraftInput(null);
    setThreadPanelLoadingQuestion(null);
    setPendingThreadMessage(null);
    setThreadPanelOpen(true);
  }, [clearPersistentHighlight]);

  const clearPendingThreadMessage = useCallback(() => {
    setPendingThreadMessage(null);
  }, []);

  const closeThreadPanel = useCallback(() => {
    if (!popoverState) {
      clearPersistentHighlight();
      setActiveSelection(null);
    }
    setThreadPanelOpen(false);
    setActiveThread(null);
    setThreadPanelInitialMessages(null);
    setThreadPanelDraftInput(null);
    setThreadPanelLoadingQuestion(null);
    setPendingThreadMessage(null);
  }, [clearPersistentHighlight, popoverState]);

  return {
    popoverState,
    activeThread,
    threadPanelOpen,
    threadPanelInitialMessages,
    threadPanelDraftInput,
    threadPanelLoadingQuestion,
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
