"use client";

import ReactMarkdown from "react-markdown";
import {
  Fragment,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  markdownRehypePlugins,
  markdownRemarkPlugins,
} from "@/lib/markdown";

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

type PreProps = ComponentPropsWithoutRef<"pre"> & { node?: unknown };

const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Bash",
  css: "CSS",
  html: "HTML",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  markdown: "Markdown",
  md: "Markdown",
  plaintext: "Plain text",
  py: "Python",
  python: "Python",
  shell: "Shell",
  sh: "Shell",
  sql: "SQL",
  text: "Plain text",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  yaml: "YAML",
  yml: "YAML",
};

function formatLanguageLabel(language: string | null) {
  if (!language) return "Plain text";

  const normalized = language.toLowerCase();
  const knownLabel = LANGUAGE_LABELS[normalized];
  if (knownLabel) return knownLabel;

  return normalized
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractCodeText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);

  if (Array.isArray(children)) {
    return children.map(extractCodeText).join("");
  }

  if (isValidElement(children)) {
    const element = children as ReactElement<{ children?: ReactNode }>;
    return extractCodeText(element.props.children);
  }

  return "";
}

function findCodeElement(children: ReactNode): ReactElement<{ className?: string; children?: ReactNode }> | null {
  if (isValidElement(children)) {
    return children as ReactElement<{ className?: string; children?: ReactNode }>;
  }

  if (!Array.isArray(children)) return null;

  for (const child of children) {
    if (isValidElement(child)) {
      return child as ReactElement<{ className?: string; children?: ReactNode }>;
    }
  }

  return null;
}

function extractLanguage(children: ReactNode): string | null {
  const codeElement = findCodeElement(children);
  if (!codeElement) return null;

  const className = codeElement.props.className || "";
  const match = /language-([\w-]+)/.exec(className);
  return match?.[1] ?? null;
}

function CodeBlock({ children, className, ...props }: PreProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const codeText = extractCodeText(children).replace(/\n$/, "");
  const language = extractLanguage(children);
  const languageLabel = formatLanguageLabel(language);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!codeText) return;

    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);

      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }

      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="code-block">
      <div className="code-block__header">
        <div className="code-block__meta">
          <span className="code-block__traffic" aria-hidden="true">
            <span className="code-block__traffic-dot code-block__traffic-dot--love" />
            <span className="code-block__traffic-dot code-block__traffic-dot--gold" />
            <span className="code-block__traffic-dot code-block__traffic-dot--foam" />
          </span>
          <span className="code-block__language">{languageLabel}</span>
        </div>
        <button
          type="button"
          className="code-block__copy"
          onClick={handleCopy}
          aria-label={copied ? "Code copied" : `Copy ${languageLabel} code`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre {...props} className={className}>
        {children}
      </pre>
    </div>
  );
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
      data-testid="inline-thread-link"
      data-thread-id={thread.threadId}
      data-source-message-id={thread.sourceMessageId}
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
  return (
    <ReactMarkdown
      remarkPlugins={markdownRemarkPlugins}
      rehypePlugins={markdownRehypePlugins}
      components={{
        pre: CodeBlock,
        ...(threads.length > 0
          ? {
              p: ({ children, ...props }: ComponentPropsWithoutRef<"p">) => {
                const processed = processChildren(children, threads, onThreadClick, "p");
                return <p {...props}>{processed}</p>;
              },
              li: ({ children, ...props }: ComponentPropsWithoutRef<"li">) => {
                const processed = processChildren(children, threads, onThreadClick, "li");
                return <li {...props}>{processed}</li>;
              },
            }
          : undefined),
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
    const element = children as ReactElement<{ children?: ReactNode; className?: string }>;
    const elementType = typeof element.type === "string" ? element.type : null;
    const classNames =
      typeof element.props.className === "string" ? element.props.className.split(/\s+/) : [];

    if (
      elementType === "code" ||
      elementType === "pre" ||
      elementType === "math" ||
      elementType === "annotation" ||
      classNames.includes("hljs") ||
      classNames.some((className) => className.startsWith("katex"))
    ) {
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
