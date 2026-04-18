import { classifySearchQuery } from '@/lib/search/router';
import { rerankSearchCandidates } from '@/lib/search/rerank';
import type { SearchTelemetry } from '@/lib/search/telemetry';
import type {
  SearchPipelineOutput,
  SearchProviderResult,
  SearchRoute,
} from '@/lib/search/types';
import { canonicalizeUrl } from '@/lib/search/provider-utils';
import { searchBrave } from '@/lib/search/providers/brave';
import { searchExa } from '@/lib/search/providers/exa';

const MAX_VISIBLE_SOURCES = 10;

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

export async function runSearchPipeline(
  query: string,
  dependencies: {
    braveSearch?: (route: SearchRoute) => Promise<SearchProviderResult>;
    exaSearch?: (route: SearchRoute) => Promise<SearchProviderResult>;
    telemetry?: SearchTelemetry;
  } = {}
): Promise<SearchPipelineOutput> {
  const startedAt = Date.now();
  const route = classifySearchQuery(query);
  const braveSearch = dependencies.braveSearch ?? searchBrave;
  const exaSearch = dependencies.exaSearch ?? searchExa;
  const telemetry = dependencies.telemetry;

  telemetry?.logRouteSelected(route);

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
