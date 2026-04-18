/**
 * Shared styles for icon buttons in `HomeHeader` and `ConversationMapToggle` so the toolbar reads as one row.
 */
export const headerIconBase =
  'inline-flex h-10 w-10 items-center justify-center rounded-lg border transition';
export const headerIconOff =
  'border-transparent text-muted hover:text-foreground';
export const headerIconOn =
  'border-border-subtle bg-surface text-muted hover:text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.18)]';
