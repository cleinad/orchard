'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useViewerIdentity } from '@/app/components/useViewerIdentity';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const router = useRouter();
  const { viewer, loading } = useViewerIdentity();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted/20 border-t-muted" />
      </div>
    );
  }

  if (!viewer) {
    return (
      <div className="py-10 text-sm text-muted">
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
    <div className="grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
      <aside className="self-start lg:sticky lg:top-10">
        <p className="text-xs font-medium text-muted/70">
          Quick Jump
        </p>
        <nav className="mt-4 space-y-1">
          <SettingsAnchor href="#profile" label="Profile" />
          <SettingsAnchor href="#appearance" label="Appearance" />
          <SettingsAnchor href="#workspace" label="Workspace" />
          <SettingsAnchor href="#account" label="Account" />
        </nav>
        <p className="mt-6 max-w-[18rem] text-sm leading-relaxed text-muted">
          This scaffold is meant to be edited. Keep the shell, replace the rows,
          and split sections into deeper pages when you need them.
        </p>
      </aside>

      <div className="min-w-0">
        <section className="pb-10">
          <p className="text-xs font-medium text-muted/70">
            General
          </p>
          <h2 className="mt-3 max-w-2xl font-heading text-4xl leading-tight text-foreground">
            Tune the workspace around your account.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Start with the sections below, then replace placeholder rows with the
            controls you actually want to keep long term.
          </p>
        </section>

        <div className="space-y-12">
          <SettingsSection
            id="profile"
            title="Profile"
            description="Account details that show up around the product."
          >
            <SettingsRow
              label="Display name"
              value={displayName}
              hint="Shown in account surfaces and ready for future collaboration features."
            />
            <SettingsRow
              label="Email"
              value={email}
              hint="Used for authentication and account recovery."
            />
            <SettingsRow
              label="Home side panel"
              value="Profile rail enabled"
              hint="The home drawer now uses this identity block at the bottom."
              action={
                <ActionButton onClick={() => router.push('/home')}>
                  Preview in chat
                </ActionButton>
              }
            />
          </SettingsSection>

          <SettingsSection
            id="appearance"
            title="Appearance"
            description="Global presentation and reading comfort."
          >
            <SettingsRow
              label="Theme"
              value="Header theme picker"
              hint="Use the picker in the top-right header for now, or replace this row with a permanent control later."
            />
            <SettingsRow
              label="Density"
              value="Wire this later"
              hint="Good place for compact, relaxed, or type-scale preferences."
            />
          </SettingsSection>

          <SettingsSection
            id="workspace"
            title="Workspace Defaults"
            description="Starting behavior for chat, memory, and future assistant tools."
          >
            <SettingsRow
              label="Default chat mode"
              value="Wire this later"
              hint="Use this section for persistent vs temporary chat defaults."
            />
            <SettingsRow
              label="Memory review"
              value="Available now"
              hint="Open the existing memory manager while the rest of settings is still being fleshed out."
              action={
                <ActionButton onClick={() => router.push('/memory')}>
                  Open memories
                </ActionButton>
              }
            />
          </SettingsSection>

          <SettingsSection
            id="account"
            title="Account"
            description="Lifecycle actions and session controls."
          >
            <SettingsRow
              label="Sign out"
              value={signingOut ? 'Signing out...' : 'End current session'}
              hint="Useful placeholder for future security actions like session history or device management."
              action={
                <ActionButton onClick={handleSignOut} disabled={signingOut}>
                  {signingOut ? 'Signing out...' : 'Sign out'}
                </ActionButton>
              }
            />
            {signOutError ? (
              <p className="pt-3 text-sm text-red-500 dark:text-red-400">
                {signOutError}
              </p>
            ) : null}
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

function SettingsAnchor({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      className="block rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
    >
      {label}
    </a>
  );
}

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border-subtle pt-6">
      <div className="max-w-2xl">
        <p className="text-xs font-medium text-muted/70">
          {title}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <div className="mt-6">{children}</div>
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
  value: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid gap-4 border-b border-border-subtle py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          {hint}
        </p>
      </div>

      <div className="flex items-center gap-3 sm:justify-end">
        <span className="text-sm text-foreground/84">{value}</span>
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
      className="inline-flex items-center rounded-full border border-border-subtle px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-foreground/[0.12] hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}
