import type { SearchProviderResult, SearchRoute } from '@/lib/search/types';
import {
  freshnessHint,
  getSourceDomain,
  inferSourceType,
  sanitizeText,
  sanitizeUrl,
  sourceAuthorityHint,
} from '@/lib/search/provider-utils';

interface ExaSearchResult {
  title?: string;
  url?: string;
  publishedDate?: string;
  highlights?: string[];
  text?: string;
  summary?: string;
}

const EXA_API_URL = 'https://api.exa.ai/search';
const MAX_QUERY_LENGTH = 280;
const MAX_SNIPPET_LENGTH = 420;
const MAX_TITLE_LENGTH = 180;

function getResultCount(route: SearchRoute) {
  switch (route.profile) {
    case 'research_backed':
      return 10;
    case 'official_priority':
      return 8;
    default:
      return 6;
  }
}

function sanitizeQuery(query: string) {
  return sanitizeText(query, MAX_QUERY_LENGTH);
}

function buildStartPublishedDate(freshness: SearchRoute['freshness']) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  switch (freshness) {
    case 'pd':
      return new Date(now - day).toISOString();
    case 'pw':
      return new Date(now - 7 * day).toISOString();
    case 'pm':
      return new Date(now - 31 * day).toISOString();
    case 'py':
      return new Date(now - 365 * day).toISOString();
    default:
      return undefined;
  }
}

function buildSnippet(result: ExaSearchResult) {
  const parts = [
    ...(Array.isArray(result.highlights) ? result.highlights.slice(0, 2) : []),
    typeof result.summary === 'string' ? result.summary : '',
    typeof result.text === 'string' ? result.text.slice(0, MAX_SNIPPET_LENGTH) : '',
  ].filter(Boolean);

  return sanitizeText(parts.join(' '), MAX_SNIPPET_LENGTH);
}

export async function searchExa(route: SearchRoute): Promise<SearchProviderResult> {
  const apiKey = process.env.EXA_API_KEY;
  const query = sanitizeQuery(route.query);
  const requestedResultCount = getResultCount(route);

  if (!apiKey) {
    return {
      provider: 'exa',
      status: 'missing_config',
      results: [],
      error: 'EXA_API_KEY is not configured',
      metrics: {
        attempted: false,
        httpStatus: null,
        requestedResultCount,
      },
    };
  }

  try {
    const response = await fetch(EXA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query,
        type: 'auto',
        numResults: requestedResultCount,
        ...(route.exaCategory ? { category: route.exaCategory } : {}),
        ...(buildStartPublishedDate(route.freshness)
          ? { startPublishedDate: buildStartPublishedDate(route.freshness) }
          : {}),
        contents: {
          highlights: {
            query,
            maxCharacters: 1200,
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return {
        provider: 'exa',
        status: 'upstream_error',
        results: [],
        error: `Exa search failed (${response.status})`,
        metrics: {
          attempted: true,
          httpStatus: response.status,
          requestedResultCount,
        },
      };
    }

    const data = (await response.json()) as {
      results?: ExaSearchResult[];
    };
    const results = (data.results || [])
      .map((result) => {
        const url = typeof result.url === 'string' ? sanitizeUrl(result.url) : null;
        const title = sanitizeText(result.title || url || '', MAX_TITLE_LENGTH);
        const snippet = buildSnippet(result);

        if (!url || !title || !snippet) {
          return null;
        }

        const domain = getSourceDomain(url);
        const sourceType = inferSourceType(query, url, title, snippet);

        return {
          title,
          url,
          domain,
          snippet,
          provider: 'exa' as const,
          sourceType,
          publishedAt: result.publishedDate || null,
          authorityScoreHint: sourceAuthorityHint(sourceType),
          freshnessScoreHint: freshnessHint(result.publishedDate),
        };
      })
      .filter((result): result is NonNullable<typeof result> => result !== null);

    if (results.length === 0) {
      return {
        provider: 'exa',
        status: 'no_results',
        results: [],
        error: 'Exa returned no useful results',
        metrics: {
          attempted: true,
          httpStatus: response.status,
          requestedResultCount,
        },
      };
    }

    return {
      provider: 'exa',
      status: 'success',
      results,
      error: null,
      metrics: {
        attempted: true,
        httpStatus: response.status,
        requestedResultCount,
      },
    };
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    return {
      provider: 'exa',
      status: errorName === 'TimeoutError' || errorName === 'AbortError'
        ? 'timeout'
        : 'upstream_error',
      results: [],
      error: error instanceof Error ? error.message : 'Exa search unavailable',
      metrics: {
        attempted: true,
        httpStatus: null,
        requestedResultCount,
      },
    };
  }
}
