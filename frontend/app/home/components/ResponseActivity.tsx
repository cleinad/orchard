"use client";

import { useEffect, useState } from 'react';
import type { SearchActivityEvent, SearchActivitySummary } from '@/lib/search/types';

interface ResponseActivityProps {
  /** The run is still working and has not produced answer text yet. */
  live?: boolean;
  searchActivity?: SearchActivitySummary | null;
}

/** Elapsed seconds stay hidden until the first tick, so fast replies never flash a counter. */
const ELAPSED_TICK_MS = 1_000;

type SearchCompleted = Extract<SearchActivityEvent, { type: 'search_completed' }>;

function stepLabel(event: SearchActivityEvent, live: boolean) {
  if (event.type === 'plan_selected') {
    return event.resolvedIntent ? `Looking for ${event.resolvedIntent}` : '';
  }
  if (event.type === 'search_started') {
    return live ? `Searching ${event.query}` : `Searched ${event.query}`;
  }
  return '';
}

function activitySteps(searchActivity: SearchActivitySummary | null, live: boolean) {
  return (searchActivity?.events ?? [])
    .map((event) => stepLabel(event, live))
    .filter((label, index, labels) => label && labels.indexOf(label) === index);
}

function phaseLabel(searchActivity: SearchActivitySummary | null) {
  const latest = searchActivity?.events.at(-1);
  if (latest?.type === 'plan_selected') return 'Planning search';
  if (latest?.type === 'search_started') return 'Searching';
  if (latest?.type === 'search_completed') {
    return latest.sourceCount === 1 ? 'Reading 1 source' : `Reading ${latest.sourceCount} sources`;
  }
  return 'Thinking';
}

function countLabel(count: number, noun: string) {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/** One line describing the work a settled reply was built from. */
function settledSummary(searchActivity: SearchActivitySummary) {
  const searchCount = searchActivity.events.filter(
    (event) => event.type === 'search_started'
  ).length;
  if (searchCount === 0) {
    return searchActivity.collapsedLabel;
  }

  const completed = [...searchActivity.events]
    .reverse()
    .find((event): event is SearchCompleted => event.type === 'search_completed');
  const sourceCount = completed?.sourceCount ?? 0;

  return sourceCount > 0
    ? `${countLabel(searchCount, 'search')} · ${countLabel(sourceCount, 'source')}`
    : countLabel(searchCount, 'search');
}

/**
 * The work behind a reply, in one place. While the run is live this is the
 * animated Orchard mark, the current phase, elapsed seconds, and the queries as
 * they run. Once the reply starts arriving it collapses to a summary line.
 */
export default function ResponseActivity({
  live = false,
  searchActivity = null,
}: ResponseActivityProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!live) return;

    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, ELAPSED_TICK_MS);

    return () => window.clearInterval(interval);
  }, [live]);

  const steps = activitySteps(searchActivity, live);

  if (live) {
    return (
      <div
        role="status"
        aria-label="Generating response"
        data-testid="response-activity"
        className="select-none py-1 font-sans text-xs"
      >
        <div className="flex items-center gap-2 font-medium text-foreground/75">
          <span aria-hidden="true" className="orchard-orbit" />
          <span aria-hidden="true">{phaseLabel(searchActivity)}</span>
          {elapsedSeconds !== null && elapsedSeconds > 0 && (
            <span aria-hidden="true" className="tabular-nums text-foreground/40">
              {elapsedSeconds}s
            </span>
          )}
        </div>
        {steps.length > 0 && (
          <ol aria-hidden="true" className="mt-1.5 space-y-1 pl-8 text-muted/60">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  if (!searchActivity) {
    return null;
  }

  const summary = settledSummary(searchActivity);
  if (!summary) {
    return null;
  }

  return (
    <div
      data-testid="response-activity"
      className="mt-2 font-sans text-xs text-muted/70"
      onPointerUp={(event) => event.stopPropagation()}
    >
      {steps.length > 0 ? (
        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md py-0.5 text-muted/80 transition-colors hover:text-foreground">
            <span>{summary}</span>
            <span className="text-muted/45 transition group-open:rotate-90">&gt;</span>
          </summary>
          <ol className="mt-1.5 space-y-1 pl-3 text-muted/60">
            {steps.map((step) => (
              <li key={step} className="list-decimal pl-1">
                {step}
              </li>
            ))}
          </ol>
        </details>
      ) : (
        <span>{summary}</span>
      )}
    </div>
  );
}
