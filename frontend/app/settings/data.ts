import 'server-only';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { sanitizeGlobalInstructions } from '@/lib/global-instructions';
import type {
  MinimalSettingsViewer,
  SettingsViewerResult,
} from '@/app/settings/types';

const PROFILE_TIMEOUT_MS = 2_000;

function redirectToLogin(): never {
  redirect('/login?redirect=%2Fsettings');
}

export async function getSettingsViewer(): Promise<SettingsViewerResult> {
  const supabase = await createSupabaseServerClient();

  let claimsResult;
  try {
    claimsResult = await supabase.auth.getClaims();
  } catch {
    redirectToLogin();
  }

  const claims = claimsResult.data?.claims;
  const userId = claims?.sub;
  const emailClaim = claims?.email;

  if (
    claimsResult.error
    || typeof userId !== 'string'
    || userId.length === 0
    || (
      emailClaim !== undefined
      && emailClaim !== null
      && typeof emailClaim !== 'string'
    )
  ) {
    redirectToLogin();
  }

  const viewer: MinimalSettingsViewer = {
    id: userId,
    email: typeof emailClaim === 'string' ? emailClaim : null,
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('full_name, global_instructions')
      .eq('id', userId)
      .abortSignal(controller.signal)
      .maybeSingle();

    if (controller.signal.aborted) {
      return {
        status: 'profile-unavailable',
        reason: 'timeout',
        viewer,
      };
    }

    if (error) {
      return {
        status: 'profile-unavailable',
        reason: 'error',
        viewer,
      };
    }

    if (!profile) {
      return { status: 'profile-missing', viewer };
    }

    return {
      status: 'ready',
      viewer: {
        ...viewer,
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
      viewer,
    };
  } finally {
    clearTimeout(timeout);
  }
}
