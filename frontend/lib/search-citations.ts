import type { WebSearchToolOutput } from '@/lib/tools';

export const SEARCH_MODES = ['auto', 'required'] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export const SEARCH_ATTEMPT_STATUSES = [
  'success',
  'no_results',
  'missing_config',
  'timeout',
  'upstream_error',
] as const;
export type SearchAttemptStatus = (typeof SEARCH_ATTEMPT_STATUSES)[number];

export interface SearchSource {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
}

export interface PersistedSearchMetadata {
  version: 1;
  mode: SearchMode;
  status: SearchAttemptStatus;
  query: string | null;
  sources: SearchSource[];
}

export type CitationPart =
  | { type: 'text'; text: string }
  | { type: 'citation'; text: string; sourceId: number };

const MAX_PERSISTED_SOURCES = 3;
const MAX_PERSISTED_SNIPPET_LENGTH = 220;
const CITATION_PATTERN = /(^|[\s(])\[(\d+)\](?=$|[\s).,;:!?])/g;

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

function isSearchMode(value: unknown): value is SearchMode {
  return typeof value === 'string' && SEARCH_MODES.includes(value as SearchMode);
}

function isSearchAttemptStatus(value: unknown): value is SearchAttemptStatus {
  return (
    typeof value === 'string'
    && SEARCH_ATTEMPT_STATUSES.includes(value as SearchAttemptStatus)
  );
}

function normalizeSource(source: unknown): SearchSource | null {
  if (!isRecord(source)) {
    return null;
  }

  const { id, title, url, domain, snippet } = source;
  if (
    !Number.isInteger(id)
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

  return {
    id,
    title,
    url,
    domain,
    snippet,
  };
}

function withCitationMatches(
  text: string,
  iteratee: (match: {
    prefix: string;
    sourceId: number;
    citationStart: number;
    citationEnd: number;
    citationText: string;
  }) => void
) {
  CITATION_PATTERN.lastIndex = 0;

  for (const match of text.matchAll(CITATION_PATTERN)) {
    const prefix = match[1] ?? '';
    const sourceId = Number(match[2]);
    const matchStart = match.index ?? 0;
    const citationStart = matchStart + prefix.length;
    const citationText = `[${sourceId}]`;
    const citationEnd = citationStart + citationText.length;

    iteratee({
      prefix,
      sourceId,
      citationStart,
      citationEnd,
      citationText,
    });
  }
}

function normalizeCitationWhitespace(text: string) {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:!?])/g, '$1')
    .trimEnd();
}

function getValidSourceIds(searchMetadata: PersistedSearchMetadata | null | undefined) {
  if (!searchMetadata || searchMetadata.status !== 'success') {
    return new Set<number>();
  }

  return new Set(searchMetadata.sources.map((source) => source.id));
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
  searchMode: SearchMode,
  output: WebSearchToolOutput
): PersistedSearchMetadata {
  const sources: SearchSource[] = [];
  const seenUrls = new Set<string>();

  if (output.status === 'success') {
    for (const result of output.results) {
      if (seenUrls.has(result.url)) {
        continue;
      }

      seenUrls.add(result.url);
      sources.push({
        id: sources.length + 1,
        title: result.title,
        url: result.url,
        domain: getSourceDomain(result.url),
        snippet: truncateText(result.snippet, MAX_PERSISTED_SNIPPET_LENGTH),
      });

      if (sources.length >= MAX_PERSISTED_SOURCES) {
        break;
      }
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

export function parsePersistedSearchMetadata(
  value: unknown
): PersistedSearchMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const { version, mode, status, query, sources } = value;
  if (
    version !== 1
    || !isSearchMode(mode)
    || !isSearchAttemptStatus(status)
    || (query !== null && typeof query !== 'string')
    || !Array.isArray(sources)
  ) {
    return null;
  }

  const normalizedSources = sources.map(normalizeSource);
  if (normalizedSources.some((source) => source === null)) {
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
      return;
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
      return;
    }

    nextText += text.slice(lastIndex, citationStart);
    lastIndex = citationEnd;
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
      return;
    }

    nextText += text.slice(lastIndex, citationStart);
    lastIndex = citationEnd;
  });

  nextText += text.slice(lastIndex);
  return normalizeCitationWhitespace(nextText);
}
