import { classifySearchQuery } from '@/lib/search/router';
import { rerankSearchCandidates } from '@/lib/search/rerank';
import type { SearchTelemetry } from '@/lib/search/telemetry';
import type {
  SearchPipelineOutput,
  SearchProviderResult,
  SearchRoute,
} from '@/lib/search/types';
import { canonicalizeUrl, extractQueryTokens } from '@/lib/search/provider-utils';
import { searchBrave } from '@/lib/search/providers/brave';
import { searchExa } from '@/lib/search/providers/exa';

const MAX_VISIBLE_SOURCES = 10;
const GENERIC_RELEVANCE_TOKENS = new Set([
  'breaking',
  'current',
  'currently',
  'latest',
  'news',
  'recent',
  'status',
  'today',
  'update',
  'updates',
]);
const ENTERTAINMENT_DOMAINS = [
  'azlyrics.com',
  'genius.com',
  'lyrics.com',
  'musixmatch.com',
  'spotify.com',
  'youtube.com',
  'youtu.be',
  'imdb.com',
];
const ENTERTAINMENT_TERMS = [
  'album',
  'artist',
  'chords',
  'episode',
  'karaoke',
  'lyrics',
  'music',
  'official video',
  'song',
  'soundtrack',
  'stream',
  'trailer',
  'video',
];

function resolveFailureStatus(results: SearchProviderResult[]): SearchPipelineOutput['status'] {
  const statuses = results.map((result) => result.status);

  if (statuses.length > 0 && statuses.every((status) => status === 'missing_config')) {
    return 'missing_config';
  }

  if (statuses.includes('timeout')) {
    return 'timeout';
  }

  if (statuses.includes('upstream_error')) {
    return 'upstream_error';
  }

  return 'no_results';
}

function dedupeCandidates(providerResults: SearchProviderResult[]) {
  const seenUrls = new Set<string>();
  const deduped = [];

  for (const providerResult of providerResults) {
    for (const candidate of providerResult.results) {
      const key = canonicalizeUrl(candidate.url) || candidate.url;
      if (seenUrls.has(key)) {
        continue;
      }

      seenUrls.add(key);
      deduped.push(candidate);
    }
  }

  return deduped;
}

function visibleSourceCount(route: SearchRoute, availableCount: number) {
  if (route.profile === 'research_backed') {
    return Math.min(availableCount, 10);
  }

  if (route.profile === 'official_priority') {
    return Math.min(availableCount, 8);
  }

  return Math.min(availableCount, 10);
}

function importantQueryTokens(query: string) {
  return [...new Set(extractQueryTokens(query))]
    .filter((token) => !GENERIC_RELEVANCE_TOKENS.has(token))
    .slice(0, 8);
}

function resultContainsToken(
  result: Pick<SearchProviderResult['results'][number], 'title' | 'snippet' | 'domain'>,
  token: string
) {
  const haystack = `${result.title} ${result.snippet} ${result.domain}`.toLowerCase();
  return haystack.includes(token);
}

function isEntertainmentResult(
  result: Pick<SearchProviderResult['results'][number], 'title' | 'snippet' | 'domain' | 'sourceType'>
) {
  const domain = result.domain.toLowerCase();
  const haystack = `${result.title} ${result.snippet}`.toLowerCase();

  return (
    result.sourceType === 'video'
    || ENTERTAINMENT_DOMAINS.some((entertainmentDomain) => domain.endsWith(entertainmentDomain))
    || ENTERTAINMENT_TERMS.some((term) => haystack.includes(term))
  );
}

function shouldRetryOffTopicResults(
  route: SearchRoute,
  results: SearchPipelineOutput['results']
) {
  if (route.profile !== 'fresh_web') {
    return false;
  }

  const loweredQuery = route.query.toLowerCase();
  const hasFreshnessIntent =
    Boolean(route.freshness)
    || /\b(breaking|current|currently|latest|news|right now|status|today|update|updates)\b/.test(
      loweredQuery
    );

  if (!hasFreshnessIntent) {
    return false;
  }

  if (results.length === 0) {
    return false;
  }

  const tokens = importantQueryTokens(route.query);
  if (tokens.length < 2) {
    return false;
  }

  const topResults = results.slice(0, 5);
  const relevantCount = topResults.filter((result) =>
    tokens.some((token) => resultContainsToken(result, token))
  ).length;
  const entertainmentCount = topResults.filter(isEntertainmentResult).length;

  return relevantCount <= 1 && entertainmentCount >= Math.ceil(topResults.length / 2);
}

function repairOffTopicQuery(query: string) {
  const repaired = `${query} news current updates -lyrics -song -music -album -video`;
  return repaired.replace(/\s+/g, ' ').trim().slice(0, 280);
}

async function runProviderAttempt({
  route,
  braveSearch,
  exaSearch,
  telemetry,
}: {
  route: SearchRoute;
  braveSearch: (route: SearchRoute) => Promise<SearchProviderResult>;
  exaSearch: (route: SearchRoute) => Promise<SearchProviderResult>;
  telemetry?: SearchTelemetry;
}) {
  const providerTasks = route.providers.map((provider) => {
    const providerStartedAt = Date.now();

    switch (provider) {
      case 'exa':
        return exaSearch(route)
          .then((result) => {
            telemetry?.logProviderFinished({
              provider: result.provider,
              status: result.status,
              attempted: result.metrics?.attempted ?? true,
              durationMs: Date.now() - providerStartedAt,
              httpStatus: result.metrics?.httpStatus ?? null,
              requestedResultCount: result.metrics?.requestedResultCount ?? null,
              usefulResultCount: result.results.length,
              error: result.error,
            });
            return result;
          })
          .catch((error) => {
            telemetry?.logProviderFinished({
              provider,
              status: 'upstream_error',
              attempted: true,
              durationMs: Date.now() - providerStartedAt,
              httpStatus: null,
              requestedResultCount: null,
              usefulResultCount: 0,
              error: error instanceof Error ? error.message : 'Provider request failed',
            });
            throw error;
          });
      case 'brave':
      default:
        return braveSearch(route)
          .then((result) => {
            telemetry?.logProviderFinished({
              provider: result.provider,
              status: result.status,
              attempted: result.metrics?.attempted ?? true,
              durationMs: Date.now() - providerStartedAt,
              httpStatus: result.metrics?.httpStatus ?? null,
              requestedResultCount: result.metrics?.requestedResultCount ?? null,
              usefulResultCount: result.results.length,
              error: result.error,
            });
            return result;
          })
          .catch((error) => {
            telemetry?.logProviderFinished({
              provider,
              status: 'upstream_error',
              attempted: true,
              durationMs: Date.now() - providerStartedAt,
              httpStatus: null,
              requestedResultCount: null,
              usefulResultCount: 0,
              error: error instanceof Error ? error.message : 'Provider request failed',
            });
            throw error;
          });
    }
  });

  const providerResults = await Promise.all(providerTasks);
  const allCandidates = dedupeCandidates(providerResults);
  const ranked = rerankSearchCandidates(allCandidates, route);
  const visibleResults = ranked.slice(0, Math.min(MAX_VISIBLE_SOURCES, visibleSourceCount(route, ranked.length)));
  const outboundRequestCount = providerResults.filter(
    (result) => result.metrics?.attempted ?? true
  ).length;
  const failedProviderCount = providerResults.filter((result) => result.status !== 'success').length;

  return {
    providerResults,
    allCandidates,
    ranked,
    visibleResults,
    outboundRequestCount,
    failedProviderCount,
  };
}

export async function runSearchPipeline(
  query: string,
  dependencies: {
    braveSearch?: (route: SearchRoute) => Promise<SearchProviderResult>;
    exaSearch?: (route: SearchRoute) => Promise<SearchProviderResult>;
    telemetry?: SearchTelemetry;
  } = {}
): Promise<SearchPipelineOutput> {
  const startedAt = Date.now();
  let route = classifySearchQuery(query);
  const braveSearch = dependencies.braveSearch ?? searchBrave;
  const exaSearch = dependencies.exaSearch ?? searchExa;
  const telemetry = dependencies.telemetry;

  telemetry?.logRouteSelected(route);

  let attempt = await runProviderAttempt({
    route,
    braveSearch,
    exaSearch,
    telemetry,
  });

  if (shouldRetryOffTopicResults(route, attempt.visibleResults)) {
    const repairedQuery = repairOffTopicQuery(route.query);
    if (repairedQuery && repairedQuery !== route.query) {
      route = classifySearchQuery(repairedQuery);
      telemetry?.logRouteSelected(route);
      attempt = await runProviderAttempt({
        route,
        braveSearch,
        exaSearch,
        telemetry,
      });
    }
  }

  const {
    providerResults,
    allCandidates,
    ranked,
    visibleResults,
    outboundRequestCount,
    failedProviderCount,
  } = attempt;

  if (visibleResults.length > 0) {
    const output: SearchPipelineOutput = {
      status: failedProviderCount > 0 ? 'partial' : 'success',
      profile: route.profile,
      query: route.query,
      providers: route.providers,
      results: visibleResults.map((candidate) => ({
        title: candidate.title,
        url: candidate.url,
        domain: candidate.domain,
        snippet: candidate.snippet,
        provider: candidate.provider,
        sourceType: candidate.sourceType,
        publishedAt: candidate.publishedAt,
        originatingQuery: candidate.originatingQuery ?? route.query,
        origin: 'fresh',
      })),
      ...(failedProviderCount > 0 ? { error: 'One or more providers failed' } : {}),
    };

    telemetry?.logPipelineCompleted({
      profile: output.profile,
      status: output.status,
      providers: output.providers,
      plannedProviderCount: route.providers.length,
      outboundRequestCount,
      failedProviderCount,
      dedupedCount: allCandidates.length,
      rankedCount: ranked.length,
      visibleCount: visibleResults.length,
      durationMs: Date.now() - startedAt,
      providerSummaries: providerResults.map((result) => ({
        provider: result.provider,
        status: result.status,
        attempted: result.metrics?.attempted ?? true,
        usefulResultCount: result.results.length,
      })),
    });

    return output;
  }

  const output: SearchPipelineOutput = {
    status: resolveFailureStatus(providerResults),
    profile: route.profile,
    query: route.query,
    providers: route.providers,
    results: [],
    error: providerResults.map((result) => result.error).filter(Boolean).join('; ') || undefined,
  };

  telemetry?.logPipelineCompleted({
    profile: output.profile,
    status: output.status,
    providers: output.providers,
    plannedProviderCount: route.providers.length,
    outboundRequestCount,
    failedProviderCount,
    dedupedCount: allCandidates.length,
    rankedCount: ranked.length,
    visibleCount: 0,
    durationMs: Date.now() - startedAt,
    providerSummaries: providerResults.map((result) => ({
      provider: result.provider,
      status: result.status,
      attempted: result.metrics?.attempted ?? true,
      usefulResultCount: result.results.length,
    })),
  });

  return output;
}
