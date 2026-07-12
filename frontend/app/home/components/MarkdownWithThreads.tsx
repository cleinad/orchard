"use client";

import ReactMarkdown, { type Options } from "react-markdown";
import {
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  markdownRehypePlugins,
  markdownRemarkPlugins,
  normalizeMathMarkdown,
} from "@/lib/markdown";
import {
  boundaryBetweenTags,
  isFormattingWhitespaceText,
  isTableStructureTag,
} from "@/app/home/components/markdownSelectableStream";
import type { InlineThreadMarker } from "@/app/home/components/threadTypes";
import type { PersistedSearchMetadata } from "@/lib/chat-search";
import { splitTextWithCitations } from "@/lib/search-citations";
import InlineCitation, {
  type InlineCitationVariant,
} from "@/app/home/components/InlineCitation";

interface MarkdownWithThreadsProps {
  content: string;
  threads: InlineThreadMarker[];
  onThreadClick: (thread: InlineThreadMarker) => void;
  searchMetadata?: PersistedSearchMetadata | null;
  activeCitationSourceId?: number | null;
  citationVariant?: InlineCitationVariant;
  onCitationClick?: (sourceId: number) => void;
}

type PreProps = ComponentPropsWithoutRef<"pre"> & { node?: unknown };
type SpanProps = ComponentPropsWithoutRef<"span"> & {
  node?: unknown;
  "data-inline-thread-id"?: string;
};
type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  node?: unknown;
  "data-citation-source-id"?: string;
};
type CodeProps = ComponentPropsWithoutRef<"code"> & { node?: unknown };

interface TextMatch {
  start: number;
  end: number;
  thread: InlineThreadMarker;
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
      <div className="code-block__header" data-selection-exclude="true">
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
  thread: InlineThreadMarker;
  onClick: (thread: InlineThreadMarker) => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      data-testid="inline-thread-link"
      data-thread-id={thread.threadId ?? ""}
      data-thread-marker-id={thread.markerId}
      data-thread-session-id={thread.sessionId ?? ""}
      data-thread-status={thread.status}
      data-source-message-id={thread.sourceMessageId}
      onClick={() => onClick(thread)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick(thread);
      }}
      className="box-decoration-clone cursor-pointer rounded-[2px] px-1 py-0.5 transition-colors"
      title="View thread"
    >
      {children}
    </span>
  );
}

function normalizeThreadMatches(threads: InlineThreadMarker[]): TextMatch[] {
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

function getPropertyString(node: HastNode, propertyName: string) {
  const value = node.properties?.[propertyName];
  return typeof value === "string" ? value : null;
}

function getSelectionText(node: HastNode) {
  return getPropertyString(node, "data-selection-text");
}

function isSelectionExcluded(node: HastNode) {
  return node.properties?.["data-selection-exclude"] !== undefined;
}

function isInlineThreadNode(node: HastNode) {
  return typeof node.properties?.["data-inline-thread-id"] === "string";
}

function annotateSelectionTextNodes(nodes: HastNode[] | undefined): HastNode[] | undefined {
  if (!nodes || nodes.length === 0) {
    return nodes;
  }

  return nodes.map((node) => {
    if (node.type !== "element") {
      return node;
    }

    const classNames = getClassNames(node);
    if (classNames.includes("katex-mathml")) {
      return {
        ...node,
        properties: {
          ...node.properties,
          "data-selection-exclude": "true",
        },
      };
    }

    return {
      ...node,
      children: annotateSelectionTextNodes(node.children),
    };
  });
}

function rehypeSelectionText() {
  return (tree: HastNode) => {
    tree.children = annotateSelectionTextNodes(tree.children);
  };
}

function shouldSkipInlineThreadWrapping(node: HastNode) {
  const classNames = getClassNames(node);
  return (
    isSelectionExcluded(node) ||
    isInlineThreadNode(node) ||
    node.tagName === "math" ||
    node.tagName === "annotation" ||
    classNames.includes("katex-mathml")
  );
}

function shouldSkipInlineCitationWrapping(node: HastNode) {
  const classNames = getClassNames(node);
  return (
    node.tagName === "pre" ||
    node.tagName === "math" ||
    node.tagName === "annotation" ||
    node.tagName === "button" ||
    classNames.includes("hljs") ||
    classNames.some((className) => className.startsWith("katex")) ||
    typeof node.properties?.["data-inline-thread-id"] === "string"
  );
}

function getHastTagName(node: HastNode) {
  return node.type === "element" ? node.tagName ?? null : null;
}

function canContainInlineThreadMarker(tagName: string | null) {
  return !isTableStructureTag(tagName);
}

function shouldIgnoreStructuralText(node: HastNode, parentTagName: string | null) {
  if (node.type !== "text") {
    return false;
  }

  const value = node.value ?? "";
  return isTableStructureTag(parentTagName) || isFormattingWhitespaceText(value, parentTagName);
}

function getHastTextLength(node: HastNode): number {
  if (node.type === "text") {
    return node.value?.length ?? 0;
  }

  if (node.type === "element") {
    const classNames = getClassNames(node);
    if (
      isSelectionExcluded(node)
      || node.tagName === "math"
      || node.tagName === "annotation"
      || classNames.includes("katex-mathml")
    ) {
      return 0;
    }

    const selectionText = getSelectionText(node);
    if (selectionText !== null) {
      return selectionText.length;
    }
  }

  return getHastChildrenTextLength(node.children, node.tagName ?? null);
}

function getHastChildrenTextLength(
  nodes: HastNode[] | undefined,
  parentTagName: string | null
) {
  if (!nodes || nodes.length === 0) {
    return 0;
  }

  let total = 0;
  let previousIncludedTagName: string | null = null;

  for (const child of nodes) {
    if (shouldIgnoreStructuralText(child, parentTagName)) {
      continue;
    }

    const childTagName = getHastTagName(child);
    const boundary = boundaryBetweenTags(parentTagName, previousIncludedTagName, childTagName);
    if (boundary) {
      total += boundary.length;
    }

    total += getHastTextLength(child);
    if (childTagName && child.type === "element" && !shouldSkipInlineThreadWrapping(child)) {
      previousIncludedTagName = childTagName;
    }
  }

  return total;
}

function createThreadSpanNode(text: string, thread: InlineThreadMarker): HastNode {
  return {
    type: "element",
    tagName: "span",
    properties: {
      "data-inline-thread-id": thread.markerId,
    },
    children: [{ type: "text", value: text }],
  };
}

function createCitationNode(text: string, sourceId: number): HastNode {
  return {
    type: "element",
    tagName: "button",
    properties: {
      type: "button",
      "data-citation-source-id": String(sourceId),
      "data-selection-text": text,
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

function annotateAtomicThreadNode(
  node: HastNode,
  matches: TextMatch[],
  cursorRef: CursorRef
): HastNode {
  const selectionText = getSelectionText(node) ?? "";
  const textStartOffset = cursorRef.current;
  const textEndOffset = textStartOffset + selectionText.length;
  const match = matches.find(
    (candidate) => candidate.start < textEndOffset && candidate.end > textStartOffset
  );

  cursorRef.current = textEndOffset;

  if (!match) {
    return node;
  }

  return {
    type: "element",
    tagName: "span",
    properties: {
      "data-inline-thread-id": match.thread.markerId,
    },
    children: [node],
  };
}

function annotateThreadNodes(
  nodes: HastNode[] | undefined,
  matches: TextMatch[],
  cursorRef: CursorRef,
  parentTagName: string | null
): HastNode[] | undefined {
  if (!nodes || nodes.length === 0 || matches.length === 0) {
    return nodes;
  }

  const nextChildren: HastNode[] = [];
  let previousIncludedTagName: string | null = null;

  for (const child of nodes) {
    if (shouldIgnoreStructuralText(child, parentTagName)) {
      nextChildren.push(child);
      continue;
    }

    const childTagName = getHastTagName(child);
    const boundary = boundaryBetweenTags(parentTagName, previousIncludedTagName, childTagName);
    if (boundary) {
      cursorRef.current += boundary.length;
    }

    if (child.type === "text") {
      if (canContainInlineThreadMarker(parentTagName)) {
        nextChildren.push(...splitTextNode(child, matches, cursorRef));
      } else {
        cursorRef.current += child.value?.length ?? 0;
        nextChildren.push(child);
      }
      continue;
    }

    if (child.type === "element") {
      if (shouldSkipInlineThreadWrapping(child)) {
        cursorRef.current += getHastTextLength(child);
        nextChildren.push(child);
        if (isInlineThreadNode(child)) {
          previousIncludedTagName = child.tagName ?? previousIncludedTagName;
        }
        continue;
      }

      if (getSelectionText(child) !== null) {
        if (canContainInlineThreadMarker(parentTagName)) {
          nextChildren.push(annotateAtomicThreadNode(child, matches, cursorRef));
        } else {
          cursorRef.current += getHastTextLength(child);
          nextChildren.push(child);
        }
        previousIncludedTagName = child.tagName ?? previousIncludedTagName;
        continue;
      }

      nextChildren.push({
        ...child,
        children: annotateThreadNodes(
          child.children,
          matches,
          cursorRef,
          child.tagName ?? null
        ),
      });
      previousIncludedTagName = child.tagName ?? previousIncludedTagName;
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
    tree.children = annotateThreadNodes(tree.children, matches, cursorRef, null);
  };
}

function splitCitationTextNode(node: HastNode, validSourceIds: ReadonlySet<number>): HastNode[] {
  const text = node.value ?? "";
  if (text.length === 0 || validSourceIds.size === 0) {
    return [node];
  }

  const parts = splitTextWithCitations(text, validSourceIds);
  if (parts.length === 1 && parts[0]?.type === "text") {
    return [node];
  }

  return parts.map((part) =>
    part.type === "text"
      ? { type: "text", value: part.text }
      : createCitationNode(part.text, part.sourceId)
  );
}

function annotateCitationNodes(
  nodes: HastNode[] | undefined,
  validSourceIds: ReadonlySet<number>
): HastNode[] | undefined {
  if (!nodes || nodes.length === 0 || validSourceIds.size === 0) {
    return nodes;
  }

  const nextChildren: HastNode[] = [];

  for (const child of nodes) {
    if (child.type === "text") {
      nextChildren.push(...splitCitationTextNode(child, validSourceIds));
      continue;
    }

    if (child.type === "element") {
      if (shouldSkipInlineCitationWrapping(child)) {
        nextChildren.push(child);
        continue;
      }

      nextChildren.push({
        ...child,
        children: annotateCitationNodes(child.children, validSourceIds),
      });
      continue;
    }

    nextChildren.push(child);
  }

  return nextChildren;
}

function rehypeInlineCitations(validSourceIds: ReadonlySet<number>) {
  return (tree: HastNode) => {
    if (validSourceIds.size === 0) {
      return;
    }

    tree.children = annotateCitationNodes(tree.children, validSourceIds);
  };
}

export default function MarkdownWithThreads({
  content,
  threads,
  onThreadClick,
  searchMetadata = null,
  activeCitationSourceId = null,
  citationVariant = "numberOnly",
  onCitationClick,
}: MarkdownWithThreadsProps) {
  const matches = useMemo(() => normalizeThreadMatches(threads), [threads]);
  const threadById = useMemo(
    () => new Map(matches.map((match) => [match.thread.markerId, match.thread])),
    [matches]
  );
  const validCitationSourceIds = useMemo(
    () =>
      (searchMetadata?.status === "success" || searchMetadata?.status === "partial") && onCitationClick
        ? new Set(searchMetadata.sources.map((source) => source.id))
        : new Set<number>(),
    [onCitationClick, searchMetadata]
  );
  const sourceById = useMemo(
    () => new Map((searchMetadata?.sources ?? []).map((source) => [source.id, source])),
    [searchMetadata]
  );
  const rehypePlugins: NonNullable<Options["rehypePlugins"]> = useMemo(() => {
    const inlineThreadPlugin =
      [rehypeInlineThreads, matches] as unknown as NonNullable<
        Options["rehypePlugins"]
      >[number];
    const inlineCitationPlugin =
      [rehypeInlineCitations, validCitationSourceIds] as unknown as NonNullable<
        Options["rehypePlugins"]
      >[number];

    return [
      ...markdownRehypePlugins,
      rehypeSelectionText as unknown as NonNullable<Options["rehypePlugins"]>[number],
      ...(matches.length > 0 ? [inlineThreadPlugin] : []),
      ...(validCitationSourceIds.size > 0 ? [inlineCitationPlugin] : []),
    ];
  }, [matches, validCitationSourceIds]);
  const components = useMemo<NonNullable<Options["components"]>>(
    () => ({
      pre: CodeBlock,
      code: ({ children, ...props }: CodeProps) => (
        <code {...props}>
          <span className="inline-code__content">{children}</span>
        </code>
      ),
      span: ({ children, ...props }: SpanProps) => {
        const threadId = props["data-inline-thread-id"];
        if (typeof threadId === "string") {
          const thread = threadById.get(threadId);
          if (thread) {
            const rest = { ...props };
            delete rest["data-inline-thread-id"];
            return (
              <ThreadIndicator thread={thread} onClick={onThreadClick}>
                <span {...rest}>{children}</span>
              </ThreadIndicator>
            );
          }
        }

        return <span {...props}>{children}</span>;
      },
      button: ({ children, ...props }: ButtonProps) => {
        const sourceId = props["data-citation-source-id"];
        if (typeof sourceId === "string" && onCitationClick) {
          const numericSourceId = Number(sourceId);
          if (Number.isInteger(numericSourceId)) {
            const rest = { ...props };
            delete rest["data-citation-source-id"];
            delete rest.type;
            const source = sourceById.get(numericSourceId);

            return (
              <InlineCitation
                {...rest}
                active={activeCitationSourceId === numericSourceId}
                onClick={() => onCitationClick(numericSourceId)}
                source={source}
                sourceId={numericSourceId}
                variant={citationVariant}
              />
            );
          }
        }

        return <button {...props}>{children}</button>;
      },
    }),
    [
      activeCitationSourceId,
      citationVariant,
      onCitationClick,
      onThreadClick,
      sourceById,
      threadById,
    ]
  );
  const normalizedContent = normalizeMathMarkdown(content);

  return (
    <ReactMarkdown
      remarkPlugins={markdownRemarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
    >
      {normalizedContent}
    </ReactMarkdown>
  );
}
