import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getViewerIdentity } from '@/lib/viewer-server';
import { sanitizeGlobalInstructions } from '@/lib/global-instructions';
import type {
  MinimalSettingsViewer,
  SettingsViewerResult,
} from '@/app/settings/types';

const PROFILE_TIMEOUT_MS = 2_000;

function redirectToLogin(): never {
  redirect('/login?redirect=%2Fsettings');
}

const loadSettingsViewer = cache(async (): Promise<SettingsViewerResult> => {
  const viewer = await getViewerIdentity();
  if (!viewer) {
    redirectToLogin();
  }

  const supabase = await createSupabaseServerClient();
  const minimalViewer: MinimalSettingsViewer = viewer;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('full_name, global_instructions')
      .eq('id', viewer.id)
      .abortSignal(controller.signal)
      .maybeSingle();

    if (controller.signal.aborted) {
      return {
        status: 'profile-unavailable',
        reason: 'timeout',
        viewer: minimalViewer,
      };
    }

    if (error) {
      return {
        status: 'profile-unavailable',
        reason: 'error',
        viewer: minimalViewer,
      };
    }

    if (!profile) {
      return { status: 'profile-missing', viewer: minimalViewer };
    }

    return {
      status: 'ready',
      viewer: {
        ...minimalViewer,
        fullName:
          typeof profile.full_name === 'string'
            ? profile.full_name.trim() || null
            : null,
        globalInstructions: sanitizeGlobalInstructions(
          profile.global_instructions
        ),
      },
    };
  } catch {
    return {
      status: 'profile-unavailable',
      reason: controller.signal.aborted ? 'timeout' : 'error',
      viewer: minimalViewer,
    };
  } finally {
    clearTimeout(timeout);
  }
});

export function getSettingsViewer(): Promise<SettingsViewerResult> {
  return loadSettingsViewer();
}
