type ClassValue = string | false | null | undefined;

export function cx(...classes: ClassValue[]) {
  return classes.filter(Boolean).join(' ');
}

export const buttonStyles = {
  transition: 'transition-colors duration-150',
  focus:
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/[0.12]',
  disabled: 'disabled:cursor-not-allowed disabled:opacity-50',
  disabledStrong: 'disabled:cursor-not-allowed disabled:opacity-40',
  iconBox: 'inline-flex h-4 w-4 shrink-0 items-center justify-center',
  iconBoxSmall: 'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center',

  ghost:
    'text-muted hover:bg-foreground/[0.04] hover:text-foreground',
  ghostSubtle:
    'text-muted hover:bg-foreground/[0.025] hover:text-foreground',
  ghostQuiet:
    'text-muted hover:text-foreground',
  ghostActive:
    'bg-foreground/[0.055] text-foreground',

  controlActive:
    'border-foreground/[0.08] bg-foreground/[0.055] text-foreground',
  controlInactive:
    'border-transparent bg-background text-foreground/88 hover:bg-foreground/[0.035] hover:text-foreground',
  controlInactiveMuted:
    'border-transparent bg-background text-foreground/55 hover:bg-foreground/[0.035] hover:text-foreground/75',
  controlShadow:
    'shadow-[0_1px_2px_rgba(15,23,42,0.06)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.22)]',
  controlFocus:
    'focus-visible:bg-foreground/[0.035] focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/[0.10]',

  menuItemActive: 'bg-foreground/[0.055] text-foreground',
  menuItemInactive:
    'text-muted hover:bg-foreground/[0.035] hover:text-foreground focus-visible:bg-foreground/[0.035] focus-visible:text-foreground',
  segmentSelected: 'bg-surface text-foreground shadow-sm',
  segmentInactive: 'text-muted hover:text-foreground focus-visible:text-foreground',

  listRowSelected: 'bg-foreground/[0.06] text-foreground',
  listRowHover: 'hover:bg-foreground/[0.04]',
  navRowHover: 'hover:bg-foreground/[0.04]',

  primary:
    'bg-foreground text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-20',
  primaryText:
    'bg-foreground text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40',

  chipActive: 'bg-foreground text-background',
  chipInactive:
    'bg-foreground/[0.05] text-muted hover:bg-foreground/[0.08] hover:text-foreground',
  chipOutline:
    'border border-border-subtle bg-surface text-muted hover:border-foreground/[0.10] hover:bg-foreground/[0.03] hover:text-foreground',
  chipPending:
    'border border-dashed border-foreground/[0.18] bg-surface text-foreground',
};
