import 'server-only';

import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export interface VerifiedViewerIdentity {
  id: string;
  email: string | null;
}

export const getViewerIdentity = cache(
  async (): Promise<VerifiedViewerIdentity | null> => {
    const supabase = await createSupabaseServerClient();

    let claimsResult;
    try {
      claimsResult = await supabase.auth.getClaims();
    } catch {
      return process.env.KEEN_E2E_BYPASS_AUTH === '1'
        ? { id: 'e2e-bypass-user', email: null }
        : null;
    }

    const claims = claimsResult.data?.claims;
    const userId = claims?.sub;
    const emailClaim = claims?.email;
    const validEmail =
      emailClaim === undefined
      || emailClaim === null
      || typeof emailClaim === 'string';

    if (
      claimsResult.error
      || typeof userId !== 'string'
      || userId.length === 0
      || !validEmail
    ) {
      return process.env.KEEN_E2E_BYPASS_AUTH === '1'
        ? { id: 'e2e-bypass-user', email: null }
        : null;
    }

    return {
      id: userId,
      email: typeof emailClaim === 'string' ? emailClaim : null,
    };
  }
);
