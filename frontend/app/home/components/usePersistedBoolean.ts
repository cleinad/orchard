"use client";

import { useEffect, useState } from 'react';

export function usePersistedBoolean(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(defaultValue);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      setValue(stored === 'true');
    }
    setHasLoaded(true);
  }, [key]);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    window.localStorage.setItem(key, String(value));
  }, [hasLoaded, key, value]);

  return [value, setValue] as const;
}
