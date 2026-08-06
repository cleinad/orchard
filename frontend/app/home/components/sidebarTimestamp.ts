'use client';

import { useEffect, useState } from 'react';

const HYDRATION_LOCALE = 'en-US';

export type SidebarTimestampFormatter = (input: string) => string;

export interface SidebarTimestampContext {
  locale: Intl.LocalesArgument;
  timeZone: string;
  now: Date;
}

function isValidDate(date: Date) {
  return !Number.isNaN(date.getTime());
}

function createDateKeyFormatter(timeZone: string) {
  return new Intl.DateTimeFormat(HYDRATION_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  });
}

function getDatePartsKey(date: Date, formatter: Intl.DateTimeFormat) {
  return formatter
    .formatToParts(date)
    .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
    .map((part) => `${part.type}:${part.value}`)
    .join('|');
}

export function formatSidebarHydrationTimestamp(input: string) {
  const date = new Date(input);
  if (!isValidDate(date)) return '';

  const hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const displayHours = String(hours % 12 || 12).padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${displayHours}:${minutes} ${period}`;
}

export function createSidebarTimestampFormatter(
  context: SidebarTimestampContext
): SidebarTimestampFormatter {
  const dateKeyFormatter = createDateKeyFormatter(context.timeZone);
  const nowDateKey = getDatePartsKey(context.now, dateKeyFormatter);
  const timeFormatter = new Intl.DateTimeFormat(context.locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: context.timeZone,
  });
  const dateFormatter = new Intl.DateTimeFormat(context.locale, {
    month: 'short',
    day: 'numeric',
    timeZone: context.timeZone,
  });

  return (input: string) => {
    const date = new Date(input);
    if (!isValidDate(date)) return '';

    return getDatePartsKey(date, dateKeyFormatter) === nowDateKey
      ? timeFormatter.format(date)
      : dateFormatter.format(date);
  };
}

export function formatSidebarTimestamp(
  input: string,
  context: SidebarTimestampContext
) {
  return createSidebarTimestampFormatter(context)(input);
}

export function createBrowserSidebarTimestampFormatter(now = new Date()) {
  const resolved = new Intl.DateTimeFormat().resolvedOptions();
  const locale =
    typeof navigator !== 'undefined' && navigator.languages.length > 0
      ? navigator.languages
      : resolved.locale;

  return createSidebarTimestampFormatter({
    locale,
    timeZone: resolved.timeZone,
    now,
  });
}

function getNextLocalMidnight(now: Date) {
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return nextMidnight;
}

export function useSidebarTimestampFormatter() {
  const [browserFormatter, setBrowserFormatter] =
    useState<SidebarTimestampFormatter | null>(null);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout>;

    const refreshFormatter = () => {
      const now = new Date();
      setBrowserFormatter(() => createBrowserSidebarTimestampFormatter(now));

      const delayUntilMidnight =
        getNextLocalMidnight(now).getTime() - now.getTime();
      refreshTimer = setTimeout(refreshFormatter, Math.max(1_000, delayUntilMidnight));
    };

    refreshFormatter();
    return () => clearTimeout(refreshTimer);
  }, []);

  return browserFormatter ?? formatSidebarHydrationTimestamp;
}
