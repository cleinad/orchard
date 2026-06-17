import type { SearchPipelineOutput, SearchProfile, SearchProvider, SearchSourceType } from '@/lib/search/types';
import {
  isSearchPipelineStatus,
  isSearchProfile,
  isSearchProvider,
  isSearchSourceType,
  SEARCH_PIPELINE_STATUSES,
} from '@/lib/search/types';

export const LEGACY_SEARCH_MODES = ['auto', 'required'] as const;
export type LegacySearchMode = (typeof LEGACY_SEARCH_MODES)[number];

export const SEARCH_ATTEMPT_STATUSES = SEARCH_PIPELINE_STATUSES;
export type SearchAttemptStatus = (typeof SEARCH_ATTEMPT_STATUSES)[number];

export interface SearchSource {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  provider: SearchProvider | null;
  sourceType: SearchSourceType | null;
  publishedAt: string | null;
}

export interface PersistedSearchMetadataV1 {
  version: 1;
  mode: LegacySearchMode;
  status: Exclude<SearchAttemptStatus, 'partial'>;
  query: string | null;
  sources: SearchSource[];
}

export interface PersistedSearchMetadataV2 {
  version: 2;
  mode: 'required';
  profile: SearchProfile;
  status: SearchAttemptStatus;
  query: string | null;
  providers: SearchProvider[];
  sources: SearchSource[];
}

export type PersistedSearchMetadata =
  | PersistedSearchMetadataV1
  | PersistedSearchMetadataV2;

export type CitationPart =
  | { type: 'text'; text: string }
  | { type: 'citation'; text: string; sourceId: number };

const MAX_PERSISTED_SNIPPET_LENGTH = 220;
const CITATION_PATTERN = /\[(\d+)\]/g;
const CITATION_BEFORE_BOUNDARY = /[\s([{,;:]/;
const CITATION_AFTER_BOUNDARY = /[\s)\].,;:!?\[]/;

interface LegacyPersistedSearchSource {
  id: number;
  title: string;
  url: string;
  snippet: string;
}

interface LegacyWebSearchToolOutput {
  status: PersistedSearchMetadataV1['status'];
  query: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function isLegacySearchMode(value: unknown): value is LegacySearchMode {
  return typeof value === 'string' && LEGACY_SEARCH_MODES.includes(value as LegacySearchMode);
}

function isVersion1Status(
  value: unknown
): value is PersistedSearchMetadataV1['status'] {
  return (
    typeof value === 'string'
    && value !== 'partial'
    && SEARCH_ATTEMPT_STATUSES.includes(value as SearchAttemptStatus)
  );
}

function normalizeSource(source: unknown): SearchSource | null {
  if (!isRecord(source)) {
    return null;
  }

  const { id, title, url, domain, snippet } = source;
  if (
    typeof id !== 'number'
    || !Number.isInteger(id)
    || typeof title !== 'string'
    || typeof url !== 'string'
    || typeof domain !== 'string'
    || typeof snippet !== 'string'
  ) {
    return null;
  }

  if (id < 1) {
    return null;
  }

  const provider =
    'provider' in source && source.provider !== null && source.provider !== undefined
      ? isSearchProvider(source.provider)
        ? source.provider
        : null
      : null;
  const sourceType =
    'sourceType' in source && source.sourceType !== null && source.sourceType !== undefined
      ? isSearchSourceType(source.sourceType)
        ? source.sourceType
        : null
      : null;
  const publishedAt =
    'publishedAt' in source && source.publishedAt !== undefined
      ? source.publishedAt === null
        ? null
        : typeof source.publishedAt === 'string'
          ? source.publishedAt
          : null
      : null;

  if (
    ('provider' in source && source.provider !== null && source.provider !== undefined && !provider)
    || (
      'sourceType' in source
      && source.sourceType !== null
      && source.sourceType !== undefined
      && !sourceType
    )
    || (
      'publishedAt' in source
      && source.publishedAt !== null
      && source.publishedAt !== undefined
      && publishedAt === null
    )
  ) {
    return null;
  }

  return {
    id,
    title,
    url,
    domain,
    snippet,
    provider,
    sourceType,
    publishedAt,
  };
}

function withCitationMatches(
  text: string,
  iteratee: (match: {
    sourceId: number;
    citationStart: number;
    citationEnd: number;
    citationText: string;
  }) => boolean
) {
  CITATION_PATTERN.lastIndex = 0;
  let lastAcceptedCitationEnd: number | null = null;

  for (const match of text.matchAll(CITATION_PATTERN)) {
    const sourceId = Number(match[1]);
    const citationStart = match.index ?? 0;
    const citationText = `[${sourceId}]`;
    const citationEnd = citationStart + citationText.length;
    const previousChar = citationStart > 0 ? text[citationStart - 1] : '';
    const nextChar = citationEnd < text.length ? text[citationEnd] : '';
    const isAdjacentToAcceptedCitation = lastAcceptedCitationEnd === citationStart;
    const hasValidStart =
      citationStart === 0
      || isAdjacentToAcceptedCitation
      || CITATION_BEFORE_BOUNDARY.test(previousChar);
    const hasValidEnd =
      citationEnd === text.length
      || nextChar === '['
      || CITATION_AFTER_BOUNDARY.test(nextChar);

    if (!hasValidStart || !hasValidEnd) {
      continue;
    }

    const wasAccepted = iteratee({
      sourceId,
      citationStart,
      citationEnd,
      citationText,
    });
    if (wasAccepted) {
      lastAcceptedCitationEnd = citationEnd;
    }
  }
}

function normalizeCitationWhitespace(text: string) {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:!?])/g, '$1')
    .trimEnd();
}

function getValidSourceIds(searchMetadata: PersistedSearchMetadata | null | undefined) {
  if (
    !searchMetadata
    || (searchMetadata.status !== 'success' && searchMetadata.status !== 'partial')
    || searchMetadata.sources.length === 0
  ) {
    return new Set<number>();
  }

  return new Set(searchMetadata.sources.map((source) => source.id));
}

function createNormalizedSource(
  source: LegacyPersistedSearchSource,
  nextId: number
): SearchSource {
  return {
    id: nextId,
    title: source.title,
    url: source.url,
    domain: getSourceDomain(source.url),
    snippet: truncateText(source.snippet, MAX_PERSISTED_SNIPPET_LENGTH),
    provider: null,
    sourceType: null,
    publishedAt: null,
  };
}

export function hasUsableSearchSources(
  searchMetadata: PersistedSearchMetadata | null | undefined
) {
  if (!searchMetadata || searchMetadata.sources.length === 0) {
    return false;
  }

  return searchMetadata.status === 'success' || searchMetadata.status === 'partial';
}

export function getSourceDomain(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function createPersistedSearchMetadata(
  searchMode: LegacySearchMode,
  output: LegacyWebSearchToolOutput
): PersistedSearchMetadataV1 {
  const sources: SearchSource[] = [];
  const seenUrls = new Set<string>();

  if (output.status === 'success') {
    for (const result of output.results) {
      if (seenUrls.has(result.url)) {
        continue;
      }

      seenUrls.add(result.url);
      sources.push(
        createNormalizedSource(
          {
            id: sources.length + 1,
            title: result.title,
            url: result.url,
            snippet: result.snippet,
          },
          sources.length + 1
        )
      );
    }
  }

  return {
    version: 1,
    mode: searchMode,
    status: output.status,
    query: output.query || null,
    sources,
  };
}

export function createPersistedSearchMetadataV2(
  output: SearchPipelineOutput
): PersistedSearchMetadataV2 {
  const sources: SearchSource[] = [];
  const seenUrls = new Set<string>();

  for (const result of output.results) {
    const normalizedUrl = result.url.trim();
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) {
      continue;
    }

    seenUrls.add(normalizedUrl);
    sources.push({
      id: sources.length + 1,
      title: truncateText(result.title, 180),
      url: normalizedUrl,
      domain: getSourceDomain(normalizedUrl),
      snippet: truncateText(result.snippet, MAX_PERSISTED_SNIPPET_LENGTH),
      provider: result.provider,
      sourceType: result.sourceType,
      publishedAt: result.publishedAt,
    });
  }

  return {
    version: 2,
    mode: 'required',
    profile: output.profile,
    status: output.status,
    query: output.query || null,
    providers: output.providers,
    sources,
  };
}

export function parsePersistedSearchMetadata(
  value: unknown
): PersistedSearchMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const { version } = value;

  if (version === 1) {
    const { mode, status, query, sources } = value;
    if (
      !isLegacySearchMode(mode)
      || !isVersion1Status(status)
      || (query !== null && typeof query !== 'string')
      || !Array.isArray(sources)
    ) {
      return null;
    }

    const normalizedSources = sources
      .map(normalizeSource)
      .filter((source): source is SearchSource => source !== null);

    if (normalizedSources.length !== sources.length) {
      return null;
    }

    return {
      version: 1,
      mode,
      status,
      query,
      sources: normalizedSources,
    };
  }

  if (version === 2) {
    const { mode, profile, status, query, providers, sources } = value;
    if (
      mode !== 'required'
      || !isSearchProfile(profile)
      || !isSearchPipelineStatus(status)
      || (query !== null && typeof query !== 'string')
      || !Array.isArray(providers)
      || providers.some((provider) => !isSearchProvider(provider))
      || !Array.isArray(sources)
    ) {
      return null;
    }

    const normalizedSources = sources
      .map(normalizeSource)
      .filter((source): source is SearchSource => source !== null);

    if (normalizedSources.length !== sources.length) {
      return null;
    }

    return {
      version: 2,
      mode: 'required',
      profile,
      status,
      query,
      providers,
      sources: normalizedSources,
    };
  }

  return null;
}

export function splitTextWithCitations(
  text: string,
  validSourceIds: ReadonlySet<number>
): CitationPart[] {
  if (text.length === 0 || validSourceIds.size === 0) {
    return [{ type: 'text', text }];
  }

  const parts: CitationPart[] = [];
  let lastIndex = 0;

  withCitationMatches(text, ({ citationStart, citationEnd, citationText, sourceId }) => {
    if (!validSourceIds.has(sourceId)) {
      return false;
    }

    if (citationStart > lastIndex) {
      parts.push({
        type: 'text',
        text: text.slice(lastIndex, citationStart),
      });
    }

    parts.push({
      type: 'citation',
      text: citationText,
      sourceId,
    });
    lastIndex = citationEnd;
    return true;
  });

  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      text: text.slice(lastIndex),
    });
  }

  return parts.length > 0 ? parts : [{ type: 'text', text }];
}

export function stripCitationMarkers(
  text: string,
  searchMetadata: PersistedSearchMetadata | null | undefined
) {
  const validSourceIds = getValidSourceIds(searchMetadata);
  if (text.length === 0 || validSourceIds.size === 0) {
    return text;
  }

  let nextText = '';
  let lastIndex = 0;

  withCitationMatches(text, ({ citationStart, citationEnd, sourceId }) => {
    if (!validSourceIds.has(sourceId)) {
      return false;
    }

    nextText += text.slice(lastIndex, citationStart);
    lastIndex = citationEnd;
    return true;
  });

  nextText += text.slice(lastIndex);
  return normalizeCitationWhitespace(nextText);
}

export function stripInvalidCitationMarkers(
  text: string,
  searchMetadata: PersistedSearchMetadata | null | undefined
) {
  const validSourceIds = getValidSourceIds(searchMetadata);
  if (text.length === 0 || validSourceIds.size === 0) {
    return text;
  }

  let nextText = '';
  let lastIndex = 0;

  withCitationMatches(text, ({ citationStart, citationEnd, sourceId }) => {
    if (validSourceIds.has(sourceId)) {
      return true;
    }

    nextText += text.slice(lastIndex, citationStart);
    lastIndex = citationEnd;
    return true;
  });

  nextText += text.slice(lastIndex);
  return normalizeCitationWhitespace(nextText);
}
