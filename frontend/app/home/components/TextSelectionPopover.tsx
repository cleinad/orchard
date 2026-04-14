"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { logResolvedChatModel } from "@/app/home/components/logResolvedChatModel";
import MarkdownWithThreads from "@/app/home/components/MarkdownWithThreads";
import type { ThreadSource } from "@/app/home/components/threadTypes";
import type { Message } from "@/app/home/types";
import { markdownContentClassName } from "@/lib/markdown";
import {
  createTemporaryId,
  toChatHistory,
  type ChatMode,
  type TemporaryMemoryMode,
} from "@/lib/chat-session";
import type { ChatModelId } from "@/lib/chat-models";
import type { ThreadMessage } from "@/app/home/components/ThreadPanel";
import { getBrowserTimeZone } from "@/lib/browser-timezone";

const LARGE_RESPONSE_CHAR_LIMIT = 350;
const LARGE_RESPONSE_MAX_HEIGHT = 240;
const LARGE_RESPONSE_MAX_VIEWPORT_RATIO = 0.4;
const COMPLEX_MARKDOWN_PATTERN = /```|(?:^|\n)#{1,6}\s|(?:^|\n)\|.+\|/m;

export interface PopoverState extends ThreadSource {
  anchorRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  selectedText: string;
}

interface TextSelectionPopoverProps {
  popoverState: PopoverState | null;
  chatMode: ChatMode;
  conversationId: string | null;
  mentorId?: string | null;
  modelId: ChatModelId;
  memoryMode: TemporaryMemoryMode;
  history: Message[];
  temporaryThreadMessages: Map<string, ThreadMessage[]>;
  onTemporaryThreadMessagesChange: (threadId: string, messages: ThreadMessage[]) => void;
  onDismiss: () => void;
  onThreadCreated: (threadId: string, source: ThreadSource) => void;
  onGraduateToThread: (
    threadId: string | null,
    source: ThreadSource,
    options?: {
      pendingMessage?: string;
      draftInput?: string;
      loadingQuestion?: string;
      initialMessages?: ThreadMessage[];
    }
  ) => void;
}

function shouldAutoGraduateImmediately(content: string) {
  const normalized = content.trim();
  return normalized.length > LARGE_RESPONSE_CHAR_LIMIT || COMPLEX_MARKDOWN_PATTERN.test(normalized);
}

function buildInitialMessages(
  question: string,
  response: string,
  userMessageId?: string | null,
  assistantMessageId?: string | null
): ThreadMessage[] {
  const now = Date.now();

  return [
    {
      id: userMessageId || now.toString(),
      role: "user",
      content: question,
      timestamp: new Date(now),
    },
    {
      id: assistantMessageId || (now + 1).toString(),
      role: "assistant",
      content: response,
      timestamp: new Date(now + 1),
    },
  ];
}

function buildPendingMessages(
  question: string,
  userMessageId?: string | null
): ThreadMessage[] {
  return [
    {
      id: userMessageId || Date.now().toString(),
      role: "user",
      content: question,
      timestamp: new Date(),
    },
  ];
}

export default function TextSelectionPopover({
  popoverState,
  chatMode,
  conversationId,
  mentorId,
  modelId,
  memoryMode,
  history,
  temporaryThreadMessages,
  onTemporaryThreadMessagesChange,
  onDismiss,
  onThreadCreated,
  onGraduateToThread,
}: TextSelectionPopoverProps) {
  const [customQuestion, setCustomQuestion] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submittedQuestion, setSubmittedQuestion] = useState<string | null>(null);
  const [followUpInput, setFollowUpInput] = useState("");
  const [responseSeedMessages, setResponseSeedMessages] = useState<ThreadMessage[] | null>(null);
  const [responseThreadId, setResponseThreadId] = useState<string | null>(null);
  const [fallbackPlacement, setFallbackPlacement] = useState<"top" | "bottom">("top");
  const [supportsNativePopover, setSupportsNativePopover] = useState(false);
  const [supportsAnchorPositioning, setSupportsAnchorPositioning] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const responseBodyRef = useRef<HTMLDivElement>(null);
  const handoffRef = useRef<{
    selectionKey: string;
    question: string;
    threadId: string | null;
    source: ThreadSource;
  } | null>(null);
  const useNativePopover = supportsNativePopover && supportsAnchorPositioning;

  useEffect(() => {
    setSupportsNativePopover(typeof HTMLDivElement !== "undefined" && "showPopover" in HTMLDivElement.prototype);
    setSupportsAnchorPositioning(
      typeof CSS !== "undefined"
      && CSS.supports("position-anchor: --text-selection-popover-anchor")
      && CSS.supports("position-area: top")
      && CSS.supports("position-try-order: most-height")
    );
  }, []);

  // Reset state when popover closes or selection changes
  const prevSelectionKey = useRef<string | null>(null);
  const activeSelectionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = popoverState
      ? `${popoverState.sourceMessageId}:${popoverState.startOffset}:${popoverState.endOffset}`
      : null;
    activeSelectionKeyRef.current = key;

    if (!popoverState || key !== prevSelectionKey.current) {
      setCustomQuestion("");
      setResponse(null);
      setThreadId(null);
      setIsLoading(false);
      setSubmittedQuestion(null);
      setFollowUpInput("");
      setResponseSeedMessages(null);
      setResponseThreadId(null);
      setFallbackPlacement("top");
    }
    prevSelectionKey.current = key;
  }, [popoverState]);

  useEffect(() => {
    if (!popoverState || useNativePopover) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };

    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 100);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [popoverState, useNativePopover, onDismiss]);

  useEffect(() => {
    if (!popoverState || !useNativePopover || !popoverRef.current) return;

    const popoverEl = popoverRef.current;
    const handleToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      if (toggleEvent.newState === "closed") {
        onDismiss();
      }
    };

    popoverEl.addEventListener("toggle", handleToggle);

    return () => {
      popoverEl.removeEventListener("toggle", handleToggle);
    };
  }, [popoverState, useNativePopover, onDismiss]);

  useEffect(() => {
    if (!popoverState || !useNativePopover || !popoverRef.current) return;

    const popoverEl = popoverRef.current as HTMLDivElement & {
      showPopover?: (options?: { source?: HTMLElement }) => void;
    };
    const anchorEl = anchorRef.current ?? undefined;

    if (!popoverEl.matches(":popover-open")) {
      popoverEl.showPopover?.(anchorEl ? { source: anchorEl } : undefined);
    }
  }, [popoverState, useNativePopover]);

  const sendQuestion = async (question: string) => {
    const activePopoverState = popoverState;
    const requestSelectionKey = activePopoverState
      ? `${activePopoverState.sourceMessageId}:${activePopoverState.startOffset}:${activePopoverState.endOffset}`
      : null;
    const getMatchingHandoff = () =>
      handoffRef.current?.selectionKey === requestSelectionKey
      && handoffRef.current.question === question
        ? handoffRef.current
        : null;
    const isStaleRequest = () =>
      !requestSelectionKey || activeSelectionKeyRef.current !== requestSelectionKey;
    const canUseChat =
      chatMode === "temporary" || (chatMode === "persistent" && conversationId);
    if (!canUseChat || !activePopoverState || isLoading) return;

    setIsLoading(true);
    setSubmittedQuestion(question);
    try {
      const requestedThreadId =
        threadId ?? (chatMode === "temporary" ? createTemporaryId("thread") : null);
      const existingTemporaryMessages = requestedThreadId
        ? temporaryThreadMessages.get(requestedThreadId) || []
        : [];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          conversationId: chatMode === "persistent" ? conversationId : undefined,
          mentorId: mentorId ?? undefined,
          modelId,
          sourceMessageId: activePopoverState.sourceMessageId,
          highlightedText: activePopoverState.selectedText,
          startOffset: activePopoverState.startOffset,
          endOffset: activePopoverState.endOffset,
          concise: true,
          ...(requestedThreadId ? { threadId: requestedThreadId } : {}),
          timezone: getBrowserTimeZone(),
          chatMode,
          ...(chatMode === "temporary"
            ? {
                memoryMode,
                history: toChatHistory(history),
                threadHistory: toChatHistory(existingTemporaryMessages),
              }
            : {}),
        }),
      });

      const data = await res.json();
      logResolvedChatModel(data, 'selection');
      if (isStaleRequest()) {
        const matchingHandoff = getMatchingHandoff();
        if (matchingHandoff && res.ok && data.message) {
          const nextThreadId = data.threadId || requestedThreadId || threadId || matchingHandoff.threadId || null;
          const initialMessages = buildInitialMessages(
            question,
            data.message,
            data.userMessageId,
            data.assistantMessageId
          );

          if (nextThreadId && chatMode === "temporary") {
            onTemporaryThreadMessagesChange(nextThreadId, initialMessages);
          }

          if (nextThreadId && !threadId) {
            onThreadCreated(nextThreadId, matchingHandoff.source);
          }

          onGraduateToThread(
            nextThreadId,
            matchingHandoff.source,
            {
              initialMessages,
            }
          );
          handoffRef.current = null;
        } else if (matchingHandoff) {
          const fallbackResponse = data.error || "Something went wrong.";
          onGraduateToThread(
            matchingHandoff.threadId,
            matchingHandoff.source,
            {
              initialMessages: buildInitialMessages(question, fallbackResponse),
            }
          );
          handoffRef.current = null;
        }
        return;
      }
      if (res.ok && data.message) {
        const nextThreadId = data.threadId || requestedThreadId || threadId || null;
        const initialMessages = buildInitialMessages(
          question,
          data.message,
          data.userMessageId,
          data.assistantMessageId
        );

        if (nextThreadId && chatMode === "temporary") {
          onTemporaryThreadMessagesChange(nextThreadId, initialMessages);
        }

        if (nextThreadId && !threadId) {
          setThreadId(nextThreadId);
          onThreadCreated(nextThreadId, activePopoverState);
        }

        if (nextThreadId && shouldAutoGraduateImmediately(data.message)) {
          onGraduateToThread(
            nextThreadId,
            activePopoverState,
            {
              initialMessages,
            }
          );
          return;
        }

        setResponse(data.message);
        setResponseSeedMessages(nextThreadId ? initialMessages : null);
        setResponseThreadId(nextThreadId);
      } else {
        setResponse(data.error || "Something went wrong.");
      }
    } catch {
      if (isStaleRequest()) {
        const matchingHandoff = getMatchingHandoff();
        if (matchingHandoff) {
          onGraduateToThread(
            matchingHandoff.threadId,
            matchingHandoff.source,
            {
              initialMessages: buildInitialMessages(question, "Something went wrong."),
            }
          );
          handoffRef.current = null;
        }
        return;
      }
      setResponse("Something went wrong.");
    } finally {
      if (!isStaleRequest()) {
        setIsLoading(false);
        setSubmittedQuestion(null);
      }
    }
  };

  const handleDefine = () => {
    if (!popoverState) return;
    sendQuestion(`What is "${popoverState.selectedText}"?`);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customQuestion.trim()) {
      sendQuestion(customQuestion.trim());
    }
  };

  const handleFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!popoverState) return;
    if (followUpInput.trim() && threadId) {
      onGraduateToThread(
        threadId,
        popoverState,
        {
          pendingMessage: followUpInput.trim(),
          initialMessages: responseSeedMessages || undefined,
        }
      );
    }
  };

  useEffect(() => {
    if (!popoverState) return;

    const handleOpenThreadShortcut = (event: KeyboardEvent) => {
      if (
        !event.ctrlKey
        || event.metaKey
        || event.shiftKey
        || event.altKey
        || event.key.toLowerCase() !== "l"
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const nextThreadId =
        responseThreadId
        || threadId
        || (chatMode === "temporary" ? createTemporaryId("thread") : null);
      const loadingPrompt = isLoading ? submittedQuestion : null;
      const draftInput = response ? followUpInput : customQuestion;

      if (loadingPrompt && popoverState) {
        handoffRef.current = {
          selectionKey: `${popoverState.sourceMessageId}:${popoverState.startOffset}:${popoverState.endOffset}`,
          question: loadingPrompt,
          threadId: nextThreadId,
          source: popoverState,
        };
      }

      onGraduateToThread(
        nextThreadId,
        popoverState,
        {
          draftInput: loadingPrompt ? undefined : draftInput,
          loadingQuestion: loadingPrompt || undefined,
          initialMessages: loadingPrompt
            ? buildPendingMessages(loadingPrompt)
            : responseSeedMessages || undefined,
        }
      );
    };

    document.addEventListener("keydown", handleOpenThreadShortcut, true);
    return () => document.removeEventListener("keydown", handleOpenThreadShortcut, true);
  }, [
    chatMode,
    customQuestion,
    followUpInput,
    isLoading,
    onGraduateToThread,
    popoverState,
    response,
    responseSeedMessages,
    responseThreadId,
    submittedQuestion,
    threadId,
  ]);

  useLayoutEffect(() => {
    if (!popoverState || supportsAnchorPositioning) return;

    const popoverEl = popoverRef.current;
    if (!popoverEl) return;
    const scrollContainer =
      popoverEl.offsetParent instanceof HTMLElement ? popoverEl.offsetParent : null;
    const visibleTop = scrollContainer?.scrollTop ?? 0;
    const visibleBottom = visibleTop + (scrollContainer?.clientHeight ?? window.innerHeight);

    const gap = 12;
    const popoverHeight = popoverEl.getBoundingClientRect().height;
    const availableAbove = popoverState.anchorRect.top - visibleTop;
    const anchorBottom = popoverState.anchorRect.top + popoverState.anchorRect.height;
    const availableBelow = visibleBottom - anchorBottom;
    const canFitAbove = availableAbove >= popoverHeight + gap;
    const canFitBelow = availableBelow >= popoverHeight + gap;

    setFallbackPlacement(!canFitAbove && (canFitBelow || availableBelow > availableAbove) ? "bottom" : "top");
  }, [popoverState, response, isLoading, supportsAnchorPositioning]);

  useLayoutEffect(() => {
    if (!popoverState || !response || isLoading || !responseThreadId || !responseSeedMessages) return;

    const answerEl = responseBodyRef.current;
    const popoverEl = popoverRef.current;
    if (!answerEl || !popoverEl) return;
    const scrollContainer =
      popoverEl.offsetParent instanceof HTMLElement ? popoverEl.offsetParent : null;
    const viewportHeight = scrollContainer?.clientHeight ?? window.innerHeight;

    const maxAnswerHeight = Math.min(
      LARGE_RESPONSE_MAX_HEIGHT,
      Math.round(viewportHeight * LARGE_RESPONSE_MAX_VIEWPORT_RATIO)
    );
    const maxPopoverHeight = Math.round(viewportHeight * 0.45);

    if (
      answerEl.scrollHeight > maxAnswerHeight
      || popoverEl.getBoundingClientRect().height > maxPopoverHeight
    ) {
      onGraduateToThread(
        responseThreadId,
        popoverState,
        {
          initialMessages: responseSeedMessages,
        }
      );
    }
  }, [response, isLoading, responseThreadId, responseSeedMessages, onGraduateToThread, popoverState]);

  if (!popoverState) return null;

  const handleMouseDownCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, [contenteditable='true'], .markdown-content")) {
      return;
    }

    e.preventDefault();
  };

  const fallbackStyle: React.CSSProperties | undefined = supportsAnchorPositioning
    ? undefined
    : {
        position: "absolute",
        left: popoverState.anchorRect.left + popoverState.anchorRect.width / 2,
        top: fallbackPlacement === "top"
          ? popoverState.anchorRect.top
          : popoverState.anchorRect.top + popoverState.anchorRect.height,
        transform: fallbackPlacement === "top"
          ? "translate(-50%, calc(-100% - 12px))"
          : "translate(-50%, 12px)",
        zIndex: 60,
      };

  const anchorStyle: React.CSSProperties = {
    position: "absolute",
    left: popoverState.anchorRect.left,
    top: popoverState.anchorRect.top,
    width: Math.max(popoverState.anchorRect.width, 1),
    height: Math.max(popoverState.anchorRect.height, 1),
  };

  return (
    <>
      <div
        ref={anchorRef}
        aria-hidden="true"
        style={anchorStyle}
        className="text-selection-popover-anchor pointer-events-none"
      />
      <div
        ref={popoverRef}
        data-testid="selection-popover"
        popover={useNativePopover ? "auto" : undefined}
        onMouseDownCapture={handleMouseDownCapture}
        style={fallbackStyle}
        className="text-selection-popover w-[min(20rem,calc(100vw-1rem))] rounded-xl border-none bg-surface p-4 text-foreground shadow-lg ring-1 ring-black/[0.08] outline-none dark:ring-white/[0.08]"
      >
        <p className="mb-3 line-clamp-2 text-xs text-muted/60">
          &ldquo;{popoverState.selectedText}&rdquo;
        </p>

        {!response && !isLoading && (
          <>
            <button
              type="button"
              onClick={handleDefine}
              className="mb-2 w-full rounded-lg bg-foreground/5 px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-foreground/10"
            >
              Define
            </button>

            <form onSubmit={handleCustomSubmit}>
              <input
                ref={inputRef}
                data-testid="selection-popover-input"
                type="text"
                value={customQuestion}
                onChange={(e) => setCustomQuestion(e.target.value)}
                placeholder="Ask something about this..."
                className="w-full rounded-lg bg-foreground/5 px-3 py-2 text-sm text-foreground placeholder-muted/50 outline-none focus:ring-1 focus:ring-foreground/10"
              />
            </form>
          </>
        )}

        {isLoading && (
          <div data-testid="selection-popover-loading" className="flex items-center gap-1.5 py-2">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: "300ms" }} />
          </div>
        )}

        {response && !isLoading && (
          <>
            <div
              ref={responseBodyRef}
              className={`${markdownContentClassName} text-sm leading-relaxed text-foreground`}
            >
              <MarkdownWithThreads
                content={response}
                threads={[]}
                onThreadClick={() => {}}
              />
            </div>

            <form onSubmit={handleFollowUp} className="mt-3">
              <input
                data-testid="selection-popover-follow-up-input"
                type="text"
                value={followUpInput}
                onChange={(e) => setFollowUpInput(e.target.value)}
                placeholder="Ask a follow-up..."
                className="w-full rounded-lg bg-foreground/5 px-3 py-2 text-sm text-foreground placeholder-muted/50 outline-none focus:ring-1 focus:ring-foreground/10"
              />
            </form>
          </>
        )}
      </div>
    </>
  );
}
