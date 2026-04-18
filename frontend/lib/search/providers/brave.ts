import type { SearchProviderResult, SearchRoute } from '@/lib/search/types';
import {
  freshnessHint,
  getSourceDomain,
  inferSourceType,
  sanitizeText,
  sanitizeUrl,
  sourceAuthorityHint,
} from '@/lib/search/provider-utils';

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  extra_snippets?: string[];
}

const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search';
const MAX_QUERY_LENGTH = 280;
const MAX_SNIPPET_LENGTH = 420;
const MAX_TITLE_LENGTH = 180;

function getResultCount(route: SearchRoute) {
  switch (route.profile) {
    case 'research_backed':
    case 'official_priority':
      return 12;
    case 'fresh_web':
      return 15;
    default:
      return 10;
  }
}

function sanitizeQuery(query: string) {
  return sanitizeText(query, MAX_QUERY_LENGTH);
}

function buildSnippet(result: BraveWebResult) {
  const parts = [
    typeof result.description === 'string' ? result.description : '',
    ...(Array.isArray(result.extra_snippets) ? result.extra_snippets.slice(0, 2) : []),
  ].filter(Boolean);

  return sanitizeText(parts.join(' '), MAX_SNIPPET_LENGTH);
}

export async function searchBrave(route: SearchRoute): Promise<SearchProviderResult> {
  const apiKey = process.env.BRAVE_API_KEY;
  const query = sanitizeQuery(route.query);

  if (!apiKey) {
    return {
      provider: 'brave',
      status: 'missing_config',
      results: [],
      error: 'BRAVE_API_KEY is not configured',
    };
  }

  try {
    const params = new URLSearchParams({
      q: query,
      count: String(getResultCount(route)),
      extra_snippets: 'true',
    });

    if (route.freshness) {
      params.set('freshness', route.freshness);
    }

    const response = await fetch(`${BRAVE_API_URL}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return {
        provider: 'brave',
        status: 'upstream_error',
        results: [],
        error: `Brave search failed (${response.status})`,
      };
    }

    const data = (await response.json()) as {
      web?: { results?: BraveWebResult[] };
    };
    const results = (data.web?.results || [])
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
          provider: 'brave' as const,
          sourceType,
          publishedAt: result.age || null,
          authorityScoreHint: sourceAuthorityHint(sourceType),
          freshnessScoreHint: freshnessHint(result.age),
        };
      })
      .filter((result): result is NonNullable<typeof result> => result !== null);

    if (results.length === 0) {
      return {
        provider: 'brave',
        status: 'no_results',
        results: [],
        error: 'Brave returned no useful results',
      };
    }

    return {
      provider: 'brave',
      status: 'success',
      results,
      error: null,
    };
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    return {
      provider: 'brave',
      status: errorName === 'TimeoutError' || errorName === 'AbortError'
        ? 'timeout'
        : 'upstream_error',
      results: [],
      error: error instanceof Error ? error.message : 'Brave search unavailable',
    };
  }
}
