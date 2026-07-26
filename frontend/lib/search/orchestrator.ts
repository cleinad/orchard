import {
  createPersistedSearchMetadataV2,
  hasUsableSearchSources,
  type PersistedSearchMetadata,
  type SearchSource,
} from '@/lib/search-citations';
import { sourcesFromSearchOutput, sourceMatchesPlan } from '@/lib/search/evidence';
import { runSearchPipeline } from '@/lib/search/pipeline';
import {
  decideSearchNecessity,
  planSearchAction,
  type PlannerLogger,
  type SearchPlannerMessage,
} from '@/lib/search/query-planner';
import { assessSearchResults, buildRepairQuery } from '@/lib/search/relevance';
import type { SearchDecision, SearchMode, SearchSkipReason } from '@/lib/chat-search';
import type {
  SearchActionPlan,
  SearchActivityEvent,
  SearchActivitySummary,
  SearchAttempt,
  SearchPipelineOutput,
  SearchProvider,
  SearchRunAction,
} from '@/lib/search/types';

export interface ConversationalSearchMessage extends SearchPlannerMessage {
  searchMetadata?: PersistedSearchMetadata | null;
}

export interface ConversationalSearchInput {
  latestMessage: string;
  messages: ConversationalSearchMessage[];
  currentTime: string;
  currentDateLabel: string;
  searchMode: SearchMode;
  maxQueries?: number;
}

export interface ConversationalSearchRun {
  action: SearchRunAction;
  plan: SearchActionPlan;
  attempts: SearchAttempt[];
  metadata: PersistedSearchMetadata | null;
  activity: SearchActivitySummary;
  collapsedActivityLabel: string;
  mode: SearchMode;
  decision: SearchDecision | null;
  skippedReason: SearchSkipReason | null;
}

type PlannerDependencies = NonNullable<Parameters<typeof planSearchAction>[1]>;
type PlannerModel = PlannerDependencies['model'];
type DecisionDependencies = NonNullable<Parameters<typeof decideSearchNecessity>[1]>;

function createActivitySummary(events: SearchActivityEvent[]): SearchActivitySummary {
  const completed = [...events]
    .reverse()
    .find((event): event is Extract<SearchActivityEvent, { type: 'search_completed' }> =>
      event.type === 'search_completed'
    );
  const latest = events.at(-1);

  let activeLabel = 'Preparing search context';
  if (latest?.type === 'planning_started') activeLabel = latest.label;
  if (latest?.type === 'search_decision_started') activeLabel = latest.label;
  if (latest?.type === 'search_decision_completed') {
    activeLabel = latest.shouldSearch
      ? 'Search needed; planning fresh results'
      : latest.reason;
  }
  if (latest?.type === 'search_skipped') activeLabel = latest.label;
  if (latest?.type === 'plan_selected') activeLabel = `Searching for ${latest.resolvedIntent}`;
  if (latest?.type === 'prior_sources_checked') {
    activeLabel =
      latest.reusedCount > 0
        ? `Reusing ${latest.reusedCount} prior sources and searching fresh results`
        : 'Searching fresh results';
  }
  if (latest?.type === 'search_started') activeLabel = `Searching ${latest.query}`;
  if (latest?.type === 'relevance_checked') activeLabel = latest.reason;

  return {
    events,
    collapsedLabel: completed?.collapsedLabel ?? activeLabel,
  };
}

function createVisibleActivitySummary(events: SearchActivityEvent[]): SearchActivitySummary {
  return createActivitySummary(
    events.filter(
      (event) =>
        event.type !== 'planning_started'
        && event.type !== 'search_decision_started'
        && event.type !== 'search_decision_completed'
        && event.type !== 'search_skipped'
        && event.type !== 'plan_selected'
        && event.type !== 'prior_sources_checked'
        && event.type !== 'relevance_checked'
    )
  );
}

function defaultNoSearchPlan(latestMessage: string): SearchActionPlan {
  return {
    resolvedIntent: latestMessage || 'Search is disabled.',
    queries: [],
    topicEntities: [],
    sourceStrategy: 'mixed',
    freshnessNeeded: false,
    reusePriorSources: false,
    plannerSource: 'deterministic',
  };
}

function priorSearches(messages: ConversationalSearchMessage[]) {
  return messages
    .map((message) => message.searchMetadata ?? null)
    .filter((metadata): metadata is PersistedSearchMetadata => metadata !== null);
}

function attachActivity(
  metadata: PersistedSearchMetadata | null,
  activity: SearchActivitySummary,
  plan: SearchActionPlan
) {
  if (!metadata || metadata.version !== 2) {
    return metadata;
  }

  return {
    ...metadata,
    queries: metadata.queries ?? plan.queries,
    resolvedIntent: metadata.resolvedIntent ?? plan.resolvedIntent,
    topicEntities: metadata.topicEntities ?? plan.topicEntities,
    activity,
  };
}

function relevantPriorSources(searches: PersistedSearchMetadata[], plan: SearchActionPlan) {
  if (!plan.reusePriorSources) {
    return [];
  }

  const sources: SearchSource[] = [];
  const seen = new Set<string>();

  for (const search of [...searches].reverse()) {
    if (!hasUsableSearchSources(search)) continue;

    for (const source of search.sources) {
      const key = source.url.trim().toLowerCase();
      if (!key || seen.has(key) || !sourceMatchesPlan(source, plan)) continue;
      seen.add(key);
      sources.push(source);
      if (sources.length >= 6) return sources;
    }
  }

  return sources;
}

function combineOutputs({
  outputs,
  plan,
  priorSources,
}: {
  outputs: SearchPipelineOutput[];
  plan: SearchActionPlan;
  priorSources: SearchSource[];
}): SearchPipelineOutput {
  const seen = new Set<string>();
  const results: SearchPipelineOutput['results'] = [];
  const providers = new Set<SearchProvider>();

  for (const output of outputs) {
    output.providers.forEach((provider) => providers.add(provider));

    for (const result of output.results) {
      const key = result.url.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      results.push({
        ...result,
        originatingQuery: result.originatingQuery ?? output.query,
        origin: 'fresh',
      });
    }
  }

  for (const source of priorSources) {
    const key = source.url.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (source.provider) providers.add(source.provider);
    results.push({
      title: source.title,
      url: source.url,
      domain: source.domain,
      snippet: source.snippet,
      provider: source.provider ?? 'brave',
      sourceType: source.sourceType ?? 'other',
      publishedAt: source.publishedAt,
      origin: 'prior',
    });
  }

  const successful = outputs.find((output) => output.status === 'success' || output.status === 'partial');
  const first = outputs[0];
  return {
    status: results.length > 0 ? successful?.status ?? 'success' : first?.status ?? 'no_results',
    profile: first?.profile ?? 'fresh_web',
    query: first?.query ?? plan.queries[0] ?? plan.resolvedIntent,
    queries: plan.queries,
    resolvedIntent: plan.resolvedIntent,
    topicEntities: plan.topicEntities,
    providers: [...providers],
    results,
    error: outputs.map((output) => output.error).filter(Boolean).join('; ') || undefined,
  };
}

function createRejectedOutput(output: SearchPipelineOutput): SearchPipelineOutput {
  const status =
    output.status === 'missing_config' || output.status === 'timeout' || output.status === 'upstream_error'
      ? output.status
      : 'no_results';

  return {
    ...output,
    status,
    results: [],
  };
}

export async function runConversationalSearch(
  input: ConversationalSearchInput,
  dependencies: {
    model?: PlannerModel | null;
    decisionModel?: PlannerModel | null;
    plannerModelId?: string;
    decisionModelId?: string;
    decisionProvider?: string;
    fallbackDecisionModel?: PlannerModel | null;
    fallbackDecisionModelId?: string;
    fallbackDecisionProvider?: string;
    plannerProvider?: string;
    planner?: typeof planSearchAction;
    decider?: typeof decideSearchNecessity;
    modelDecision?: DecisionDependencies['modelDecision'];
    searchPipeline?: typeof runSearchPipeline;
    activityWriter?: (activity: SearchActivitySummary) => void;
    logger?: PlannerLogger;
  } = {}
): Promise<ConversationalSearchRun> {
  const events: SearchActivityEvent[] = [
    {
      type: 'planning_started',
      label: 'Understanding the follow-up...',
    },
  ];
  const searches = priorSearches(input.messages);
  const planner = dependencies.planner ?? planSearchAction;
  const decider = dependencies.decider ?? decideSearchNecessity;
  const pipeline = dependencies.searchPipeline ?? runSearchPipeline;
  const maxQueries = Math.min(Math.max(input.maxQueries ?? 3, 1), 3);
  let exposeActivity = input.searchMode === 'required';
  const publishActivity = () => {
    if (!exposeActivity) {
      return;
    }

    const visibleActivity = createVisibleActivitySummary(events);
    if (visibleActivity.events.length === 0) {
      return;
    }

    dependencies.activityWriter?.(visibleActivity);
  };

  publishActivity();

  if (input.searchMode === 'off') {
    const plan = defaultNoSearchPlan(input.latestMessage);
    events.push({
      type: 'search_skipped',
      mode: 'off',
      reason: 'mode_off',
      label: 'Search is off for this reply',
    });
    events.push({
      type: 'search_completed',
      sourceCount: 0,
      collapsedLabel: 'Search is off for this reply',
    });
    publishActivity();
    const activity = createActivitySummary(events);
    return {
      action: 'not_attempted',
      plan,
      attempts: [],
      metadata: null,
      activity,
      collapsedActivityLabel: activity.collapsedLabel,
      mode: input.searchMode,
      decision: null,
      skippedReason: 'mode_off',
    };
  }

  let decision: SearchDecision | null = null;

  if (input.searchMode === 'auto') {
    events.push({
      type: 'search_decision_started',
      mode: 'auto',
      label: 'Deciding whether search is needed...',
    });
    publishActivity();

    decision = await decider(
      {
        latestMessage: input.latestMessage,
        recentMessages: input.messages,
        priorSearches: searches,
        currentTime: input.currentTime,
        currentDateLabel: input.currentDateLabel,
        searchMode: input.searchMode,
        maxQueries,
      },
      {
        model: dependencies.decisionModel ?? dependencies.model,
        modelDecision: dependencies.modelDecision,
        ...(dependencies.decisionModelId || dependencies.plannerModelId
          ? { plannerModelId: dependencies.decisionModelId ?? dependencies.plannerModelId }
          : {}),
        ...(dependencies.decisionProvider ? { provider: dependencies.decisionProvider } : {}),
        ...(dependencies.fallbackDecisionModel
          ? { fallbackModel: dependencies.fallbackDecisionModel }
          : {}),
        ...(dependencies.fallbackDecisionModelId
          ? { fallbackPlannerModelId: dependencies.fallbackDecisionModelId }
          : {}),
        ...(dependencies.fallbackDecisionProvider
          ? { fallbackProvider: dependencies.fallbackDecisionProvider }
          : {}),
        ...(dependencies.logger ? { logger: dependencies.logger } : {}),
      }
    );

    events.push({
      type: 'search_decision_completed',
      mode: 'auto',
      shouldSearch: decision.shouldSearch,
      reason: decision.reason,
      confidence: decision.confidence,
      freshnessRisk: decision.freshnessRisk,
      provider: decision.provider,
      providerModelId: decision.providerModelId,
    });
    publishActivity();

    if (!decision.shouldSearch) {
      const plan = defaultNoSearchPlan(input.latestMessage);
      events.push({
        type: 'search_skipped',
        mode: 'auto',
        reason: 'auto_decision',
        label: 'Search skipped by auto mode',
      });
      events.push({
        type: 'search_completed',
        sourceCount: 0,
        collapsedLabel: 'Search skipped by auto mode',
      });
      publishActivity();
      const activity = createActivitySummary(events);
      return {
        action: 'not_attempted',
        plan,
        attempts: [],
        metadata: null,
        activity,
        collapsedActivityLabel: activity.collapsedLabel,
        mode: input.searchMode,
        decision,
        skippedReason: 'auto_decision',
      };
    }

    exposeActivity = true;
    events.push({
      type: 'planning_started',
      label: 'Planning search...',
    });
    publishActivity();
  }

  const plan = await planner(
    {
      latestMessage: input.latestMessage,
      recentMessages: input.messages,
      priorSearches: searches,
      currentTime: input.currentTime,
      currentDateLabel: input.currentDateLabel,
      searchMode: input.searchMode,
      maxQueries,
    },
    {
      model: dependencies.model,
      ...(dependencies.plannerModelId ? { plannerModelId: dependencies.plannerModelId } : {}),
      ...(dependencies.plannerProvider ? { plannerProvider: dependencies.plannerProvider } : {}),
      ...(dependencies.logger ? { logger: dependencies.logger } : {}),
    }
  );

  events.push({
    type: 'plan_selected',
    resolvedIntent: plan.resolvedIntent,
    queries: plan.queries,
    reusePriorSources: plan.reusePriorSources,
    plannerSource: plan.plannerSource,
    ...(plan.plannerModelId ? { plannerModelId: plan.plannerModelId } : {}),
  });
  publishActivity();

  if (plan.queries.length === 0) {
    events.push({
      type: 'search_completed',
      sourceCount: 0,
      collapsedLabel: 'Search was not run for this reply',
    });
    publishActivity();
    const activity = createActivitySummary(events);
    return {
      action: 'not_attempted',
      plan,
      attempts: [],
      metadata: null,
      activity,
      collapsedActivityLabel: activity.collapsedLabel,
      mode: input.searchMode,
      decision,
      skippedReason: null,
    };
  }

  const priorSources = relevantPriorSources(searches, plan);
  events.push({
    type: 'prior_sources_checked',
    sourceCount: searches.reduce((count, search) => count + search.sources.length, 0),
    reusedCount: priorSources.length,
  });
  publishActivity();

  const boundedQueries = plan.queries.slice(0, maxQueries);
  boundedQueries.forEach((query, index) => {
    events.push({ type: 'search_started', query, attempt: index + 1 });
  });
  publishActivity();

  const outputs = await Promise.all(boundedQueries.map((query) => pipeline(query)));
  let combinedOutput = combineOutputs({ outputs, plan: { ...plan, queries: boundedQueries }, priorSources });
  let assessment = assessSearchResults(combinedOutput, plan);
  const attempts: SearchAttempt[] = boundedQueries.map((query, index) => ({
    query,
    attempt: index + 1,
    status: outputs[index]?.status ?? 'no_results',
    sourceCount: outputs[index]?.results.length ?? 0,
    accepted: assessment.accepted,
    reason: assessment.reason,
  }));

  events.push({
    type: 'relevance_checked',
    result: assessment.accepted ? 'accepted' : 'retrying',
    reason: assessment.reason,
  });
  publishActivity();

  if (!assessment.accepted) {
    const repairQuery = buildRepairQuery(plan, boundedQueries);
    if (repairQuery) {
      events.push({ type: 'search_started', query: repairQuery, attempt: boundedQueries.length + 1 });
      publishActivity();
      const repairOutput = await pipeline(repairQuery);
      const repairAssessment = assessSearchResults(repairOutput, plan);
      attempts.push({
        query: repairQuery,
        attempt: boundedQueries.length + 1,
        status: repairOutput.status,
        sourceCount: repairOutput.results.length,
        accepted: repairAssessment.accepted,
        reason: repairAssessment.reason,
      });

      if (
        repairAssessment.accepted
        || repairAssessment.scoredResults.reduce((sum, item) => sum + item.score, 0)
          > assessment.scoredResults.reduce((sum, item) => sum + item.score, 0)
      ) {
        combinedOutput = combineOutputs({
          outputs: [repairOutput],
          plan: { ...plan, queries: [...boundedQueries, repairQuery] },
          priorSources,
        });
        assessment = repairAssessment;
      }

      events.push({
        type: 'relevance_checked',
        result: assessment.accepted ? 'accepted' : 'rejected',
        reason: assessment.reason,
      });
      publishActivity();
    }
  }

  const acceptedOutput = assessment.accepted
    ? {
        ...combinedOutput,
        results: assessment.scoredResults.map((item) => item.source).slice(0, 10),
      }
    : createRejectedOutput(combinedOutput);
  const sources = sourcesFromSearchOutput(acceptedOutput);

  events.push({
    type: 'search_completed',
    sourceCount: sources.length,
    collapsedLabel: 'Search completed',
  });
  publishActivity();

  const activity = createActivitySummary(events);
  const visibleActivity = createVisibleActivitySummary(events);
  const shouldExposeActivity = exposeActivity;

  const metadata = shouldExposeActivity
    ? attachActivity(createPersistedSearchMetadataV2(acceptedOutput), visibleActivity, plan)
    : createPersistedSearchMetadataV2(acceptedOutput);

  return {
    action: sources.length > 0 ? 'searched' : 'failed',
    plan,
    attempts,
    metadata,
    activity,
    collapsedActivityLabel: activity.collapsedLabel,
    mode: input.searchMode,
    decision,
    skippedReason: null,
  };
}
