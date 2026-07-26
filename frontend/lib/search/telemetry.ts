import { createHash } from 'node:crypto';
import type { SearchMode } from '@/lib/chat-search';
import type {
  SearchPipelineOutput,
  SearchPipelineStatus,
  SearchProvider,
  SearchProviderResult,
  SearchRoute,
} from '@/lib/search/types';

const MAX_QUERY_PREVIEW_LENGTH = 120;

type SearchTelemetryLogger = Pick<Console, 'error' | 'info'>;

export interface SearchTelemetry {
  logRequestStarted(details: { searchMode: SearchMode }): void;
  logRouteSelected(route: SearchRoute): void;
  logProviderFinished(details: {
    provider: SearchProvider;
    status: SearchProviderResult['status'];
    attempted: boolean;
    durationMs: number;
    httpStatus: number | null;
    requestedResultCount: number | null;
    usefulResultCount: number;
    error?: string | null;
  }): void;
  logPipelineCompleted(details: {
    profile: SearchPipelineOutput['profile'];
    status: SearchPipelineStatus;
    providers: SearchPipelineOutput['providers'];
    plannedProviderCount: number;
    outboundRequestCount: number;
    failedProviderCount: number;
    dedupedCount: number;
    rankedCount: number;
    visibleCount: number;
    durationMs: number;
    providerSummaries: Array<{
      provider: SearchProvider;
      status: SearchProviderResult['status'];
      attempted: boolean;
      usefulResultCount: number;
    }>;
  }): void;
  logPipelineFailed(details: {
    durationMs: number;
    error: unknown;
  }): void;
}

function sanitizeQueryPreview(query: string) {
  return query.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_PREVIEW_LENGTH);
}

function hashSearchQuery(query: string) {
  return createHash('sha256')
    .update(query.replace(/\s+/g, ' ').trim())
    .digest('hex')
    .slice(0, 16);
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown search error';
}

function isDevelopment() {
  return process.env.NODE_ENV !== 'production';
}

export function createSearchTelemetry(
  {
    traceId,
    conversationId,
    query,
    redactQuery = false,
    logger = console,
  }: {
    traceId: string;
    conversationId: string | null;
    query: string;
    redactQuery?: boolean;
    logger?: SearchTelemetryLogger;
  }
): SearchTelemetry {
  const queryHash = redactQuery ? null : hashSearchQuery(query);
  const queryPreview = !redactQuery && isDevelopment() ? sanitizeQueryPreview(query) : '';

  const emit = (
    level: 'error' | 'info',
    event: string,
    payload: Record<string, unknown>
  ) => {
    logger[level]('[search]', {
      scope: 'search',
      event,
      timestamp: new Date().toISOString(),
      traceId,
      conversationId,
      ...(queryHash ? { queryHash } : {}),
      ...(queryPreview ? { queryPreview } : {}),
      ...payload,
    });
  };

  return {
    logRequestStarted(details) {
      emit('info', 'search.request_started', details);
    },
    logRouteSelected(route) {
      emit('info', 'search.route_selected', {
        profile: route.profile,
        providers: route.providers,
        providerRequestCount: route.providers.length,
        freshness: route.freshness || null,
        preferOfficial: route.preferOfficial,
        allowSocial: route.allowSocial,
        exaCategory: route.exaCategory,
      });
    },
    logProviderFinished(details) {
      emit('info', 'search.provider_finished', {
        provider: details.provider,
        status: details.status,
        attempted: details.attempted,
        durationMs: details.durationMs,
        httpStatus: details.httpStatus,
        requestedResultCount: details.requestedResultCount,
        usefulResultCount: details.usefulResultCount,
        ...(!redactQuery && details.error ? { error: details.error } : {}),
      });
    },
    logPipelineCompleted(details) {
      emit('info', 'search.pipeline_completed', details);
    },
    logPipelineFailed(details) {
      emit('error', 'search.pipeline_failed', {
        durationMs: details.durationMs,
        error: redactQuery
          ? details.error instanceof Error ? details.error.name : 'redacted_error'
          : formatError(details.error),
      });
    },
  };
}
