'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'novus-theme';

function applyTheme(isDark: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark);
}

export default function ThemeToggle({
  ref,
  ...rest
}: { ref?: React.Ref<HTMLButtonElement> } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored === 'dark' || stored === 'light') {
      const nextIsDark = stored === 'dark';
      applyTheme(nextIsDark);
      setIsDark(nextIsDark);
      return;
    }

    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;

    applyTheme(!!prefersDark);
    setIsDark(!!prefersDark);
  }, []);

  const toggleTheme = () => {
    const nextIsDark = !(isDark ?? false);
    applyTheme(nextIsDark);
    setIsDark(nextIsDark);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, nextIsDark ? 'dark' : 'light');
    }
  };

  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      ref={ref}
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:text-foreground"
      {...rest}
    >
      {isDark ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="block h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2.5M12 19v2.5M4.5 12H2M22 12h-2.5M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="block h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3a7.5 7.5 0 1 0 11.5 11.5Z" />
        </svg>
      )}
    </button>
  );
}
