import { useCallback, useState, type RefObject } from 'react';
import type { PopoverState } from '@/app/home/components/TextSelectionPopover';
import type { ThreadMeta } from '@/app/home/components/MarkdownWithThreads';
import type { ThreadMessage } from '@/app/home/components/ThreadPanel';

interface ActiveThread {
  id: string;
  highlightedText: string;
  sourceMessageId: string;
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
  const [pendingThreadMessage, setPendingThreadMessage] = useState<string | null>(null);

  const resetThreadUi = useCallback(() => {
    setPopoverState(null);
    setActiveThread(null);
    setThreadPanelOpen(false);
    setThreadPanelInitialMessages(null);
    setPendingThreadMessage(null);
  }, []);

  const dismissPopover = useCallback(() => {
    setPopoverState(null);
  }, []);

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
  }, [learningMode, scrollContainerRef]);

  const handleGraduateToThread = useCallback(
    (
      threadId: string,
      sourceMessageId: string,
      highlightedText: string,
      options?: {
        pendingMessage?: string;
        initialMessages?: ThreadMessage[];
      }
    ) => {
      setActiveThread({ id: threadId, highlightedText, sourceMessageId });
      setThreadPanelInitialMessages(options?.initialMessages || null);
      setPendingThreadMessage(options?.pendingMessage || null);
      setThreadPanelOpen(true);
      setPopoverState(null);
    },
    []
  );

  const handleThreadClick = useCallback((thread: ThreadMeta) => {
    setActiveThread({
      id: thread.threadId,
      highlightedText: thread.highlightedText,
      sourceMessageId: thread.sourceMessageId,
    });
    setThreadPanelInitialMessages(null);
    setPendingThreadMessage(null);
    setThreadPanelOpen(true);
  }, []);

  const clearPendingThreadMessage = useCallback(() => {
    setPendingThreadMessage(null);
  }, []);

  const closeThreadPanel = useCallback(() => {
    setThreadPanelOpen(false);
    setActiveThread(null);
    setThreadPanelInitialMessages(null);
    setPendingThreadMessage(null);
  }, []);

  return {
    popoverState,
    activeThread,
    threadPanelOpen,
    threadPanelInitialMessages,
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
