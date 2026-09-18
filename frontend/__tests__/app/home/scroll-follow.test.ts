import { describe, expect, it } from 'vitest';
import {
  getDistanceFromBottom,
  getScrollKeyIntent,
  isAtScrollBottom,
  SCROLL_BOTTOM_EPSILON_PX,
  shouldPauseFollow,
} from '@/app/home/components/scrollFollow';

function metrics(scrollHeight: number, clientHeight: number, scrollTop: number) {
  return { scrollHeight, clientHeight, scrollTop };
}

function keyIntentInput(overrides: Partial<Parameters<typeof getScrollKeyIntent>[0]> = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    isEditableTarget: false,
    isInteractiveTarget: false,
    isWithinContainer: true,
    key: 'ArrowUp',
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe('scroll follow metrics', () => {
  it('measures the remaining distance to the bottom', () => {
    expect(getDistanceFromBottom(metrics(1000, 400, 100))).toBe(500);
  });

  it('treats the bottom within the epsilon as pinned', () => {
    expect(isAtScrollBottom(metrics(1000, 400, 600))).toBe(true);
    expect(
      isAtScrollBottom(metrics(1000, 400, 600 - SCROLL_BOTTOM_EPSILON_PX))
    ).toBe(true);
    expect(isAtScrollBottom(metrics(1000, 400, 597))).toBe(false);
  });
});

describe('shouldPauseFollow', () => {
  it('keeps following when there is nothing to scroll', () => {
    expect(shouldPauseFollow(metrics(300, 400, 0), true)).toBe(false);
    expect(shouldPauseFollow(metrics(300, 400, 0), false)).toBe(false);
  });

  it('keeps following when a gesture pushes toward the bottom from the bottom', () => {
    expect(shouldPauseFollow(metrics(1000, 400, 600), false)).toBe(false);
  });

  it('pauses when a gesture moves away from the bottom', () => {
    expect(shouldPauseFollow(metrics(1000, 400, 600), true)).toBe(true);
  });

  it('pauses when the reader is already away from the bottom', () => {
    expect(shouldPauseFollow(metrics(1000, 400, 100), false)).toBe(true);
    expect(shouldPauseFollow(metrics(1000, 400, 100), true)).toBe(true);
  });
});

describe('getScrollKeyIntent', () => {
  it('flags keys that move away from the bottom', () => {
    for (const key of ['ArrowUp', 'PageUp', 'Home']) {
      expect(getScrollKeyIntent(keyIntentInput({ key }))).toEqual({
        allowAtBottom: true,
      });
    }
    expect(getScrollKeyIntent(keyIntentInput({ key: ' ', shiftKey: true }))).toEqual({
      allowAtBottom: true,
    });
  });

  it('does not treat keys that move toward the bottom as moving away', () => {
    for (const key of ['ArrowDown', 'PageDown', 'End', ' ']) {
      expect(getScrollKeyIntent(keyIntentInput({ key }))).toEqual({
        allowAtBottom: false,
      });
    }
  });

  it('ignores events that are not scroll gestures for the container', () => {
    expect(getScrollKeyIntent(keyIntentInput({ key: 'Enter' }))).toBeNull();
    expect(getScrollKeyIntent(keyIntentInput({ metaKey: true }))).toBeNull();
    expect(getScrollKeyIntent(keyIntentInput({ ctrlKey: true }))).toBeNull();
    expect(getScrollKeyIntent(keyIntentInput({ altKey: true }))).toBeNull();
    expect(getScrollKeyIntent(keyIntentInput({ defaultPrevented: true }))).toBeNull();
    expect(getScrollKeyIntent(keyIntentInput({ isEditableTarget: true }))).toBeNull();
    expect(getScrollKeyIntent(keyIntentInput({ isInteractiveTarget: true }))).toBeNull();
    expect(getScrollKeyIntent(keyIntentInput({ isWithinContainer: false }))).toBeNull();
  });
});
