"use client";

import ThemeToggle from "@/app/components/ThemeToggle";
import type { TemporaryMemoryMode } from "@/lib/chat-session";
import { useLearningMode } from "./LearningModeContext";

type HomeHeaderProps = {
  activeName: string;
  temporaryChatEnabled: boolean;
  temporaryMemoryMode: TemporaryMemoryMode;
  onOpenSidePanel: () => void;
  onBrowseMentors: () => void;
  onToggleTemporaryChat: () => void;
};

export default function HomeHeader({
  activeName,
  temporaryChatEnabled,
  temporaryMemoryMode,
  onOpenSidePanel,
  onBrowseMentors,
  onToggleTemporaryChat,
}: HomeHeaderProps) {
  const { learningMode, toggleLearningMode } = useLearningMode();
  const temporaryMemoryModeLabel =
    temporaryMemoryMode === "use_existing" ? "Uses memories" : "No memory";

  return (
    <header className="flex h-16 items-center justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidePanel}
          aria-label="Open conversations"
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
              d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
            />
          </svg>
        </button>

        <div className="min-w-0">
          <div className="mt-1 flex items-center gap-2">
            <span className="truncate font-heading text-xl text-foreground">{activeName}</span>
            {temporaryChatEnabled && (
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500 dark:text-stone-400">
                <span className="whitespace-nowrap">Temporary</span>
                <span aria-hidden="true" className="text-stone-400 dark:text-stone-500">
                  /
                </span>
                <span className="whitespace-nowrap">{temporaryMemoryModeLabel}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBrowseMentors}
          aria-label="Browse mentors"
          title="Browse mentors"
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
              d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={onToggleTemporaryChat}
          aria-label="Toggle temporary chat"
          aria-pressed={temporaryChatEnabled}
          title="Temporary chat"
          className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition ${
            temporaryChatEnabled
              ? 'border-black/[0.05] bg-[#FBF8F4] text-stone-700 shadow-sm dark:border-white/10 dark:bg-stone-800 dark:text-stone-100'
              : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M7.216 9.25 8.3 5.609a1 1 0 01.958-.719h5.484a1 1 0 01.958.72l1.084 3.64h.466A1.75 1.75 0 0119 11a.75.75 0 01-.75.75h-12.5A.75.75 0 015 11c0-.966.784-1.75 1.75-1.75h.466z"
            />
            <path
              fill="currentColor"
              d="M8.125 16.182c.705-.863 1.868-1.432 3.057-1.432h1.636c1.189 0 2.352.569 3.057 1.432.41.501.625 1.024.625 1.568a.75.75 0 01-.75.75h-7.5a.75.75 0 01-.75-.75c0-.544.215-1.067.625-1.568z"
            />
            <path
              fill="currentColor"
              d="M7.75 12.5a1.25 1.25 0 011.25-1.25h1.25a1.25 1.25 0 011.25 1.25v.25A1.25 1.25 0 0110.25 14H9a1.25 1.25 0 01-1.25-1.25v-.25zm4.75 0a1.25 1.25 0 011.25-1.25H15a1.25 1.25 0 011.25 1.25v.25A1.25 1.25 0 0115 14h-1.25a1.25 1.25 0 01-1.25-1.25v-.25z"
            />
            <path
              d="M11.5 12.625h1"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={toggleLearningMode}
          aria-label="Toggle learning mode"
          title="Learning mode"
          className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition hover:text-foreground ${
            learningMode ? "text-foreground" : "text-muted"
          }`}
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
              d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
            />
          </svg>
        </button>

        <ThemeToggle />
      </div>
    </header>
  );
}
