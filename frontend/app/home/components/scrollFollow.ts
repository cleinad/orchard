/**
 * Pure helpers for "stay pinned to the bottom while content streams, but yield
 * control cleanly when the reader scrolls away".
 *
 * `useTranscriptNavigation` implements this for the main transcript. The
 * inline-thread panel uses the same decisions through `useAutoFollowScroll`, so
 * the two surfaces pause and resume under identical conditions.
 */

export const SCROLL_BOTTOM_EPSILON_PX = 2;

const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);

export interface ScrollMetrics {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

export function getDistanceFromBottom({
  clientHeight,
  scrollHeight,
  scrollTop,
}: ScrollMetrics): number {
  return scrollHeight - scrollTop - clientHeight;
}

export function isAtScrollBottom(
  metrics: ScrollMetrics,
  epsilon = SCROLL_BOTTOM_EPSILON_PX
): boolean {
  return getDistanceFromBottom(metrics) <= epsilon;
}

function canScroll(metrics: ScrollMetrics, epsilon = SCROLL_BOTTOM_EPSILON_PX): boolean {
  return metrics.scrollHeight - metrics.clientHeight > epsilon;
}

/**
 * Decides whether a scroll gesture should take follow control away from the
 * stream.
 *
 * Mirrors `pauseAutoFollow` in `useTranscriptNavigation`: a gesture only pauses
 * when there is somewhere to move, or when it explicitly moves away from the
 * bottom while the view is already pinned there. A wheel/trackpad push *toward*
 * the bottom keeps following.
 */
export function shouldPauseFollow(metrics: ScrollMetrics, allowAtBottom: boolean): boolean {
  if (!canScroll(metrics)) return false;
  if (isAtScrollBottom(metrics) && !allowAtBottom) return false;
  return true;
}

export interface ScrollKeyIntentInput {
  altKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  isEditableTarget: boolean;
  isInteractiveTarget: boolean;
  isWithinContainer: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface ScrollKeyIntent {
  allowAtBottom: boolean;
}

/**
 * Classifies a keydown as a scroll gesture that should pause follow. Returns
 * null when the event is not a scroll key, is modified, targets editable or
 * interactive content, or the focused element is outside the scroll container.
 */
export function getScrollKeyIntent(
  input: ScrollKeyIntentInput
): ScrollKeyIntent | null {
  if (
    input.defaultPrevented
    || input.metaKey
    || input.ctrlKey
    || input.altKey
    || input.isEditableTarget
    || input.isInteractiveTarget
    || !input.isWithinContainer
    || !SCROLL_KEYS.has(input.key)
  ) {
    return null;
  }

  const movesAwayFromBottom =
    ['ArrowUp', 'PageUp', 'Home'].includes(input.key)
    || (input.key === ' ' && input.shiftKey);

  return { allowAtBottom: movesAwayFromBottom };
}
