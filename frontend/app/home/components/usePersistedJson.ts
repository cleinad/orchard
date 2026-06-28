"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export function usePersistedJson<T>(
  key: string,
  defaultValue: T,
  isValid: (value: unknown) => value is T
): readonly [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(defaultValue);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(key);

    if (stored !== null) {
      try {
        const parsed = JSON.parse(stored) as unknown;

        if (isValid(parsed)) {
          setValue(parsed);
        }
      } catch {
        // Ignore malformed stored values and keep the default.
      }
    }

    setHasLoaded(true);
  }, [isValid, key]);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    window.localStorage.setItem(key, JSON.stringify(value));
  }, [hasLoaded, key, value]);

  return [value, setValue] as const;
}
