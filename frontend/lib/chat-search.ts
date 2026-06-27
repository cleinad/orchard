import {
  createPersistedSearchMetadataV2,
  type PersistedSearchMetadata,
  type SearchAttemptStatus,
} from '@/lib/search-citations';
import type { SearchActivitySummary, SearchPipelineOutput } from '@/lib/search/types';

export type { PersistedSearchMetadata } from '@/lib/search-citations';

export const SEARCH_MODES = ['auto', 'required', 'off'] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];
export type SearchSkipReason = 'mode_off' | 'auto_decision';
export type SearchFreshnessRisk = 'none' | 'low' | 'medium' | 'high';

export interface SearchDecision {
  shouldSearch: boolean;
  reason: string;
  confidence: number;
  freshnessRisk: SearchFreshnessRisk;
  provider?: string;
  providerModelId?: string;
}

export type SearchStatus = 'not_attempted' | SearchAttemptStatus;

export interface SearchMetadata {
  mode: SearchMode;
  attempted: boolean;
  status: SearchStatus;
  resultCount: number;
  warning: string | null;
  metadata: PersistedSearchMetadata | null;
  decision?: SearchDecision;
  skippedReason?: SearchSkipReason;
}

function getSearchWarning(
  searchMode: SearchMode,
  status: SearchStatus,
  attempted: boolean
) {
  if (!attempted) {
    return searchMode === 'required'
      ? 'Search mode did not run for the last reply.'
      : null;
  }

  switch (status) {
    case 'success':
    case 'partial':
      return null;
    case 'no_results':
      return 'Search mode did not find useful sources for the last reply.';
    case 'missing_config':
    case 'timeout':
    case 'upstream_error':
      return 'Search mode was unavailable for the last reply.';
    default:
      return null;
  }
}

function getSearchDisclosure(metadata: SearchMetadata) {
  if (!metadata.attempted) {
    return metadata.mode === 'required'
      ? 'I could not ground this reply with live sources, so it may not reflect the latest information.'
      : null;
  }

  switch (metadata.status) {
    case 'missing_config':
    case 'timeout':
    case 'upstream_error':
      return "Search mode is unavailable right now, so I'm answering without fresh web results.";
    default:
      return null;
  }
}

export function createSearchMetadataFromPersisted(
  searchMode: SearchMode,
  metadata: PersistedSearchMetadata | null
): SearchMetadata {
  const attempted = metadata !== null;
  const status: SearchStatus = metadata?.status ?? 'not_attempted';

  return {
    mode: searchMode,
    attempted,
    status,
    resultCount: metadata?.sources.length ?? 0,
    warning: getSearchWarning(searchMode, status, attempted),
    metadata,
  };
}

export function createNotAttemptedSearchMetadata(searchMode: SearchMode): SearchMetadata {
  return createSearchMetadataFromPersisted(searchMode, null);
}

export function withSearchDebugMetadata(
  metadata: SearchMetadata,
  debug: {
    decision?: SearchDecision | null;
    skippedReason?: SearchSkipReason | null;
  }
): SearchMetadata {
  return {
    ...metadata,
    ...(debug.decision ? { decision: debug.decision } : {}),
    ...(debug.skippedReason ? { skippedReason: debug.skippedReason } : {}),
  };
}

export function createSearchMetadataFromOutput(
  output: SearchPipelineOutput,
  searchMode: SearchMode
): SearchMetadata {
  return createSearchMetadataFromPersisted(
    searchMode,
    createPersistedSearchMetadataV2(output)
  );
}

export function createFailedSearchMetadata(
  searchMode: SearchMode,
  status: Exclude<SearchAttemptStatus, 'success' | 'partial'>,
  query: string | null,
  activity?: SearchActivitySummary
): SearchMetadata {
  if (searchMode !== 'required') {
    return createSearchMetadataFromPersisted(searchMode, null);
  }

  return createSearchMetadataFromPersisted(searchMode, {
    version: 2,
    mode: 'required',
    profile: 'fresh_web',
    status,
    query,
    ...(activity ? { activity } : {}),
    providers: [],
    sources: [],
  });
}

export function applySearchDisclosure(text: string, metadata: SearchMetadata) {
  const disclosure = getSearchDisclosure(metadata);
  if (!disclosure || text.startsWith(disclosure)) {
    return text;
  }

  return text ? `${disclosure}\n\n${text}` : disclosure;
}
