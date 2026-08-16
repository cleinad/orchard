"use client";

import { useEffect, useRef, useState } from 'react';
import type { SearchActivityEvent, SearchActivitySummary } from '@/lib/search/types';

interface ResponseActivityProps {
  /** The run is still working, whether or not answer text has started. */
  live?: boolean;
  /** No answer text has arrived yet. */
  awaitingFirstToken?: boolean;
  searchActivity?: SearchActivitySummary | null;
  /** Streamed model reasoning. Shown live only; not every model emits it. */
  reasoning?: string;
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

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** One line describing the work a settled reply was built from. */
function settledSummary(searchActivity: SearchActivitySummary) {
  const searchCount = searchActivity.events.filter(
    (event) => event.type === 'search_started'
  ).length;
  const completed = [...searchActivity.events]
    .reverse()
    .find((event): event is SearchCompleted => event.type === 'search_completed');
  const sourceCount = completed?.sourceCount ?? 0;

  /*
   * Counts only describe a reply that actually got sources. Without them the
   * label carries the reason, such as a search being off or unavailable.
   */
  if (searchCount === 0 || sourceCount === 0) {
    return searchActivity.collapsedLabel;
  }

  return `${countLabel(searchCount, 'search', 'searches')} · ${countLabel(sourceCount, 'source', 'sources')}`;
}

/**
 * The work behind a reply, in one place. While the run is live this is the
 * animated Orchard mark, the current phase, elapsed seconds, and the queries as
 * they run. Once the reply starts arriving it collapses to a summary line.
 */
export default function ResponseActivity({
  live = false,
  awaitingFirstToken = false,
  searchActivity = null,
  reasoning = '',
}: ResponseActivityProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const reasoningRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!live) return;

    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, ELAPSED_TICK_MS);

    return () => window.clearInterval(interval);
  }, [live]);

  /* Keep the newest reasoning in view without moving the rest of the page. */
  useEffect(() => {
    const node = reasoningRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [reasoning]);

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
          <span aria-hidden="true">
            {awaitingFirstToken ? phaseLabel(searchActivity) : 'Writing'}
          </span>
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
        {reasoning && (
          <div
            ref={reasoningRef}
            aria-hidden="true"
            className="composer-scrollbar mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap pl-8 leading-relaxed text-muted/55"
          >
            {reasoning}
          </div>
        )}
      </div>
    );
  }

  const summary = searchActivity ? settledSummary(searchActivity) : 'Reasoning';
  if (!summary || (!searchActivity && !reasoning)) {
    return null;
  }

  return (
    <div
      data-testid="response-activity"
      className="mt-2 font-sans text-xs text-muted/70"
      onPointerUp={(event) => event.stopPropagation()}
    >
      {steps.length > 0 || reasoning ? (
        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md py-0.5 text-muted/80 transition-colors hover:text-foreground">
            <span>{summary}</span>
            <span className="text-muted/45 transition group-open:rotate-90">&gt;</span>
          </summary>
          {steps.length > 0 && (
            <ol className="mt-1.5 space-y-1 pl-3 text-muted/60">
              {steps.map((step) => (
                <li key={step} className="list-decimal pl-1">
                  {step}
                </li>
              ))}
            </ol>
          )}
          {reasoning && (
            <div className="mt-1.5 whitespace-pre-wrap pl-3 leading-relaxed text-muted/55">
              {reasoning}
            </div>
          )}
        </details>
      ) : (
        <span>{summary}</span>
      )}
    </div>
  );
}
