'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SettingsViewerResult } from '@/app/settings/types';

interface ViewerContextValue {
  viewerResult: SettingsViewerResult;
  updateGlobalInstructions: (value: string) => void;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function ViewerProvider({
  children,
  initialViewerResult,
}: {
  children: ReactNode;
  initialViewerResult: SettingsViewerResult;
}) {
  const [viewerResult, setViewerResult] =
    useState<SettingsViewerResult>(initialViewerResult);

  useEffect(() => {
    setViewerResult(initialViewerResult);
  }, [initialViewerResult]);

  const updateGlobalInstructions = useCallback((value: string) => {
    setViewerResult((current) =>
      current.status === 'ready'
        ? {
            status: 'ready',
            viewer: {
              ...current.viewer,
              globalInstructions: value,
            },
          }
        : current
    );
  }, []);

  const value = useMemo(
    () => ({
      viewerResult,
      updateGlobalInstructions,
    }),
    [updateGlobalInstructions, viewerResult]
  );

  return (
    <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
  );
}

export function useViewer() {
  const value = useContext(ViewerContext);
  if (!value) {
    throw new Error('useViewer must be used within ViewerProvider');
  }
  return value;
}

export function useOptionalViewer() {
  return useContext(ViewerContext);
}
