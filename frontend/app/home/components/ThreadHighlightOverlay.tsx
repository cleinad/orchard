"use client";

import {
  useCallback,
  useLayoutEffect,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_SELECTION_STREAM_VERSION,
  getSelectionStreamVersion,
  type SelectionStreamVersion,
} from '@/app/home/components/markdownSelectableStream';
import { restoreRangeFromOffsets } from '@/app/home/components/selectableTextIndex';

type HighlightKind = 'active' | 'persisted';
type HighlightContext = 'text' | 'code' | 'math' | 'table';

export interface ThreadHighlightOverlaySource {
  id: string;
  kind: HighlightKind;
  startOffset: number;
  endOffset: number;
  selectionStreamVersion?: SelectionStreamVersion;
  status?: string;
  emphasized?: boolean;
}

interface MeasuredRect {
  context: HighlightContext;
  groupKey: string;
  height: number;
  kind: HighlightKind;
  left: number;
  sourceId: string;
  status?: string;
  top: number;
  width: number;
  emphasized: boolean;
  host?: HTMLElement;
}

interface ThreadHighlightOverlayProps {
  rootRef: RefObject<HTMLDivElement | null>;
  sources: ThreadHighlightOverlaySource[];
}

const MIN_RECT_SIZE = 0.5;
const RECT_EDGE_EPSILON = 0.25;

function getElementFromNode(node: Node) {
  return node instanceof Element ? node : node.parentElement;
}

function getElementContext(element: Element | null): HighlightContext | null {
  if (element?.closest('.katex-html')) return 'math';
  if (element?.closest('pre, code, .code-block')) return 'code';
  if (element?.closest('table')) return 'table';

  return null;
}

function getCodeHost(element: Element | null) {
  return element?.closest<HTMLElement>('pre') ?? null;
}

function getRangeContext(range: Range): HighlightContext {
  const element = getElementFromNode(range.commonAncestorContainer);

  return getElementContext(element) ?? 'text';
}

function getRectContext(rect: DOMRect, root: HTMLElement, fallback: HighlightContext) {
  const document = root.ownerDocument;
  const elementAtRect = document.elementFromPoint(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2
  );

  return getElementContext(elementAtRect) ?? fallback;
}

function getElementAtRect(rect: DOMRect, root: HTMLElement) {
  return root.ownerDocument.elementFromPoint(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2
  );
}

function getCodeGroupKey(host: HTMLElement | null, root: HTMLElement) {
  if (!host) return 'code';

  const hosts = Array.from(root.querySelectorAll<HTMLElement>('pre'));
  const hostIndex = hosts.indexOf(host);
  return hostIndex >= 0 ? `code:${hostIndex}` : 'code';
}

function getTableCellGroupKey(rect: DOMRect, root: HTMLElement) {
  const document = root.ownerDocument;
  const elementAtRect = document.elementFromPoint(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2
  );
  const cell = elementAtRect?.closest('td, th');

  if (!cell) return 'table';

  const cells = Array.from(root.querySelectorAll('td, th'));
  const cellIndex = cells.indexOf(cell);
  return cellIndex >= 0 ? `cell:${cellIndex}` : 'table';
}

function getTableCellGroupKeyFromElement(element: Element, root: HTMLElement) {
  const cell = element.closest('td, th');

  if (!cell) return 'table';

  const cells = Array.from(root.querySelectorAll('td, th'));
  const cellIndex = cells.indexOf(cell);
  return cellIndex >= 0 ? `cell:${cellIndex}` : 'table';
}

function roundRectValue(value: number) {
  return Math.round(value * 2) / 2;
}

function rectRight(rect: MeasuredRect) {
  return rect.left + rect.width;
}

function rectBottom(rect: MeasuredRect) {
  return rect.top + rect.height;
}

function verticalOverlapRatio(a: MeasuredRect, b: MeasuredRect) {
  const overlap = Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.top, b.top);
  if (overlap <= 0) return 0;
  return overlap / Math.min(a.height, b.height);
}

function heightSimilarityRatio(a: MeasuredRect, b: MeasuredRect) {
  return Math.min(a.height, b.height) / Math.max(a.height, b.height);
}

function getMergeOptions(context: HighlightContext) {
  if (context === 'math') {
    return {
      gap: 2,
      minHeightSimilarity: 0.64,
      verticalOverlap: 0.5,
    };
  }

  if (context === 'code') {
    return {
      gap: 4,
      minHeightSimilarity: 0.35,
      verticalOverlap: 0.42,
    };
  }

  return {
    gap: context === 'table' ? 1.5 : 3,
    minHeightSimilarity: 0.42,
    verticalOverlap: 0.48,
  };
}

function getGeometryGroupKey(rect: MeasuredRect) {
  return [
    rect.sourceId,
    rect.kind,
    rect.context,
    rect.groupKey,
    rect.status ?? '',
    rect.emphasized ? 'emphasized' : '',
  ].join('|');
}

function getUniqueSortedEdges(values: number[]) {
  const sorted = values.map(roundRectValue).sort((a, b) => a - b);
  const unique: number[] = [];

  for (const value of sorted) {
    const previous = unique[unique.length - 1];
    if (previous === undefined || Math.abs(value - previous) > RECT_EDGE_EPSILON) {
      unique.push(value);
    }
  }

  return unique;
}

function rectCoversCell(rect: MeasuredRect, left: number, right: number, top: number, bottom: number) {
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;

  return (
    centerX >= rect.left - RECT_EDGE_EPSILON
    && centerX <= rectRight(rect) + RECT_EDGE_EPSILON
    && centerY >= rect.top - RECT_EDGE_EPSILON
    && centerY <= rectBottom(rect) + RECT_EDGE_EPSILON
  );
}

function sameRectColumn(a: MeasuredRect, b: MeasuredRect) {
  return (
    Math.abs(a.left - b.left) <= RECT_EDGE_EPSILON
    && Math.abs(a.width - b.width) <= RECT_EDGE_EPSILON
  );
}

function splitGroupIntoNonOverlappingRects(rects: MeasuredRect[]) {
  if (rects.length <= 1) {
    return rects;
  }

  const template = rects[0];
  const xEdges = getUniqueSortedEdges(rects.flatMap((rect) => [rect.left, rectRight(rect)]));
  const yEdges = getUniqueSortedEdges(rects.flatMap((rect) => [rect.top, rectBottom(rect)]));
  const horizontalRuns: MeasuredRect[] = [];

  for (let yIndex = 0; yIndex < yEdges.length - 1; yIndex += 1) {
    const top = yEdges[yIndex];
    const bottom = yEdges[yIndex + 1];
    let runLeft: number | null = null;
    let runRight: number | null = null;

    const flushRun = () => {
      if (runLeft === null || runRight === null) return;

      const width = runRight - runLeft;
      const height = bottom - top;
      if (width > MIN_RECT_SIZE && height > MIN_RECT_SIZE) {
        horizontalRuns.push({
          ...template,
          left: runLeft,
          top,
          width,
          height,
        });
      }

      runLeft = null;
      runRight = null;
    };

    for (let xIndex = 0; xIndex < xEdges.length - 1; xIndex += 1) {
      const left = xEdges[xIndex];
      const right = xEdges[xIndex + 1];
      const covered = rects.some((rect) => rectCoversCell(rect, left, right, top, bottom));

      if (covered) {
        runLeft ??= left;
        runRight = right;
      } else {
        flushRun();
      }
    }

    flushRun();
  }

  const merged: MeasuredRect[] = [];
  const sortedRuns = horizontalRuns.sort((a, b) => a.left - b.left || a.width - b.width || a.top - b.top);

  for (const rect of sortedRuns) {
    const previous = merged[merged.length - 1];
    const canMergeVertically =
      previous
      && sameRectColumn(previous, rect)
      && Math.abs(rect.top - rectBottom(previous)) <= RECT_EDGE_EPSILON;

    if (!canMergeVertically) {
      merged.push(rect);
      continue;
    }

    previous.height = rectBottom(rect) - previous.top;
  }

  return merged;
}

function splitOverlappingRects(rects: MeasuredRect[]) {
  const groups = new Map<string, MeasuredRect[]>();

  for (const rect of rects) {
    const key = getGeometryGroupKey(rect);
    groups.set(key, [...(groups.get(key) ?? []), rect]);
  }

  return Array.from(groups.values()).flatMap(splitGroupIntoNonOverlappingRects);
}

function measureDomRects(
  rootRect: DOMRect,
  root: HTMLElement,
  rects: DOMRect[],
  source: ThreadHighlightOverlaySource,
  getContext: (rect: DOMRect) => HighlightContext,
  getGroupKey: (rect: DOMRect, context: HighlightContext, host: HTMLElement | null) => string,
  getHost?: (rect: DOMRect, context: HighlightContext) => HTMLElement | null
) {
  const measuredRects: MeasuredRect[] = [];

  for (const rect of rects) {
    if (rect.width <= MIN_RECT_SIZE || rect.height <= MIN_RECT_SIZE) {
      continue;
    }

    const context = getContext(rect);
    const host = context === 'code' ? getHost?.(rect, context) ?? null : null;
    const rectRoot = host ?? root;
    const rectRootBounds = rectRoot === root ? rootRect : rectRoot.getBoundingClientRect();
    measuredRects.push({
      context,
      emphasized: Boolean(source.emphasized),
      groupKey: getGroupKey(rect, context, host),
      height: rect.height,
      host: host ?? undefined,
      kind: source.kind,
      left: rect.left - rectRootBounds.left + (host?.scrollLeft ?? 0),
      sourceId: source.id,
      status: source.status,
      top: rect.top - rectRootBounds.top + (host?.scrollTop ?? 0),
      width: rect.width,
    });
  }

  return measuredRects;
}

function getRenderedThreadMarkerElements(root: HTMLElement, sourceId: string) {
  return Array.from(
    root.querySelectorAll<HTMLElement>('[data-testid="inline-thread-link"]')
  ).filter((element) => element.dataset.threadMarkerId === sourceId);
}

function measureRenderedThreadMarkers(
  root: HTMLElement,
  rootRect: DOMRect,
  source: ThreadHighlightOverlaySource
) {
  const markerElements = getRenderedThreadMarkerElements(root, source.id);
  if (markerElements.length === 0) {
    return [];
  }

  return markerElements.flatMap((element) => {
    const elementContext = getElementContext(element) ?? 'text';
    const rects = Array.from(element.getClientRects());

    return measureDomRects(
      rootRect,
      root,
      rects,
      source,
      (rect) => getRectContext(rect, root, elementContext),
      (_rect, context, host) => {
        if (context === 'table') return getTableCellGroupKeyFromElement(element, root);
        if (context === 'code') return getCodeGroupKey(host, root);
        return context;
      },
      (rect, context) => {
        if (context !== 'code') return null;
        return getCodeHost(element) ?? getCodeHost(getElementAtRect(rect, root));
      }
    );
  });
}

function measureRestoredRange(
  root: HTMLElement,
  rootRect: DOMRect,
  source: ThreadHighlightOverlaySource
) {
  const range = restoreRangeFromOffsets(
    root,
    source.startOffset,
    source.endOffset,
    getSelectionStreamVersion(source.selectionStreamVersion ?? DEFAULT_SELECTION_STREAM_VERSION)
  );

  if (!range) {
    return [];
  }

  const rangeContext = getRangeContext(range);
  const rangeHost = getCodeHost(getElementFromNode(range.commonAncestorContainer));
  const rects = Array.from(range.getClientRects());
  const measuredRects = measureDomRects(
    rootRect,
    root,
    rects,
    source,
    (rect) => getRectContext(rect, root, rangeContext),
    (rect, context, host) => {
      if (context === 'table') return getTableCellGroupKey(rect, root);
      if (context === 'code') return getCodeGroupKey(host, root);
      return context;
    },
    (rect, context) => {
      if (context !== 'code') return null;
      return getCodeHost(getElementAtRect(rect, root)) ?? rangeHost;
    }
  );

  range.detach();
  return measuredRects;
}

function renderHighlightRect(rect: MeasuredRect, index: number) {
  return (
    <span
      key={`${rect.sourceId}-${index}`}
      className="thread-highlight-overlay__rect"
      data-highlight-context={rect.context}
      data-highlight-kind={rect.kind}
      data-highlight-source-id={rect.sourceId}
      data-highlight-status={rect.status ?? 'ready'}
      data-highlight-emphasized={rect.emphasized ? 'true' : 'false'}
      data-testid="thread-highlight-rect"
      style={{
        height: `${rect.height}px`,
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
      }}
    />
  );
}

function groupCodeRectsByHost(rects: MeasuredRect[]) {
  const groups = new Map<HTMLElement, MeasuredRect[]>();

  for (const rect of rects) {
    if (rect.context !== 'code' || !rect.host) continue;
    groups.set(rect.host, [...(groups.get(rect.host) ?? []), rect]);
  }

  return Array.from(groups.entries());
}

function mergeMeasuredRects(rects: MeasuredRect[]) {
  const sortedRects = [...rects].sort((a, b) => {
    if (a.sourceId !== b.sourceId) return a.sourceId.localeCompare(b.sourceId);
    if (a.groupKey !== b.groupKey) return a.groupKey.localeCompare(b.groupKey);
    return a.top - b.top || a.left - b.left;
  });
  const merged: MeasuredRect[] = [];

  for (const rect of sortedRects) {
    const previous = merged[merged.length - 1];
    const options = getMergeOptions(rect.context);
    const canMerge =
      previous
      && previous.sourceId === rect.sourceId
      && previous.kind === rect.kind
      && previous.context === rect.context
      && previous.groupKey === rect.groupKey
      && verticalOverlapRatio(previous, rect) >= options.verticalOverlap
      && heightSimilarityRatio(previous, rect) >= options.minHeightSimilarity
      && rect.left - rectRight(previous) <= options.gap;

    if (!canMerge) {
      merged.push(rect);
      continue;
    }

    const left = Math.min(previous.left, rect.left);
    const top = Math.min(previous.top, rect.top);
    const right = Math.max(rectRight(previous), rectRight(rect));
    const bottom = Math.max(rectBottom(previous), rectBottom(rect));

    previous.left = left;
    previous.top = top;
    previous.width = right - left;
    previous.height = bottom - top;
    previous.emphasized = previous.emphasized || rect.emphasized;
  }

  const roundedRects = merged.map((rect) => {
    const left = roundRectValue(rect.left);
    const top = roundRectValue(rect.top);
    const right = roundRectValue(rectRight(rect));
    const bottom = roundRectValue(rectBottom(rect));

    return {
      ...rect,
      left,
      top,
      width: right - left,
      height: bottom - top,
    };
  });

  return splitOverlappingRects(roundedRects);
}

function measureSources(root: HTMLElement, sources: ThreadHighlightOverlaySource[]) {
  const rootRect = root.getBoundingClientRect();
  const measuredRects: MeasuredRect[] = [];

  for (const source of sources) {
    const markerRects = measureRenderedThreadMarkers(root, rootRect, source);
    measuredRects.push(
      ...(markerRects.length > 0 ? markerRects : measureRestoredRange(root, rootRect, source))
    );
  }

  return mergeMeasuredRects(measuredRects);
}

export default function ThreadHighlightOverlay({
  rootRef,
  sources,
}: ThreadHighlightOverlayProps) {
  const [rects, setRects] = useState<MeasuredRect[]>([]);

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root || sources.length === 0) {
      setRects([]);
      return;
    }

    setRects(measureSources(root, sources));
  }, [rootRef, sources]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let animationFrame = 0;
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(root);

    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    document.fonts?.ready.then(scheduleMeasure).catch(() => undefined);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
    };
  }, [measure, rootRef]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (rects.length > 0) {
      root.setAttribute('data-range-thread-highlights', 'true');
      root.setAttribute('data-thread-highlight-overlay', 'true');
      return () => {
        root.removeAttribute('data-range-thread-highlights');
        root.removeAttribute('data-thread-highlight-overlay');
      };
    }

    root.removeAttribute('data-range-thread-highlights');
    root.removeAttribute('data-thread-highlight-overlay');
  }, [rects.length, rootRef]);

  const globalRects = rects.filter((rect) => rect.context !== 'code');
  const codeRectGroups = groupCodeRectsByHost(rects);

  if (globalRects.length === 0 && codeRectGroups.length === 0) {
    return null;
  }

  return (
    <>
      {globalRects.length > 0 && (
        <div
          aria-hidden="true"
          className="thread-highlight-overlay"
          data-selection-exclude="true"
          data-testid="thread-highlight-overlay"
        >
          {globalRects.map(renderHighlightRect)}
        </div>
      )}
      {codeRectGroups.map(([host, hostRects]) =>
        createPortal(
          <span
            aria-hidden="true"
            className="thread-highlight-code-overlay"
            data-selection-exclude="true"
            data-testid="thread-highlight-code-overlay"
          >
            {hostRects.map(renderHighlightRect)}
          </span>,
          host,
          hostRects[0]?.groupKey ?? 'code'
        )
      )}
    </>
  );
}
