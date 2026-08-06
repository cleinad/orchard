'use client';

import Link from 'next/link';
import {
  HOME_E2E_FIXTURES_ENABLED,
  HOME_ERROR_BOUNDARY_FIXTURE_KEY,
  HOME_ERROR_BOUNDARY_RECOVERED_STORAGE_KEY,
} from '@/app/home/homeE2eFixtureKeys';

export default function HomeError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const handleRetry = () => {
    if (
      HOME_E2E_FIXTURES_ENABLED
      && new URLSearchParams(window.location.search).get('e2e')
        === HOME_ERROR_BOUNDARY_FIXTURE_KEY
    ) {
      window.sessionStorage.setItem(
        HOME_ERROR_BOUNDARY_RECOVERED_STORAGE_KEY,
        '1'
      );
    }
    reset();
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
      <div className="max-w-md text-center">
        <h1 className="font-heading text-3xl">Home could not be loaded</h1>
        <p className="mt-3 font-sans text-sm leading-relaxed text-muted">
          An unexpected error interrupted this page. Your chats were not
          changed.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-lg bg-foreground px-4 py-2 font-sans text-sm font-semibold text-background"
          >
            Retry
          </button>
          <Link
            href="/home"
            className="rounded-lg border border-border-subtle bg-surface px-4 py-2 font-sans text-sm font-semibold text-foreground"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
