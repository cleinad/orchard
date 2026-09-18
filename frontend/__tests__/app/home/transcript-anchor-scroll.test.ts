import { describe, expect, it } from 'vitest';
import { getAnchorScrollTop } from '@/app/home/components/useTranscriptNavigation';

describe('getAnchorScrollTop', () => {
  it('centres a highlight that fits the viewport', () => {
    // viewport 800, highlight 100 -> 350 above the highlight.
    expect(
      getAnchorScrollTop({
        anchorTop: 300,
        highlightHeight: 100,
        scrollTop: 1000,
        viewportHeight: 800,
      })
    ).toBe(950);
  });

  it('pins a highlight taller than the viewport below the top padding', () => {
    expect(
      getAnchorScrollTop({
        anchorTop: 300,
        highlightHeight: 900,
        scrollTop: 1000,
        viewportHeight: 800,
      })
    ).toBe(1276);
  });

  it('uses the message offset when there is no measurable highlight', () => {
    expect(
      getAnchorScrollTop({
        anchorTop: 300,
        highlightHeight: null,
        scrollTop: 1000,
        viewportHeight: 800,
      })
    ).toBe(1196);
  });

  it('clamps to the top of the transcript', () => {
    expect(
      getAnchorScrollTop({
        anchorTop: 50,
        highlightHeight: 100,
        scrollTop: 0,
        viewportHeight: 800,
      })
    ).toBe(0);
  });

  it('treats a viewport that barely fits the highlight as fitting', () => {
    // highlight 800 - padding 48 = 752 exactly.
    expect(
      getAnchorScrollTop({
        anchorTop: 400,
        highlightHeight: 752,
        scrollTop: 0,
        viewportHeight: 800,
      })
    ).toBe(400 - (800 - 752) / 2);
  });
});
