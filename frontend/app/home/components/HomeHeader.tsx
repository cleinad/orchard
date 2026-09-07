"use client";

import ThemePicker from "@/app/components/ThemePicker";
import Tooltip from "@/app/components/Tooltip";
import {
  headerIconBase,
  headerIconOff,
} from "@/app/home/components/homeHeaderToolbar";

type HomeHeaderProps = {
  conversationTitle: string;
  isTemporaryChat: boolean;
  loadingLists: boolean;
  onCreateTemporaryChat: () => void;
};

export default function HomeHeader({
  conversationTitle,
  isTemporaryChat,
  loadingLists,
  onCreateTemporaryChat,
}: HomeHeaderProps) {
  return (
    <header
      data-home-region="header"
      className="flex h-16 items-center justify-between"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <div className="truncate font-serif text-lg font-normal text-foreground/85">
            {isTemporaryChat ? "Temporary Chat" : conversationTitle}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          aria-live="polite"
          aria-label={loadingLists ? "Loading" : undefined}
          className={`font-heading text-sm italic text-muted/50 transition-opacity duration-500 select-none ${
            loadingLists ? 'animate-pulse opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          loading...
        </span>
        <Tooltip content="New temporary chat">
          <button
            type="button"
            onClick={onCreateTemporaryChat}
            aria-label="New temporary chat"
            className={`${headerIconBase} ${headerIconOff}`}
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

        <ThemePicker />
      </div>
    </header>
  );
}
