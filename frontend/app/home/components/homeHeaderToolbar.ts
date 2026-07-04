import { buttonStyles, cx } from '@/app/components/buttonStyles';

/**
 * Shared styles for icon buttons in `HomeHeader` and `ConversationMapToggle` so the toolbar reads as one row.
 */
export const headerIconBase =
  cx(
    'inline-flex h-10 w-10 items-center justify-center rounded-lg border',
    buttonStyles.transition,
    buttonStyles.focus,
    buttonStyles.disabled
  );
export const headerIconOff =
  cx('border-transparent', buttonStyles.ghost);
export const headerIconOn =
  cx(
    'border-border-subtle bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.18)]',
    buttonStyles.ghostActive,
    buttonStyles.navRowHover
  );
