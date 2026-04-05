"use client";

import { useEffect, useState } from 'react';

export function usePersistedString<T extends string>(
  key: string,
  defaultValue: T,
  isValid: (value: string) => value is T
) {
  const [value, setValue] = useState<T>(defaultValue);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(key);
    if (stored !== null && isValid(stored)) {
      setValue(stored);
    }
    setHasLoaded(true);
  }, [isValid, key]);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    window.localStorage.setItem(key, value);
  }, [hasLoaded, key, value]);

  return [value, setValue] as const;
}
