'use client';

import AsciiTesseract from '@/app/home/components/AsciiTesseract';

interface EmptyConversationStateProps {
  emptyTitle: string;
  emptySubtitle: string;
  listError: string | null;
  routeConversationError: string | null;
  isRouteConversationLoading: boolean;
}

export default function EmptyConversationState({
  emptyTitle,
  emptySubtitle,
  listError,
  routeConversationError,
  isRouteConversationLoading,
}: EmptyConversationStateProps) {
  return (
    <div className="mx-auto max-w-2xl px-6 pb-4">
      {listError && (
        <div className="mb-4 rounded-lg bg-surface px-4 py-2 font-sans text-xs text-muted shadow-sm">
          {listError}
        </div>
      )}

      <div className="flex h-full min-h-[50vh] flex-col items-center justify-center px-4">
        {isRouteConversationLoading ? (
          <div
            role="status"
            aria-label="Loading conversation"
            className="flex items-center gap-1.5 text-muted"
          >
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-muted/40"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-muted/40"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-muted/40"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        ) : routeConversationError ? (
          <div className="max-w-md text-center">
            <h1 className="font-heading text-3xl text-foreground sm:text-4xl">
              Could not load this conversation
            </h1>
            <p className="mt-4 font-sans text-md font-medium leading-relaxed text-muted">
              {routeConversationError}
            </p>
          </div>
        ) : (
          <div className="flex w-full max-w-2xl flex-col items-center text-center sm:mt-[clamp(5rem,12vh,10rem)]">
            <h1 className="font-heading text-[clamp(1.65rem,2.5vw,2.25rem)] leading-[0.95] text-foreground">
              Let&apos;s explore
            </h1>
            <div className="mt-10 flex w-full justify-center sm:mt-14">
              <AsciiTesseract />
            </div>
            <p className="sr-only">
              {emptyTitle}. {emptySubtitle}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
