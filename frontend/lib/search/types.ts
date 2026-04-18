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
  providers: SearchProvider[];
  results: Array<
    Pick<
      SearchCandidate,
      'title' | 'url' | 'domain' | 'snippet' | 'provider' | 'sourceType' | 'publishedAt'
    >
  >;
  error?: string;
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
