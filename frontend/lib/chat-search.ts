import type { WebSearchToolOutput } from '@/lib/tools';
import {
  createPersistedSearchMetadata,
  type PersistedSearchMetadata,
  type SearchAttemptStatus,
  type SearchMode,
} from '@/lib/search-citations';

export type { PersistedSearchMetadata, SearchMode } from '@/lib/search-citations';

export type SearchStatus = 'not_attempted' | SearchAttemptStatus;

export interface SearchMetadata {
  mode: SearchMode;
  attempted: boolean;
  status: SearchStatus;
  resultCount: number;
  warning: string | null;
  metadata: PersistedSearchMetadata | null;
}

function getSearchWarning(
  searchMode: SearchMode,
  status: SearchStatus,
  attempted: boolean
) {
  if (!attempted) {
    return searchMode === 'required'
      ? 'Live search did not run for the last reply.'
      : null;
  }

  switch (status) {
    case 'success':
      return null;
    case 'no_results':
      return 'Live search did not find useful results for the last reply.';
    case 'missing_config':
    case 'timeout':
    case 'upstream_error':
      return 'Live search was unavailable for the last reply.';
    default:
      return null;
  }
}

function getSearchDisclosure(metadata: SearchMetadata) {
  if (!metadata.attempted) {
    return metadata.mode === 'required'
      ? 'I could not ground this reply with live web results, so it may not reflect the latest information.'
      : null;
  }

  switch (metadata.status) {
    case 'no_results':
      return "Live search didn't find useful results for that, so I'm answering based on what I already know.";
    case 'missing_config':
    case 'timeout':
    case 'upstream_error':
      return "Live search is unavailable right now, so I'm answering without fresh web results.";
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

export function createSearchMetadataFromOutput(
  output: WebSearchToolOutput,
  searchMode: SearchMode
): SearchMetadata {
  return createSearchMetadataFromPersisted(
    searchMode,
    createPersistedSearchMetadata(searchMode, output)
  );
}

export function createFailedSearchMetadata(
  searchMode: SearchMode,
  status: Exclude<SearchAttemptStatus, 'success'>,
  query: string | null
): SearchMetadata {
  return createSearchMetadataFromPersisted(searchMode, {
    version: 1,
    mode: searchMode,
    status,
    query,
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
