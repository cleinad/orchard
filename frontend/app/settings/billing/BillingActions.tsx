'use client';

import { useState } from 'react';

type BillingAction = 'checkout' | 'portal';

async function startBillingAction(action: BillingAction) {
  const response = await fetch(`/api/billing/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.url) {
    throw new Error(data.error ?? 'Unable to open billing');
  }

  window.location.assign(data.url);
}

export function BillingActions({
  canManageBilling,
  canUpgrade,
}: {
  canManageBilling: boolean;
  canUpgrade: boolean;
}) {
  const [pendingAction, setPendingAction] = useState<BillingAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: BillingAction) {
    setPendingAction(action);
    setError(null);

    try {
      await startBillingAction(action);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Unable to open billing'
      );
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canUpgrade ? (
          <button
            type="button"
            onClick={() => handleAction('checkout')}
            disabled={pendingAction !== null}
            className="inline-flex cursor-pointer items-center rounded-full border border-foreground/15 bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingAction === 'checkout' ? 'Opening...' : 'Upgrade'}
          </button>
        ) : null}

        {canManageBilling ? (
          <button
            type="button"
            onClick={() => handleAction('portal')}
            disabled={pendingAction !== null}
            className="inline-flex cursor-pointer items-center rounded-full border border-border-subtle px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-foreground/[0.12] hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingAction === 'portal' ? 'Opening...' : 'Manage billing'}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
