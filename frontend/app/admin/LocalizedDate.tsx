'use client';

import { useEffect, useState } from 'react';

export function LocalizedDate({
  value,
  fallback,
  includeTime = false,
  timeZone,
}: {
  value: string;
  fallback: string;
  includeTime?: boolean;
  timeZone?: 'UTC';
}) {
  const [label, setLabel] = useState(fallback);

  useEffect(() => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return;

    setLabel(new Intl.DateTimeFormat(undefined, includeTime
      ? { dateStyle: 'medium', timeStyle: 'short', timeZone }
      : { dateStyle: 'medium', timeZone }).format(date));
  }, [includeTime, timeZone, value]);

  return (
    <time dateTime={value} suppressHydrationWarning>
      {label}
    </time>
  );
}
