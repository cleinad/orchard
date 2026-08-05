'use client';

import {
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  saveGlobalInstructions,
  signOut,
} from '@/app/settings/actions';
import type {
  SettingsViewer,
  SettingsViewerResult,
} from '@/app/settings/types';
import {
  BODY_FONT_OPTIONS,
  BODY_FONT_STORAGE_KEY,
  DEFAULT_BODY_FONT_ID,
  type BodyFontId,
  applyBodyFont,
  persistBodyFont,
  resolveBodyFontId,
} from '@/lib/body-font';
import {
  MAX_GLOBAL_INSTRUCTIONS_CHARS,
  sanitizeGlobalInstructions,
} from '@/lib/global-instructions';

export default function SettingsClient({
  viewerResult,
}: {
  viewerResult: SettingsViewerResult;
}) {
  const viewer = viewerResult.viewer;
  const displayName =
    viewerResult.status === 'ready'
      ? viewerResult.viewer.fullName || 'Add your name'
      : 'Profile unavailable';
  const email = viewer.email || 'No email available';

  return (
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
        {viewerResult.status === 'ready' ? (
          <GlobalInstructionsEditor viewer={viewerResult.viewer} />
        ) : (
          <ProfileRecovery status={viewerResult.status} />
        )}
      </SettingsGroup>

      <SettingsGroup title="Data & session" id="session">
        <SignOutRow />
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
  value?: string;
  hint?: string;
  action?: ReactNode;
}) {
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

function GlobalInstructionsEditor({ viewer }: { viewer: SettingsViewer }) {
  const [savedValue, setSavedValue] = useState(viewer.globalInstructions);
  const [draftValue, setDraftValue] = useState(viewer.globalInstructions);
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

    try {
      const result = await saveGlobalInstructions(normalized);
      if (result.status === 'error') {
        setSaveError('Could not save your instructions. Please try again.');
        return;
      }

      setSavedValue(result.value);
      setDraftValue(result.value);
      setSavedConfirmation(true);
    } catch {
      setSaveError('Could not save your instructions. Please try again.');
    } finally {
      setSaving(false);
    }
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
          <ActionButton
            onClick={handleDiscard}
            disabled={!isDirty || saving}
          >
            Discard
          </ActionButton>
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

function ProfileRecovery({
  status,
}: {
  status: Exclude<SettingsViewerResult['status'], 'ready'>;
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const message =
    status === 'profile-missing'
      ? 'Your account profile is missing. Retry after the account is repaired.'
      : 'Your profile could not be loaded. The rest of settings remains available.';

  return (
    <div className="px-4 py-4">
      <p className="text-sm text-foreground">{message}</p>
      <p className="mt-1 text-sm text-muted">
        Global instructions are unavailable until the profile loads.
      </p>
      <ActionButton
        onClick={() => startRetry(() => router.refresh())}
        disabled={retrying}
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </ActionButton>
    </div>
  );
}

function SignOutRow() {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);

    try {
      const result = await signOut();
      if (result.status !== 'error') return;
      setSignOutError('Could not sign out. Please try again.');
    } catch {
      setSignOutError('Could not sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <SettingsRow
        label="Sign out"
        action={
          <ActionButton onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </ActionButton>
        }
      />
      {signOutError ? (
        <p
          className="px-4 py-3 text-sm text-red-500 dark:text-red-400"
          role="alert"
        >
          {signOutError}
        </p>
      ) : null}
    </>
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
      className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full border border-border-subtle px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-foreground/[0.12] hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function BodyFontSelect() {
  const [fontId, setFontId] = useState<BodyFontId>(DEFAULT_BODY_FONT_ID);

  useEffect(() => {
    setFontId(resolveBodyFontId(localStorage.getItem(BODY_FONT_STORAGE_KEY)));
  }, []);

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as BodyFontId;
    persistBodyFont(next);
    applyBodyFont(next);
    setFontId(next);
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
