"use client";

import ReactMarkdown from "react-markdown";
import {
  Fragment,
  cloneElement,
  isValidElement,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";

export interface ThreadMeta {
  threadId: string;
  highlightedText: string;
  sourceMessageId: string;
}

interface MarkdownWithThreadsProps {
  content: string;
  threads: ThreadMeta[];
  onThreadClick: (thread: ThreadMeta) => void;
}

function ThreadIndicator({
  children,
  thread,
  onClick,
}: {
  children: ReactNode;
  thread: ThreadMeta;
  onClick: (thread: ThreadMeta) => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => onClick(thread)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick(thread);
      }}
      className="box-decoration-clone cursor-pointer rounded-[0.35rem] bg-amber-200/45 px-1 py-0.5 font-medium text-stone-950 ring-1 ring-amber-500/25 transition-colors hover:bg-amber-200/70 hover:ring-amber-500/40 dark:bg-amber-300/15 dark:text-amber-100 dark:ring-amber-300/20 dark:hover:bg-amber-300/25"
      title="View thread"
    >
      {children}
    </span>
  );
}

interface TextMatch {
  start: number;
  end: number;
  thread: ThreadMeta;
}

function getTextMatches(text: string, threads: ThreadMeta[]): TextMatch[] {
  const matches: TextMatch[] = [];

  for (const thread of [...threads].sort((a, b) => b.highlightedText.length - a.highlightedText.length)) {
    const needle = thread.highlightedText;
    if (!needle) continue;

    let searchFrom = 0;

    while (searchFrom <= text.length - needle.length) {
      const start = text.indexOf(needle, searchFrom);
      if (start === -1) break;

      const end = start + needle.length;
      const overlaps = matches.some((match) => start < match.end && end > match.start);
      if (!overlaps) {
        matches.push({ start, end, thread });
        break;
      }

      searchFrom = start + 1;
    }
  }

  return matches.sort((a, b) => a.start - b.start || a.end - b.end);
}

function splitTextWithThreads(
  text: string,
  threads: ThreadMeta[],
  onThreadClick: (thread: ThreadMeta) => void,
  keyPrefix: string
): ReactNode[] {
  if (threads.length === 0) return [text];

  const matches = getTextMatches(text, threads);
  if (matches.length === 0) return [text];

  const parts: ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      parts.push(text.slice(cursor, match.start));
    }

    parts.push(
      <ThreadIndicator
        key={`${keyPrefix}-thread-${index}`}
        thread={match.thread}
        onClick={onThreadClick}
      >
        {text.slice(match.start, match.end)}
      </ThreadIndicator>
    );

    cursor = match.end;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts.length > 0 ? parts : [text];
}

export default function MarkdownWithThreads({
  content,
  threads,
  onThreadClick,
}: MarkdownWithThreadsProps) {
  if (threads.length === 0) {
    return <ReactMarkdown>{content}</ReactMarkdown>;
  }

  return (
    <ReactMarkdown
      components={{
        p: ({ children, ...props }: ComponentPropsWithoutRef<"p">) => {
          const processed = processChildren(children, threads, onThreadClick, "p");
          return <p {...props}>{processed}</p>;
        },
        li: ({ children, ...props }: ComponentPropsWithoutRef<"li">) => {
          const processed = processChildren(children, threads, onThreadClick, "li");
          return <li {...props}>{processed}</li>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function processChildren(
  children: ReactNode,
  threads: ThreadMeta[],
  onThreadClick: (thread: ThreadMeta) => void,
  keyPrefix: string
): ReactNode {
  if (typeof children === "string") {
    const parts = splitTextWithThreads(children, threads, onThreadClick, keyPrefix);
    return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => {
      const processedChild = processChildren(child, threads, onThreadClick, `${keyPrefix}-${i}`);

      if (processedChild === child) {
        return child;
      }

      if (isValidElement(processedChild)) {
        return cloneElement(processedChild, { key: `${keyPrefix}-${i}` });
      }

      return <Fragment key={`${keyPrefix}-${i}`}>{processedChild}</Fragment>;
    });
  }

  if (isValidElement(children)) {
    const element = children as ReactElement<{ children?: ReactNode }>;
    const elementType = typeof element.type === "string" ? element.type : null;

    if (elementType === "code" || elementType === "pre") {
      return children;
    }

    const processed = processChildren(
      element.props.children,
      threads,
      onThreadClick,
      `${keyPrefix}-${elementType || "node"}`
    );

    if (processed === element.props.children) {
      return children;
    }

    return cloneElement(element, undefined, processed);
  }

  return children;
}
