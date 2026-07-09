'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import ThemePicker from '@/app/components/ThemePicker';
import HomeBackground from '@/app/home/components/HomeBackground';

export default function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const handleBackToChat = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/home');
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <HomeBackground />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
        <header className="flex h-16 items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={handleBackToChat}
              aria-label="Back to chat"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:text-foreground"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                />
              </svg>
            </button>

            <div className="min-w-0">
              <p className="text-xs font-medium text-muted/70 font-sans">
                Workspace
              </p>
              <h1 className="truncate font-heading text-2xl text-foreground">
                Settings
              </h1>
            </div>
          </div>

          <ThemePicker />
        </header>

        <main className="pb-16 pt-4">{children}</main>
      </div>
    </div>
  );
}
