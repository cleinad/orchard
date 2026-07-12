import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { getOffsetsFromRange } from '@/app/home/components/selectableTextIndex';
import { DEFAULT_SELECTION_STREAM_VERSION } from '@/app/home/components/markdownSelectableStream';
import type { PopoverState } from '@/app/home/components/TextSelectionPopover';
import type { ThreadSession, ThreadSource } from '@/app/home/components/threadTypes';

interface ActiveSelection {
  anchorRect: PopoverState['anchorRect'];
  selectedText: string;
  sourceMessageId: string;
  startOffset: number;
  endOffset: number;
  selectionStreamVersion: typeof DEFAULT_SELECTION_STREAM_VERSION;
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
  const selectionResolveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (selectionResolveTimerRef.current !== null) {
        window.clearTimeout(selectionResolveTimerRef.current);
      }
    };
  }, []);

  const activeSession =
    activeSessionId
      ? threadSessionsById[activeSessionId] ?? null
      : null;

  const resetThreadUi = useCallback(() => {
    setPopoverState(null);
    setHighlightSource(null);
    setThreadPanelOpen(false);
    setActiveSessionId(null);
    setThreadSessionsById({});
  }, []);

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

    const resolvedOffsets = getOffsetsFromRange(
      messageContentEl,
      range,
      DEFAULT_SELECTION_STREAM_VERSION
    );
    if (!resolvedOffsets) {
      return;
    }

    const selectedText = resolvedOffsets.selectedText;
    if (selectedText.length < 2) {
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
      selectionStreamVersion: DEFAULT_SELECTION_STREAM_VERSION,
    };

    setHighlightSource({
      highlightedText: nextSelection.selectedText,
      sourceMessageId: nextSelection.sourceMessageId,
      startOffset: nextSelection.startOffset,
      endOffset: nextSelection.endOffset,
      selectionStreamVersion: nextSelection.selectionStreamVersion,
    });
    setPopoverState({
      anchorRect: nextSelection.anchorRect,
      highlightedText: nextSelection.selectedText,
      selectedText: nextSelection.selectedText,
      sourceMessageId: nextSelection.sourceMessageId,
      startOffset: nextSelection.startOffset,
      endOffset: nextSelection.endOffset,
      selectionStreamVersion: nextSelection.selectionStreamVersion,
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
    highlightSource,
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
