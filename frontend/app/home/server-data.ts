import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { ChatModelListItem } from '@/lib/chat-models';
import { getChatModelListItems } from '@/lib/models';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getViewerIdentity } from '@/lib/viewer-server';
import {
  mapConversationSummary,
  type ConversationSummaryRow,
  type HomeDataUnavailableReason,
  type HomeNavigationData,
  type HomeNavigationStatus,
  type HomeResourceStatus,
} from '@/app/home/components/homeSidebarData';
import { mapWorkspaceSummary, type WorkspaceSummary } from '@/lib/workspaces';
import type { MentorListItem } from '@/lib/mentors/types';
import {
  loadCompleteConversationTranscript,
  TranscriptLoadError,
} from '@/app/home/components/conversationTranscriptData';
import {
  serializeConversationTranscript,
  type HomeConversationInitialData,
} from '@/app/home/components/homeConversationInitialData';

const HOME_NAVIGATION_TIMEOUT_MS = 2_000;
const HOME_TRANSCRIPT_TIMEOUT_MS = 4_000;

export interface HomeBootstrapData {
  navigation: HomeNavigationData;
  navigationStatus: HomeNavigationStatus;
  chatModels: ChatModelListItem[];
}

export type HomeConversationInitialResult =
  | { status: 'ready'; data: HomeConversationInitialData }
  | { status: 'not-found' }
  | { status: 'unauthorized' }
  | {
      status: 'unavailable';
      reason: HomeDataUnavailableReason;
    };

interface QueryResult<T> {
  data: T[] | null;
  error: unknown;
}

interface NavigationResourceResult<T> {
  data: T[];
  status: HomeResourceStatus;
}

function recordHomeDataFailure(
  routeClass: 'navigation' | 'transcript',
  resource: string,
  reason: HomeDataUnavailableReason,
  durationMs: number
) {
  console.warn('[home-data]', {
    routeClass,
    resource,
    status: 'unavailable',
    reason,
    durationMs,
  });
}

async function loadNavigationResource<T>(
  resource: keyof HomeNavigationStatus,
  query: (signal: AbortSignal) => PromiseLike<QueryResult<T>>
): Promise<NavigationResourceResult<T>> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    HOME_NAVIGATION_TIMEOUT_MS
  );

  try {
    const result = await query(controller.signal);
    if (controller.signal.aborted) {
      recordHomeDataFailure(
        'navigation',
        resource,
        'timeout',
        Date.now() - startedAt
      );
      return {
        data: [],
        status: { status: 'unavailable', reason: 'timeout' },
      };
    }
    if (result.error) {
      recordHomeDataFailure(
        'navigation',
        resource,
        'error',
        Date.now() - startedAt
      );
      return {
        data: [],
        status: { status: 'unavailable', reason: 'error' },
      };
    }
    return {
      data: result.data ?? [],
      status: { status: 'ready' },
    };
  } catch {
    const reason = controller.signal.aborted ? 'timeout' : 'error';
    recordHomeDataFailure(
      'navigation',
      resource,
      reason,
      Date.now() - startedAt
    );
    return {
      data: [],
      status: { status: 'unavailable', reason },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const getHomeBootstrap = cache(async (): Promise<HomeBootstrapData> => {
  const viewer = await getViewerIdentity();
  if (!viewer) {
    redirect('/login?redirect=%2Fhome');
  }
  const userId = viewer.id;
  const supabase = await createSupabaseServerClient();

  const [mentorResult, workspaceResult, conversationResult] = await Promise.all([
    loadNavigationResource<MentorListItem>('mentors', (signal) =>
      supabase
        .from('mentors')
        .select(
          'id, slug, name, tagline, description, is_builtin, accent_color, avatar_url'
        )
        .eq('user_id', userId)
        .order('name', { ascending: true })
        .abortSignal(signal)
    ),
    loadNavigationResource<WorkspaceSummary>('workspaces', (signal) =>
      supabase
        .from('workspaces')
        .select('id, name, description, icon, accent_color, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(100)
        .abortSignal(signal)
    ),
    loadNavigationResource<ConversationSummaryRow>('conversations', (signal) =>
      supabase
        .from('conversations')
        .select('id, title, mentor_id, workspace_id, updated_at, created_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(200)
        .abortSignal(signal)
    ),
  ]);

  const mentors = mentorResult.data;
  const workspaces = workspaceResult.data.map(
    mapWorkspaceSummary
  );
  const conversations = conversationResult.data.map((row) =>
    mapConversationSummary(row, mentors, workspaces)
  );

  return {
    navigation: {
      mentors,
      workspaces,
      conversations,
    },
    navigationStatus: {
      mentors: mentorResult.status,
      workspaces: workspaceResult.status,
      conversations: conversationResult.status,
    },
    chatModels: getChatModelListItems(),
  };
});

export const getHomeConversationInitialData = cache(
  async (
    conversationId: string
  ): Promise<HomeConversationInitialResult> => {
    const viewer = await getViewerIdentity();
    if (!viewer) {
      return { status: 'unauthorized' };
    }

    const supabase = await createSupabaseServerClient();
    const transcriptController = new AbortController();
    const transcriptStartedAt = Date.now();
    const transcriptTimeout = setTimeout(
      () => transcriptController.abort(),
      HOME_TRANSCRIPT_TIMEOUT_MS
    );

    try {
      const [bootstrapResult, transcriptResult] = await Promise.allSettled([
        getHomeBootstrap(),
        loadCompleteConversationTranscript(supabase, conversationId, {
          signal: transcriptController.signal,
          optionalMetadataTimeoutMs: 2_000,
        }),
      ]);
      const bootstrap =
        bootstrapResult.status === 'fulfilled' ? bootstrapResult.value : null;
      let conversation =
        bootstrap?.navigation.conversations.find(
          (entry) => entry.id === conversationId
        ) ?? null;

      if (!conversation) {
        const remainingDetailTimeMs =
          HOME_TRANSCRIPT_TIMEOUT_MS - (Date.now() - transcriptStartedAt);
        if (remainingDetailTimeMs <= 0) {
          return { status: 'unavailable', reason: 'timeout' };
        }
        const detailController = new AbortController();
        const detailTimeout = setTimeout(
          () => detailController.abort(),
          remainingDetailTimeMs
        );
        try {
          const { data, error } = await supabase
            .from('conversations')
            .select('id, title, mentor_id, workspace_id, updated_at, created_at')
            .eq('user_id', viewer.id)
            .eq('id', conversationId)
            .abortSignal(detailController.signal)
            .maybeSingle();

          if (detailController.signal.aborted) {
            return { status: 'unavailable', reason: 'timeout' };
          }
          if (error) {
            return { status: 'unavailable', reason: 'error' };
          }
          if (!data) {
            return { status: 'not-found' };
          }

          conversation = mapConversationSummary(
            data as ConversationSummaryRow,
            bootstrap?.navigation.mentors ?? [],
            bootstrap?.navigation.workspaces ?? []
          );
        } catch {
          return {
            status: 'unavailable',
            reason: detailController.signal.aborted ? 'timeout' : 'error',
          };
        } finally {
          clearTimeout(detailTimeout);
        }
      }

      if (transcriptResult.status === 'rejected') {
        const reason =
          transcriptResult.reason instanceof TranscriptLoadError
            ? transcriptResult.reason.reason
            : transcriptController.signal.aborted
              ? 'timeout'
              : 'error';
        recordHomeDataFailure(
          'transcript',
          'messages',
          reason,
          Date.now() - transcriptStartedAt
        );
        return { status: 'unavailable', reason };
      }

      return {
        status: 'ready',
        data: {
          conversation,
          transcript: serializeConversationTranscript(transcriptResult.value),
        },
      };
    } finally {
      clearTimeout(transcriptTimeout);
    }
  }
);
