import { tool } from 'ai';
import { z } from 'zod';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

const MAX_RESULTS = 5;
const MAX_QUERY_LENGTH = 280;
const MAX_SNIPPET_LENGTH = 320;
const MAX_TITLE_LENGTH = 140;

const webSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
});

const webSearchOutputSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    query: z.string(),
    results: z.array(webSearchResultSchema).min(1),
  }),
  z.object({
    status: z.literal('no_results'),
    query: z.string(),
    results: z.array(webSearchResultSchema).length(0),
    error: z.string(),
  }),
  z.object({
    status: z.literal('missing_config'),
    query: z.string(),
    results: z.array(webSearchResultSchema).length(0),
    error: z.string(),
  }),
  z.object({
    status: z.literal('timeout'),
    query: z.string(),
    results: z.array(webSearchResultSchema).length(0),
    error: z.string(),
  }),
  z.object({
    status: z.literal('upstream_error'),
    query: z.string(),
    results: z.array(webSearchResultSchema).length(0),
    error: z.string(),
  }),
]);

export type WebSearchToolOutput = z.infer<typeof webSearchOutputSchema>;

function sanitizeText(value: string, maxLength: number): string {
  const normalized = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function sanitizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeQuery(value: string): string {
  return sanitizeText(value, MAX_QUERY_LENGTH);
}

function sanitizeResults(results: TavilyResult[]) {
  return results
    .slice(0, MAX_RESULTS)
    .map((result) => {
      const url = sanitizeUrl(result.url);
      if (!url) {
        return null;
      }

      const title = sanitizeText(result.title || url, MAX_TITLE_LENGTH);
      const snippet = sanitizeText(result.content || '', MAX_SNIPPET_LENGTH);

      if (!title || !snippet) {
        return null;
      }

      return { title, url, snippet };
    })
    .filter((result): result is NonNullable<typeof result> => result !== null);
}

export const webSearch = tool({
  description:
    'Search the web for current information. Use when you need up-to-date facts, recent events, or information you are unsure about.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
  }),
  outputSchema: webSearchOutputSchema,
  execute: async ({ query }) => {
    const sanitizedQuery = sanitizeQuery(query);
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      console.warn('[webSearch] missing_config', { query: sanitizedQuery });
      return {
        status: 'missing_config',
        query: sanitizedQuery,
        results: [],
        error: 'TAVILY_API_KEY is not configured',
      };
    }

    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query: sanitizedQuery,
          max_results: MAX_RESULTS,
          include_answer: false,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const responseBody = await res.text().catch(() => '');
        console.error('[webSearch] upstream_error', {
          query: sanitizedQuery,
          status: res.status,
          body: sanitizeText(responseBody, 200),
        });
        return {
          status: 'upstream_error',
          query: sanitizedQuery,
          results: [],
          error: `Search failed (${res.status})`,
        };
      }

      const data = await res.json();
      const results = sanitizeResults((data.results as TavilyResult[]) ?? []);

      if (results.length === 0) {
        console.warn('[webSearch] no_results', { query: sanitizedQuery });
        return {
          status: 'no_results',
          query: sanitizedQuery,
          results: [],
          error: 'Search returned no useful results',
        };
      }

      return {
        status: 'success',
        query: sanitizedQuery,
        results,
      };
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      const errorMessage =
        error instanceof Error ? sanitizeText(error.message, 200) : 'Unknown error';
      const status =
        errorName === 'TimeoutError' || errorName === 'AbortError'
          ? 'timeout'
          : 'upstream_error';

      console.error(`[webSearch] ${status}`, {
        query: sanitizedQuery,
        name: errorName,
        message: errorMessage,
      });

      return {
        status,
        query: sanitizedQuery,
        results: [],
        error:
          status === 'timeout'
            ? 'Search timed out'
            : 'Web search unavailable',
      };
    }
  },
});
