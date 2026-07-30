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
import {
  MAX_GLOBAL_INSTRUCTIONS_CHARS,
  sanitizeGlobalInstructions,
} from '@/lib/global-instructions';
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
        Account details and preferences that apply across Orchard. Theme is in
        the header.
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

      <SettingsGroup title="Instructions" id="instructions">
        <GlobalInstructionsEditor
          userId={viewer.id}
          initialValue={viewer.globalInstructions}
        />
      </SettingsGroup>

      <SettingsGroup title="Data & session" id="session">
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
  // Omit empty value columns for action-only rows such as Sign out.
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

function GlobalInstructionsEditor({
  userId,
  initialValue,
}: {
  userId: string;
  initialValue: string;
}) {
  const [savedValue, setSavedValue] = useState(initialValue);
  const [draftValue, setDraftValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedConfirmation, setSavedConfirmation] = useState(false);
  const isDirty = draftValue !== savedValue;

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraftValue(event.target.value);
    setSaveError(null);
    setSavedConfirmation(false);
  }

  function handleDiscard() {
    setDraftValue(savedValue);
    setSaveError(null);
    setSavedConfirmation(false);
  }

  async function handleSave() {
    const normalized = sanitizeGlobalInstructions(draftValue);
    setSaving(true);
    setSaveError(null);
    setSavedConfirmation(false);

    const { data, error } = await supabase
      .from('profiles')
      .update({ global_instructions: normalized })
      .eq('id', userId)
      .select('global_instructions')
      .single();

    if (error) {
      console.error('Failed to save global instructions:', error);
      setSaveError('Could not save your instructions. Please try again.');
      setSaving(false);
      return;
    }

    const persistedValue = sanitizeGlobalInstructions(
      data?.global_instructions ?? normalized
    );
    setSavedValue(persistedValue);
    setDraftValue(persistedValue);
    setSavedConfirmation(true);
    setSaving(false);
  }

  return (
    <div className="px-4 py-4">
      <label
        className="text-sm font-medium text-foreground"
        htmlFor="settings-global-instructions"
      >
        Global instructions
      </label>
      <p
        id="settings-global-instructions-description"
        className="mt-0.5 text-sm leading-relaxed text-muted"
      >
        Applied to every conversational response. Workspace and chat-specific
        guidance can refine them.
      </p>

      <textarea
        id="settings-global-instructions"
        value={draftValue}
        onChange={handleChange}
        maxLength={MAX_GLOBAL_INSTRUCTIONS_CHARS}
        rows={8}
        aria-describedby="settings-global-instructions-description settings-global-instructions-count"
        aria-invalid={saveError ? true : undefined}
        placeholder="For example: Use TypeScript in code examples, define unfamiliar terms, and point out meaningful tradeoffs."
        className="mt-3 w-full resize-y rounded-xl border border-border-subtle bg-background px-3.5 py-3 text-sm leading-relaxed text-foreground outline-none transition placeholder:text-muted/60 focus:border-foreground/[0.2] focus:ring-2 focus:ring-foreground/10"
      />

      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          id="settings-global-instructions-count"
          className="text-xs tabular-nums text-muted"
        >
          {draftValue.length.toLocaleString()} of{' '}
          {MAX_GLOBAL_INSTRUCTIONS_CHARS.toLocaleString()} characters
        </p>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <span
            className="mr-1 text-xs text-muted"
            role={saveError ? 'alert' : 'status'}
          >
            {saveError || (savedConfirmation ? 'Saved' : '')}
          </span>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!isDirty || saving}
            className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full border border-border-subtle px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-foreground/[0.12] hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
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
