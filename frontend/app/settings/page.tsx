'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useViewerIdentity } from '@/app/components/useViewerIdentity';
import {
  BODY_FONT_OPTIONS,
  BODY_FONT_STORAGE_KEY,
  type BodyFontId,
  applyBodyFont,
  persistBodyFont,
  resolveBodyFontId,
} from '@/lib/body-font';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const router = useRouter();
  const { viewer, loading } = useViewerIdentity();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center font-sans">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted/20 border-t-muted" />
      </div>
    );
  }

  if (!viewer) {
    return (
      <div className="py-10 font-sans text-sm text-muted">
        Unable to load your account details.
      </div>
    );
  }

  const displayName = viewer.fullName || 'Add your name';
  const email = viewer.email || 'No email available';

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setSignOutError(error.message);
      setSigningOut(false);
      return;
    }

    router.replace('/login');
  }

  return (
    // Body: fixed sans (Satoshi). Section titles use `font-heading` (Fraunces); page title is in `settings/layout`.
    <div className="mx-auto w-full max-w-2xl space-y-8 font-sans">
      <p className="text-sm text-muted">
        Account details and a few reading preferences. Theme is in the header.
      </p>

      <SettingsGroup title="Account" id="account">
        <SettingsRow label="Display name" value={displayName} />
        <SettingsRow
          label="Email"
          value={email}
          hint="Used for sign-in and recovery."
        />
      </SettingsGroup>

      <SettingsGroup title="Reading" id="reading">
        <SettingsRow
          label="Body font"
          action={<BodyFontSelect />}
          hint="Applies to reading areas; code stays monospace."
        />
      </SettingsGroup>

      <SettingsGroup title="Data & session" id="session">
        <SettingsRow
          label="Memories"
          action={
            <ActionButton onClick={() => router.push('/memory')}>
              Open
            </ActionButton>
          }
        />
        <SettingsRow
          label="Sign out"
          action={
            <ActionButton onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </ActionButton>
          }
        />
        {signOutError ? (
          <p className="px-4 py-3 text-sm text-red-500 dark:text-red-400">
            {signOutError}
          </p>
        ) : null}
      </SettingsGroup>
    </div>
  );
}

function SettingsGroup({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`settings-${id}-heading`} className="scroll-mt-24">
      <h2
        id={`settings-${id}-heading`}
        className="font-heading text-lg text-foreground"
      >
        {title}
      </h2>
      {/* Single bordered panel per group: compact list-style rows */}
      <div className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface/60">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  label,
  value,
  hint,
  action,
}: {
  label: string;
  /** Empty string omitted from UI unless paired with action-only layouts */
  value?: string;
  hint?: string;
  action?: ReactNode;
}) {
  // Omit empty value column when only an action is shown (e.g. Memories, Sign out).
  const showValue = value !== undefined && value !== '';

  return (
    <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint ? (
          <p className="mt-0.5 text-sm leading-relaxed text-muted">{hint}</p>
        ) : null}
      </div>

      <div className="flex min-w-0 items-center justify-end gap-3 sm:justify-end">
        {showValue ? (
          <span className="text-right text-sm text-foreground/90 sm:max-w-[14rem] sm:truncate">
            {value}
          </span>
        ) : null}
        {action}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex cursor-pointer items-center rounded-full border border-border-subtle px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-foreground/[0.12] hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function BodyFontSelect() {
  const [fontId, setFontId] = useState<BodyFontId | null>(null);

  useEffect(() => {
    setFontId(resolveBodyFontId(localStorage.getItem(BODY_FONT_STORAGE_KEY)));
  }, []);

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as BodyFontId;
    persistBodyFont(next);
    applyBodyFont(next);
    setFontId(next);
  }

  if (fontId === null) {
    return (
      <span className="text-sm text-muted/70" aria-hidden>
        …
      </span>
    );
  }

  return (
    <>
      <label className="sr-only" htmlFor="settings-body-font">
        Body font
      </label>
      <select
        id="settings-body-font"
        value={fontId}
        onChange={handleChange}
        className="min-w-[11rem] cursor-pointer rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-foreground/[0.2] focus:ring-2 focus:ring-foreground/10"
      >
        {BODY_FONT_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}
