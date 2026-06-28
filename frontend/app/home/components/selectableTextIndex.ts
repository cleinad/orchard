"use client";

import {
  DEFAULT_SELECTION_STREAM_VERSION,
  boundaryBetweenTags,
  getSelectionStreamVersion,
  isFormattingWhitespaceText,
  isTableStructureTag,
  type SelectionStreamVersion,
} from '@/app/home/components/markdownSelectableStream';

interface TextSegment {
  kind: "text";
  node: Text;
  start: number;
  end: number;
  text: string;
}

interface AtomicSegment {
  kind: "atomic";
  element: HTMLElement;
  start: number;
  end: number;
  text: string;
}

interface BoundarySegment {
  kind: "boundary";
  start: number;
  end: number;
  text: "\n" | "\t";
}

type SelectableTextSegment = TextSegment | AtomicSegment | BoundarySegment;
type VisibleSelectableTextSegment = TextSegment | AtomicSegment;

interface BoundaryPoint {
  node: Node;
  offset: number;
}

export interface SelectableTextIndex {
  root: Element;
  text: string;
  segments: SelectableTextSegment[];
}

export interface SelectionOffsets {
  selectedText: string;
  startOffset: number;
  endOffset: number;
}

const EXCLUDE_SELECTOR = "[data-selection-exclude]";
const CANONICAL_TEXT_ATTRIBUTE = "data-selection-text";

function isHTMLElement(value: Node): value is HTMLElement {
  return value instanceof HTMLElement;
}

function getParentElement(node: Node) {
  return node instanceof Element ? node : node.parentElement;
}

function isInsideExcludedContent(node: Node) {
  return Boolean(getParentElement(node)?.closest(EXCLUDE_SELECTOR));
}

function getCanonicalText(element: Element) {
  return element.getAttribute(CANONICAL_TEXT_ATTRIBUTE);
}

function shouldIgnoreTextNode(node: Node, parentTagName: string | null) {
  const value = node.textContent ?? "";
  return isTableStructureTag(parentTagName) || isFormattingWhitespaceText(value, parentTagName);
}

function getElementBoundary(element: Element, edge: "before" | "after"): BoundaryPoint | null {
  const parent = element.parentNode;
  if (!parent) return null;

  const offset = Array.prototype.indexOf.call(parent.childNodes, element);
  if (offset < 0) return null;

  return {
    node: parent,
    offset: edge === "before" ? offset : offset + 1,
  };
}

function createCollapsedRange(point: BoundaryPoint) {
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  return range;
}

function createSegmentRange(segment: SelectableTextSegment) {
  const range = document.createRange();

  if (segment.kind === "boundary") {
    range.setStart(document.body, 0);
    range.collapse(true);
    return range;
  }

  if (segment.kind === "text") {
    range.setStart(segment.node, 0);
    range.setEnd(segment.node, segment.text.length);
    return range;
  }

  range.setStartBefore(segment.element);
  range.setEndAfter(segment.element);
  return range;
}

function comparePointToSegmentStart(point: BoundaryPoint, segment: SelectableTextSegment) {
  if (segment.kind === "boundary") {
    return -1;
  }

  const pointRange = createCollapsedRange(point);
  const segmentRange = createSegmentRange(segment);
  const result = pointRange.compareBoundaryPoints(Range.START_TO_START, segmentRange);
  pointRange.detach();
  segmentRange.detach();
  return result;
}

function comparePointToSegmentEnd(point: BoundaryPoint, segment: SelectableTextSegment) {
  if (segment.kind === "boundary") {
    return 1;
  }

  const pointRange = createCollapsedRange(point);
  const segmentRange = createSegmentRange(segment);
  const result = pointRange.compareBoundaryPoints(Range.START_TO_END, segmentRange);
  pointRange.detach();
  segmentRange.detach();
  return result;
}

function findAtomicSegmentContaining(
  index: SelectableTextIndex,
  node: Node
): AtomicSegment | null {
  return (
    index.segments.find(
      (segment): segment is AtomicSegment =>
        segment.kind === "atomic" && (segment.element === node || segment.element.contains(node))
    ) ?? null
  );
}

function pointToOffset(
  index: SelectableTextIndex,
  point: BoundaryPoint,
  edge: "start" | "end"
) {
  if (isInsideExcludedContent(point.node)) {
    return null;
  }

  const containingAtomicSegment = findAtomicSegmentContaining(index, point.node);
  if (containingAtomicSegment) {
    return edge === "start" ? containingAtomicSegment.start : containingAtomicSegment.end;
  }

  for (const segment of index.segments) {
    if (segment.kind === "boundary") {
      continue;
    }

    if (segment.kind === "text" && segment.node === point.node) {
      return segment.start + Math.min(Math.max(point.offset, 0), segment.text.length);
    }

    const startComparison = comparePointToSegmentStart(point, segment);
    if (startComparison <= 0) {
      return segment.start;
    }

    const endComparison = comparePointToSegmentEnd(point, segment);
    if (endComparison < 0) {
      return edge === "start" ? segment.start : segment.end;
    }
  }

  return index.text.length;
}

function findVisibleSegmentFromOffset(
  index: SelectableTextIndex,
  offset: number,
  edge: "start" | "end"
): VisibleSelectableTextSegment | null {
  if (edge === "start") {
    return (
      index.segments.find(
        (segment): segment is VisibleSelectableTextSegment =>
          segment.kind !== "boundary" && offset >= segment.start && offset <= segment.end
      )
      ?? index.segments.find(
        (segment): segment is VisibleSelectableTextSegment =>
          segment.kind !== "boundary" && segment.end > offset
      )
      ?? null
    );
  }

  for (let indexOffset = index.segments.length - 1; indexOffset >= 0; indexOffset -= 1) {
    const segment = index.segments[indexOffset];
    if (segment.kind !== "boundary" && offset >= segment.start && offset <= segment.end) {
      return segment;
    }
  }

  for (let indexOffset = index.segments.length - 1; indexOffset >= 0; indexOffset -= 1) {
    const segment = index.segments[indexOffset];
    if (segment.kind !== "boundary" && segment.start < offset) {
      return segment;
    }
  }

  return null;
}

function boundaryFromOffset(
  index: SelectableTextIndex,
  offset: number,
  edge: "start" | "end"
): BoundaryPoint | null {
  if (index.segments.length === 0) return null;

  const clampedOffset = Math.min(Math.max(offset, 0), index.text.length);
  const segment = findVisibleSegmentFromOffset(index, clampedOffset, edge);

  if (!segment) {
    return null;
  }

  if (segment.kind === "text") {
    return {
      node: segment.node,
      offset:
        edge === "start"
          ? Math.min(Math.max(clampedOffset - segment.start, 0), segment.text.length)
          : Math.min(Math.max(clampedOffset - segment.start, 0), segment.text.length),
    };
  }

  return getElementBoundary(segment.element, edge === "start" ? "before" : "after");
}

function trimSelectionOffsets(
  index: SelectableTextIndex,
  startOffset: number,
  endOffset: number
): SelectionOffsets | null {
  const rawSelectedText = index.text.slice(startOffset, endOffset);
  const leadingWhitespace = rawSelectedText.match(/^\s*/)?.[0].length ?? 0;
  const trailingWhitespace = rawSelectedText.match(/\s*$/)?.[0].length ?? 0;
  const trimmedEndOffset = Math.max(startOffset + leadingWhitespace, endOffset - trailingWhitespace);
  const trimmedStartOffset = startOffset + leadingWhitespace;
  const selectedText = index.text.slice(trimmedStartOffset, trimmedEndOffset);

  if (!selectedText) {
    return null;
  }

  return {
    selectedText,
    startOffset: trimmedStartOffset,
    endOffset: trimmedEndOffset,
  };
}

export function buildSelectableTextIndex(root: Element): SelectableTextIndex {
  const segments: SelectableTextSegment[] = [];
  let text = "";

  const appendSegment = (
    segment:
      | Omit<TextSegment, "start" | "end">
      | Omit<AtomicSegment, "start" | "end">
      | Omit<BoundarySegment, "start" | "end">
  ) => {
    if (!segment.text) return;

    const start = text.length;
    text += segment.text;
    segments.push({
      ...segment,
      start,
      end: text.length,
    } as SelectableTextSegment);
  };

  const getElementTagName = (node: Node) =>
    node instanceof HTMLElement ? node.tagName.toLowerCase() : null;

  const walkChildren = (parent: Node, parentTagName: string | null = null) => {
    let previousIncludedTagName: string | null = null;

    parent.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE && shouldIgnoreTextNode(child, parentTagName)) {
        return;
      }

      const nextTagName = getElementTagName(child);
      const boundary = boundaryBetweenTags(parentTagName, previousIncludedTagName, nextTagName);
      if (boundary) {
        appendSegment({
          kind: "boundary",
          text: boundary,
        });
      }

      const includedTagName = walk(child);
      if (includedTagName) {
        previousIncludedTagName = includedTagName;
      }
    });
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendSegment({
        kind: "text",
        node: node as Text,
        text: node.textContent ?? "",
      });
      return null;
    }

    if (!isHTMLElement(node)) {
      walkChildren(node);
      return null;
    }

    if (node.matches(EXCLUDE_SELECTOR)) {
      return null;
    }

    const canonicalText = getCanonicalText(node);
    if (canonicalText !== null) {
      appendSegment({
        kind: "atomic",
        element: node,
        text: canonicalText,
      });
      return node.tagName.toLowerCase();
    }

    walkChildren(node, node.tagName.toLowerCase());
    return node.tagName.toLowerCase();
  };

  walkChildren(root);

  return {
    root,
    text,
    segments,
  };
}

export function getOffsetsFromRange(
  root: Element,
  range: Range,
  version: SelectionStreamVersion = DEFAULT_SELECTION_STREAM_VERSION
): SelectionOffsets | null {
  getSelectionStreamVersion(version);
  const index = buildSelectableTextIndex(root);
  const startOffset = pointToOffset(
    index,
    { node: range.startContainer, offset: range.startOffset },
    "start"
  );
  const endOffset = pointToOffset(
    index,
    { node: range.endContainer, offset: range.endOffset },
    "end"
  );

  if (startOffset === null || endOffset === null || endOffset <= startOffset) {
    return null;
  }

  return trimSelectionOffsets(index, startOffset, endOffset);
}

export function restoreRangeFromOffsets(
  root: Element,
  startOffset: number,
  endOffset: number,
  version: SelectionStreamVersion = DEFAULT_SELECTION_STREAM_VERSION
) {
  if (endOffset <= startOffset) {
    return null;
  }

  getSelectionStreamVersion(version);
  const index = buildSelectableTextIndex(root);
  const startPoint = boundaryFromOffset(index, startOffset, "start");
  const endPoint = boundaryFromOffset(index, endOffset, "end");

  if (!startPoint || !endPoint) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
}
