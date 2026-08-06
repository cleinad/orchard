import 'server-only';

import { cache } from 'react';
import type { ChatModelListItem } from '@/lib/chat-models';
import { getChatModelListItems } from '@/lib/models';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getViewerIdentity } from '@/lib/viewer-server';
import {
  mapConversationSummary,
  type ConversationSummaryRow,
  type HomeNavigationData,
} from '@/app/home/components/homeSidebarData';
import { mapWorkspaceSummary, type WorkspaceSummary } from '@/lib/workspaces';
import type { MentorListItem } from '@/lib/mentors/types';

export interface HomeBootstrapData {
  navigation: HomeNavigationData;
  chatModels: ChatModelListItem[];
}

export const getHomeBootstrap = cache(async (): Promise<HomeBootstrapData> => {
  const viewer = await getViewerIdentity();
  if (!viewer) {
    throw new Error('Authenticated viewer is unavailable');
  }
  const userId = viewer.id;
  const supabase = await createSupabaseServerClient();

  const [mentorResult, workspaceResult, conversationResult] = await Promise.all([
    supabase
      .from('mentors')
      .select(
        'id, slug, name, tagline, description, is_builtin, accent_color, avatar_url'
      )
      .eq('user_id', userId)
      .order('name', { ascending: true }),
    supabase
      .from('workspaces')
      .select('id, name, description, icon, accent_color, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(100),
    supabase
      .from('conversations')
      .select('id, title, mentor_id, workspace_id, updated_at, created_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(200),
  ]);

  if (mentorResult.error) {
    throw new Error(`Failed to load mentor summaries: ${mentorResult.error.message}`);
  }
  if (workspaceResult.error) {
    throw new Error(
      `Failed to load workspace summaries: ${workspaceResult.error.message}`
    );
  }
  if (conversationResult.error) {
    throw new Error(
      `Failed to load conversation summaries: ${conversationResult.error.message}`
    );
  }

  const mentors = (mentorResult.data ?? []) as MentorListItem[];
  const workspaces = ((workspaceResult.data ?? []) as WorkspaceSummary[]).map(
    mapWorkspaceSummary
  );
  const conversations = (
    (conversationResult.data ?? []) as ConversationSummaryRow[]
  ).map((row) => mapConversationSummary(row, mentors, workspaces));

  return {
    navigation: {
      mentors,
      workspaces,
      conversations,
    },
    chatModels: getChatModelListItems(),
  };
});
