'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ViewerIdentity {
  id: string;
  email: string | null;
  fullName: string | null;
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
          .select('full_name')
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
