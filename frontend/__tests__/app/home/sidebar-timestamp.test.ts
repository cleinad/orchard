import { describe, expect, it } from 'vitest';
import {
  formatSidebarHydrationTimestamp,
  formatSidebarTimestamp,
} from '@/app/home/components/sidebarTimestamp';

describe('sidebar timestamps', () => {
  it('uses a deterministic UTC value for server rendering and initial hydration', () => {
    expect(
      formatSidebarHydrationTimestamp('2026-08-05T20:50:00.000Z')
    ).toBe('08:50 PM');
    expect(
      [...formatSidebarHydrationTimestamp('2026-08-05T20:50:00.000Z')]
        .map((character) => character.codePointAt(0))
    ).toEqual([48, 56, 58, 53, 48, 32, 80, 77]);
  });

  it('formats same-day activity in the supplied browser timezone', () => {
    expect(
      formatSidebarTimestamp('2026-08-05T20:50:00.000Z', {
        locale: 'en-US',
        timeZone: 'America/Vancouver',
        now: new Date('2026-08-05T22:00:00.000Z'),
      })
    ).toBe('01:50 PM');
  });

  it('compares calendar days in the supplied timezone rather than UTC', () => {
    expect(
      formatSidebarTimestamp('2026-08-06T06:30:00.000Z', {
        locale: 'en-US',
        timeZone: 'America/Vancouver',
        now: new Date('2026-08-06T07:30:00.000Z'),
      })
    ).toBe('Aug 5');
  });

  it('formats activity against a refreshed local day after midnight', () => {
    const activity = '2026-08-06T07:05:00.000Z';
    expect(
      formatSidebarTimestamp(activity, {
        locale: 'en-US',
        timeZone: 'America/Vancouver',
        now: new Date('2026-08-06T06:59:00.000Z'),
      })
    ).toBe('Aug 6');
    expect(
      formatSidebarTimestamp(activity, {
        locale: 'en-US',
        timeZone: 'America/Vancouver',
        now: new Date('2026-08-06T07:06:00.000Z'),
      })
    ).toBe('12:05 AM');
  });

  it('returns no label for an invalid timestamp', () => {
    expect(formatSidebarHydrationTimestamp('not-a-date')).toBe('');
  });
});
