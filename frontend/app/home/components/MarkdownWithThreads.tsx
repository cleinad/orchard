"use client";

import ReactMarkdown, { type Options } from "react-markdown";
import {
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
import type { ThreadMeta } from "@/app/home/components/threadTypes";

interface MarkdownWithThreadsProps {
  content: string;
  threads: ThreadMeta[];
  onThreadClick: (thread: ThreadMeta) => void;
}

type PreProps = ComponentPropsWithoutRef<"pre"> & { node?: unknown };
type SpanProps = ComponentPropsWithoutRef<"span"> & {
  node?: unknown;
  "data-inline-thread-id"?: string;
};

interface TextMatch {
  start: number;
  end: number;
  thread: ThreadMeta;
}

interface CursorRef {
  current: number;
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

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

function findCodeElement(
  children: ReactNode
): ReactElement<{ className?: string; children?: ReactNode }> | null {
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

function normalizeThreadMatches(threads: ThreadMeta[]): TextMatch[] {
  const normalizedThreads = [...threads]
    .filter((thread) => thread.endOffset > thread.startOffset)
    .sort(
      (a, b) =>
        a.startOffset - b.startOffset
        || (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset)
    );
  const matches: TextMatch[] = [];

  for (const thread of normalizedThreads) {
    const overlaps = matches.some(
      (match) => thread.startOffset < match.end && thread.endOffset > match.start
    );

    if (!overlaps) {
      matches.push({
        start: thread.startOffset,
        end: thread.endOffset,
        thread,
      });
    }
  }

  return matches;
}

function getClassNames(node: HastNode): string[] {
  const className = node.properties?.className;

  if (Array.isArray(className)) {
    return className.filter((value): value is string => typeof value === "string");
  }

  if (typeof className === "string") {
    return className.split(/\s+/).filter(Boolean);
  }

  return [];
}

function shouldSkipInlineThreadWrapping(node: HastNode) {
  const classNames = getClassNames(node);
  return (
    node.tagName === "pre" ||
    node.tagName === "math" ||
    node.tagName === "annotation" ||
    classNames.includes("hljs") ||
    classNames.some((className) => className.startsWith("katex"))
  );
}

function getHastTextLength(node: HastNode): number {
  if (node.type === "text") {
    return node.value?.length ?? 0;
  }

  return (node.children || []).reduce((total, child) => total + getHastTextLength(child), 0);
}

function createThreadSpanNode(text: string, thread: ThreadMeta): HastNode {
  return {
    type: "element",
    tagName: "span",
    properties: {
      "data-inline-thread-id": thread.threadId,
    },
    children: [{ type: "text", value: text }],
  };
}

function splitTextNode(node: HastNode, matches: TextMatch[], cursorRef: CursorRef): HastNode[] {
  const text = node.value ?? "";
  if (text.length === 0 || matches.length === 0) {
    cursorRef.current += text.length;
    return [node];
  }

  const textStartOffset = cursorRef.current;
  const textEndOffset = textStartOffset + text.length;
  const relevantMatches = matches.filter(
    (match) => match.start < textEndOffset && match.end > textStartOffset
  );

  cursorRef.current = textEndOffset;

  if (relevantMatches.length === 0) {
    return [node];
  }

  const parts: HastNode[] = [];
  let cursor = 0;

  for (const match of relevantMatches) {
    const matchStart = Math.max(match.start, textStartOffset) - textStartOffset;
    const matchEnd = Math.min(match.end, textEndOffset) - textStartOffset;

    if (matchStart > cursor) {
      parts.push({ type: "text", value: text.slice(cursor, matchStart) });
    }

    parts.push(createThreadSpanNode(text.slice(matchStart, matchEnd), match.thread));
    cursor = matchEnd;
  }

  if (cursor < text.length) {
    parts.push({ type: "text", value: text.slice(cursor) });
  }

  return parts;
}

function annotateThreadNodes(
  nodes: HastNode[] | undefined,
  matches: TextMatch[],
  cursorRef: CursorRef
): HastNode[] | undefined {
  if (!nodes || nodes.length === 0 || matches.length === 0) {
    return nodes;
  }

  const nextChildren: HastNode[] = [];

  for (const child of nodes) {
    if (child.type === "text") {
      nextChildren.push(...splitTextNode(child, matches, cursorRef));
      continue;
    }

    if (child.type === "element") {
      if (shouldSkipInlineThreadWrapping(child)) {
        cursorRef.current += getHastTextLength(child);
        nextChildren.push(child);
        continue;
      }

      nextChildren.push({
        ...child,
        children: annotateThreadNodes(child.children, matches, cursorRef),
      });
      continue;
    }

    nextChildren.push(child);
  }

  return nextChildren;
}

function rehypeInlineThreads(matches: TextMatch[]) {
  return (tree: HastNode) => {
    if (matches.length === 0) {
      return;
    }

    const cursorRef: CursorRef = { current: 0 };
    tree.children = annotateThreadNodes(tree.children, matches, cursorRef);
  };
}

export default function MarkdownWithThreads({
  content,
  threads,
  onThreadClick,
}: MarkdownWithThreadsProps) {
  const matches = normalizeThreadMatches(threads);
  const threadById = new Map(matches.map((match) => [match.thread.threadId, match.thread]));
  const inlineThreadPlugin =
    [rehypeInlineThreads, matches] as unknown as NonNullable<Options["rehypePlugins"]>[number];
  const rehypePlugins: NonNullable<Options["rehypePlugins"]> =
    matches.length > 0
      ? [...markdownRehypePlugins, inlineThreadPlugin]
      : markdownRehypePlugins;

  return (
    <ReactMarkdown
      remarkPlugins={markdownRemarkPlugins}
      rehypePlugins={rehypePlugins}
      components={{
        pre: CodeBlock,
        span: ({ children, ...props }: SpanProps) => {
          const threadId = props["data-inline-thread-id"];
          if (typeof threadId === "string") {
            const thread = threadById.get(threadId);
            if (thread) {
              const { ["data-inline-thread-id"]: _ignored, ...rest } = props;
              return (
                <ThreadIndicator thread={thread} onClick={onThreadClick}>
                  <span {...rest}>{children}</span>
                </ThreadIndicator>
              );
            }
          }

          return <span {...props}>{children}</span>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
