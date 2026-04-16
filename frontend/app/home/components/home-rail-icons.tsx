'use client';

/**
 * Geometric rail glyphs: single stroke weight, grid-aligned paths — scanning utilities, not
 * ornament (design-language.md + frontend-skill: minimal chrome, icons that improve scanning).
 */
const baseStroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
  'aria-hidden': true as const,
};

interface IconProps {
  /** Tailwind classes for size and color — defaults to muted rail style */
  className?: string;
}

/** New chat: rounded square + centered plus */
export function RailIconNewChat({ className = 'h-5 w-5 text-muted' }: IconProps = {}) {
  return (
    <svg {...baseStroke} className={className}>
      <rect x="4.75" y="4.75" width="14.5" height="14.5" rx="2" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  );
}

/** Temporary: simple clock face + one hand */
export function RailIconTemporary({ className = 'h-5 w-5 text-muted' }: IconProps = {}) {
  return (
    <svg {...baseStroke} className={className}>
      <circle cx="12" cy="12" r="7.25" />
      <path d="M12 8.25v4l2.5 1.5" />
    </svg>
  );
}

/** All chats: panel outline + three list rules */
export function RailIconAllChats({ className = 'h-5 w-5 text-muted' }: IconProps = {}) {
  return (
    <svg {...baseStroke} className={className}>
      <rect x="4.75" y="5.25" width="14.5" height="13.5" rx="2" />
      <path d="M8.5 10h7M8.5 13.5h7M8.5 17h4.5" />
    </svg>
  );
}
