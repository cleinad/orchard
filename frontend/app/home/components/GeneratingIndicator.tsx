"use client";

import { useEffect, useState } from 'react';
import type { SearchActivitySummary } from '@/lib/search/types';

interface GeneratingIndicatorProps {
  /**
   * Live search activity for the reply being generated, when the run has any.
   * Only `search_started` and `search_completed` reach the client, so the phase
   * vocabulary here stays deliberately coarse.
   */
  searchActivity?: SearchActivitySummary | null;
  /** Rendered inside the transcript rather than as a standalone block. */
  inline?: boolean;
}

/** Elapsed seconds stay hidden until the first tick, so fast replies never flash a counter. */
const ELAPSED_TICK_MS = 1_000;

function phaseLabel(searchActivity: SearchActivitySummary | null | undefined) {
  const latest = searchActivity?.events.at(-1);
  if (latest?.type === 'search_started') return 'Searching';
  if (latest?.type === 'search_completed') {
    return latest.sourceCount === 1 ? 'Reading 1 source' : `Reading ${latest.sourceCount} sources`;
  }
  return 'Thinking';
}

/**
 * The waiting state for an assistant reply: the Orchard mark in motion, the
 * current phase, and how long the reply has been running. The phase is read
 * from real run activity rather than cycled for effect.
 */
export default function GeneratingIndicator({
  searchActivity = null,
  inline = false,
}: GeneratingIndicatorProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, ELAPSED_TICK_MS);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <span
      role="status"
      aria-label="Generating response"
      data-testid="generating-indicator"
      className={`flex select-none items-center gap-2 font-sans text-xs font-medium text-foreground/75 ${inline ? 'py-1' : 'py-4'}`}
    >
      <span aria-hidden="true" className="orchard-orbit" />
      <span aria-hidden="true">{phaseLabel(searchActivity)}</span>
      {elapsedSeconds !== null && elapsedSeconds > 0 && (
        <span aria-hidden="true" className="font-normal tabular-nums text-foreground/40">
          {elapsedSeconds}s
        </span>
      )}
    </span>
  );
}
