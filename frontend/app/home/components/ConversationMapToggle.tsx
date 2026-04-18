"use client";

import Tooltip from '@/app/components/Tooltip';
import {
  headerIconBase,
  headerIconOff,
  headerIconOn,
} from '@/app/home/components/homeHeaderToolbar';

interface ConversationMapToggleProps {
  branchPointCount: number;
  isOpen: boolean;
  onToggle: () => void;
}

export default function ConversationMapToggle({
  branchPointCount,
  isOpen,
  onToggle,
}: ConversationMapToggleProps) {
  if (branchPointCount === 0) {
    return null;
  }

  const label = isOpen ? 'Hide conversation map' : 'Conversation map';

  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isOpen}
        aria-label={label}
        data-testid="conversation-map-toggle"
        className={`${headerIconBase} ${isOpen ? headerIconOn : headerIconOff}`}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          {/* Top-down tree: squat layout (wider than tall); edges stop on ring outer tangents (no bleed) */}
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 7.75V11.75L6.492 16.668M12 11.75L17.508 16.668"
          />
          {/* Root (conversation start / parent) */}
          <circle cx="12" cy="5.5" r="2.25" />
          {/* Branch outcomes — centers at x=5 / 19 so the base reads wider than the vertical span */}
          <circle cx="5" cy="18" r="2" />
          <circle cx="19" cy="18" r="2" />
        </svg>
      </button>
    </Tooltip>
  );
}
