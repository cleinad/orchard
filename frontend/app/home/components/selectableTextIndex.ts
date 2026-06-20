"use client";

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

type SelectableTextSegment = TextSegment | AtomicSegment;

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
  const pointRange = createCollapsedRange(point);
  const segmentRange = createSegmentRange(segment);
  const result = pointRange.compareBoundaryPoints(Range.START_TO_START, segmentRange);
  pointRange.detach();
  segmentRange.detach();
  return result;
}

function comparePointToSegmentEnd(point: BoundaryPoint, segment: SelectableTextSegment) {
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

function boundaryFromOffset(
  index: SelectableTextIndex,
  offset: number,
  edge: "start" | "end"
): BoundaryPoint | null {
  if (index.segments.length === 0) return null;

  const clampedOffset = Math.min(Math.max(offset, 0), index.text.length);

  for (const segment of index.segments) {
    if (clampedOffset < segment.start || clampedOffset > segment.end) {
      continue;
    }

    if (segment.kind === "text") {
      return {
        node: segment.node,
        offset: Math.min(Math.max(clampedOffset - segment.start, 0), segment.text.length),
      };
    }

    return getElementBoundary(segment.element, edge === "start" ? "before" : "after");
  }

  const lastSegment = index.segments[index.segments.length - 1];
  if (lastSegment.kind === "text") {
    return {
      node: lastSegment.node,
      offset: lastSegment.text.length,
    };
  }

  return getElementBoundary(lastSegment.element, "after");
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
    segment: Omit<TextSegment, "start" | "end"> | Omit<AtomicSegment, "start" | "end">
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

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendSegment({
        kind: "text",
        node: node as Text,
        text: node.textContent ?? "",
      });
      return;
    }

    if (!isHTMLElement(node)) {
      node.childNodes.forEach(walk);
      return;
    }

    if (node.matches(EXCLUDE_SELECTOR)) {
      return;
    }

    const canonicalText = getCanonicalText(node);
    if (canonicalText !== null) {
      appendSegment({
        kind: "atomic",
        element: node,
        text: canonicalText,
      });
      return;
    }

    node.childNodes.forEach(walk);
  };

  root.childNodes.forEach(walk);

  return {
    root,
    text,
    segments,
  };
}

export function getOffsetsFromRange(
  root: Element,
  range: Range
): SelectionOffsets | null {
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
  endOffset: number
) {
  if (endOffset <= startOffset) {
    return null;
  }

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
