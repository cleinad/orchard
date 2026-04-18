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
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 5.75v5.5m0 0v7m0-7-4.75-4.25m4.75 4.25 4.75-4.25"
          />
          <circle cx="12" cy="18.25" r="2.25" />
          <circle cx="7.25" cy="7" r="2" />
          <circle cx="16.75" cy="7" r="2" />
        </svg>
      </button>
    </Tooltip>
  );
}
