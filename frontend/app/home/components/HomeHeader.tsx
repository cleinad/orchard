"use client";

import ThemePicker from "@/app/components/ThemePicker";
import Tooltip from "@/app/components/Tooltip";
import type { TemporaryMemoryMode } from "@/lib/chat-session";
import { useLearningMode } from "./LearningModeContext";

type HomeHeaderProps = {
  activeName: string;
  isTemporaryChat: boolean;
  temporaryMemoryMode: TemporaryMemoryMode;
  isSidePanelOpen: boolean;
  onToggleSidePanel: () => void;
  onBrowseMentors: () => void;
  onCreateTemporaryChat: () => void;
};

export default function HomeHeader({
  activeName,
  isTemporaryChat,
  temporaryMemoryMode,
  isSidePanelOpen,
  onToggleSidePanel,
  onBrowseMentors,
  onCreateTemporaryChat,
}: HomeHeaderProps) {
  const { learningMode, toggleLearningMode } = useLearningMode();
  const temporaryMemoryModeLabel =
    temporaryMemoryMode === "use_existing" ? "Uses memories" : "No memory";

  return (
    <header className="flex h-16 items-center justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidePanel}
          aria-label="Toggle conversations"
          aria-expanded={isSidePanelOpen}
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
            {isTemporaryChat && (
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
                <span className="whitespace-nowrap">Temporary</span>
                <span aria-hidden="true" className="text-muted/70">
                  /
                </span>
                <span className="whitespace-nowrap">{temporaryMemoryModeLabel}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip content="Browse mentors">
          <button
            type="button"
            onClick={onBrowseMentors}
            aria-label="Browse mentors"
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
        </Tooltip>

        <Tooltip content="New temporary chat">
          <button
            type="button"
            onClick={onCreateTemporaryChat}
            aria-label="New temporary chat"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition ${
              isTemporaryChat
                ? "border-foreground/[0.08] bg-foreground/[0.05] text-foreground shadow-sm"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 28 28" aria-hidden="true">
              {/* Hat crown */}
              <path
                d="M8 12V7c0-3.31 2.69-6 6-6s6 2.69 6 6v5"
                fill="currentColor"
              />
              {/* Hat brim */}
              <rect x="1" y="10.5" width="26" height="3" rx="1.5" fill="currentColor" />
              {/* Left lens */}
              <circle cx="9" cy="20.5" r="4" stroke="currentColor" strokeWidth="2.25" />
              {/* Right lens */}
              <circle cx="19" cy="20.5" r="4" stroke="currentColor" strokeWidth="2.25" />
              {/* Nose bridge */}
              <path d="M13 20.5h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </Tooltip>

        <Tooltip content="Learning mode">
          <button
            type="button"
            onClick={toggleLearningMode}
            aria-label="Toggle learning mode"
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
        </Tooltip>

        <ThemePicker />
      </div>
    </header>
  );
}
