import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getViewerIdentity } from '@/lib/viewer-server';
import { mapWorkspaceRow, type WorkspaceDetail } from '@/lib/workspaces';

export const getWorkspaceDetail = cache(
  async (workspaceId: string): Promise<WorkspaceDetail | null> => {
    const viewer = await getViewerIdentity();
    if (!viewer) {
      redirect('/login');
    }
    const userId = viewer.id;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('workspaces')
      .select(
        'id, name, description, context, icon, accent_color, created_at, updated_at'
      )
      .eq('id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load workspace: ${error.message}`);
    }

    return data ? mapWorkspaceRow(data as WorkspaceDetail) : null;
  }
);
