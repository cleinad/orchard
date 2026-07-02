export const SEARCH_PROFILES = [
  'fresh_web',
  'research_backed',
  'web_social',
  'official_priority',
] as const;
export type SearchProfile = (typeof SEARCH_PROFILES)[number];

export const SEARCH_PROVIDERS = ['brave', 'exa', 'x'] as const;
export type SearchProvider = (typeof SEARCH_PROVIDERS)[number];

export const SEARCH_SOURCE_TYPES = [
  'official',
  'docs',
  'research',
  'news',
  'government',
  'social',
  'forum',
  'video',
  'other',
] as const;
export type SearchSourceType = (typeof SEARCH_SOURCE_TYPES)[number];

export const SEARCH_PIPELINE_STATUSES = [
  'success',
  'partial',
  'no_results',
  'missing_config',
  'timeout',
  'upstream_error',
] as const;
export type SearchPipelineStatus = (typeof SEARCH_PIPELINE_STATUSES)[number];

export interface SearchCandidate {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  provider: SearchProvider;
  sourceType: SearchSourceType;
  publishedAt: string | null;
  authorityScoreHint: number;
  freshnessScoreHint: number;
  originatingQuery?: string;
}

export interface SearchRoute {
  profile: SearchProfile;
  providers: SearchProvider[];
  query: string;
  freshness: '' | 'pd' | 'pw' | 'pm' | 'py';
  preferOfficial: boolean;
  allowSocial: boolean;
  exaCategory: 'research paper' | 'news' | null;
}

export interface SearchProviderMetrics {
  attempted: boolean;
  httpStatus: number | null;
  requestedResultCount: number | null;
}

export interface SearchProviderResult {
  provider: SearchProvider;
  status: Exclude<SearchPipelineStatus, 'partial'>;
  results: SearchCandidate[];
  error: string | null;
  metrics?: SearchProviderMetrics;
}

export interface SearchPipelineOutput {
  status: SearchPipelineStatus;
  profile: SearchProfile;
  query: string;
  queries?: string[];
  resolvedIntent?: string;
  topicEntities?: string[];
  activity?: SearchActivitySummary;
  providers: SearchProvider[];
  results: Array<
    Pick<
      SearchCandidate,
      'title' | 'url' | 'domain' | 'snippet' | 'provider' | 'sourceType' | 'publishedAt'
    >
    & { originatingQuery?: string; origin?: 'prior' | 'fresh' }
  >;
  error?: string;
}

export type SearchSourceStrategy = 'news' | 'official' | 'research' | 'social' | 'mixed';
export type SearchRunAction = 'searched' | 'not_attempted' | 'failed';
export type SearchPlannerSource = 'deterministic' | 'model' | 'fallback';
export type SearchFreshnessRisk = 'none' | 'low' | 'medium' | 'high';

export interface SearchActionPlan {
  resolvedIntent: string;
  queries: string[];
  topicEntities: string[];
  sourceStrategy: SearchSourceStrategy;
  freshnessNeeded: boolean;
  reusePriorSources: boolean;
  plannerSource: SearchPlannerSource;
  plannerModelId?: string;
}

export type SearchActivityEvent =
  | {
      type: 'planning_started';
      label: string;
    }
  | {
      type: 'search_decision_started';
      mode: 'auto';
      label: string;
    }
  | {
      type: 'search_decision_completed';
      mode: 'auto';
      shouldSearch: boolean;
      reason: string;
      confidence: number;
      freshnessRisk: SearchFreshnessRisk;
      provider?: string;
      providerModelId?: string;
    }
  | {
      type: 'search_skipped';
      mode: 'auto' | 'off';
      reason: 'auto_decision' | 'mode_off';
      label: string;
    }
  | {
      type: 'plan_selected';
      resolvedIntent: string;
      queries: string[];
      reusePriorSources: boolean;
      plannerSource: SearchPlannerSource;
      plannerModelId?: string;
    }
  | {
      type: 'prior_sources_checked';
      sourceCount: number;
      reusedCount: number;
    }
  | {
      type: 'search_started';
      query: string;
      attempt: number;
    }
  | {
      type: 'relevance_checked';
      result: 'accepted' | 'retrying' | 'rejected';
      reason: string;
    }
  | {
      type: 'search_completed';
      sourceCount: number;
      collapsedLabel: string;
    };

export interface SearchActivitySummary {
  events: SearchActivityEvent[];
  collapsedLabel: string;
}

export interface SearchAttempt {
  query: string;
  attempt: number;
  status: SearchPipelineStatus;
  sourceCount: number;
  accepted: boolean;
  reason: string;
}

export function isSearchProfile(value: unknown): value is SearchProfile {
  return typeof value === 'string' && SEARCH_PROFILES.includes(value as SearchProfile);
}

export function isSearchProvider(value: unknown): value is SearchProvider {
  return typeof value === 'string' && SEARCH_PROVIDERS.includes(value as SearchProvider);
}

export function isSearchSourceType(value: unknown): value is SearchSourceType {
  return (
    typeof value === 'string'
    && SEARCH_SOURCE_TYPES.includes(value as SearchSourceType)
  );
}

export function isSearchPipelineStatus(value: unknown): value is SearchPipelineStatus {
  return (
    typeof value === 'string'
    && SEARCH_PIPELINE_STATUSES.includes(value as SearchPipelineStatus)
  );
}
