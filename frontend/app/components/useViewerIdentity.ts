'use client';

import { useEffect, useState } from 'react';
import { sanitizeGlobalInstructions } from '@/lib/global-instructions';
import { supabase } from '@/lib/supabase';

export interface ViewerIdentity {
  id: string;
  email: string | null;
  fullName: string | null;
  globalInstructions: string;
}

export function useViewerIdentity() {
  const [viewer, setViewer] = useState<ViewerIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    async function loadViewerIdentity() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          if (!isCancelled) {
            setViewer(null);
          }
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, global_instructions')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (!isCancelled) {
          setViewer({
            id: user.id,
            email: user.email ?? null,
            fullName: profile?.full_name?.trim() || null,
            globalInstructions: sanitizeGlobalInstructions(
              profile?.global_instructions
            ),
          });
        }
      } catch (error) {
        console.error('Failed to load viewer identity:', error);
        if (!isCancelled) {
          setViewer(null);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    void loadViewerIdentity();

    return () => {
      isCancelled = true;
    };
  }, []);

  return {
    viewer,
    loading,
  };
}
