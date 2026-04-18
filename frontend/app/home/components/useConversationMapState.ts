"use client";

import { useCallback, useEffect, useState } from 'react';

export interface ConversationMapViewState {
  splitRatio: number;
  cameraX: number;
  cameraY: number;
  zoom: number;
}

interface PersistedMapState {
  viewsByConversation: Record<string, ConversationMapViewState>;
}

const STORAGE_KEY = 'keen-conversation-map-state-v1';
const DEFAULT_VIEW_STATE: ConversationMapViewState = {
  splitRatio: 0.35,
  cameraX: 0,
  cameraY: 0,
  zoom: 1,
};

function clampSplitRatio(value: number) {
  return Math.min(0.75, Math.max(0.25, value));
}

function clampZoom(value: number) {
  return Math.min(1.75, Math.max(0.32, value));
}

function normalizeViewState(value: Partial<ConversationMapViewState> | undefined) {
  if (!value) {
    return DEFAULT_VIEW_STATE;
  }

  return {
    splitRatio: clampSplitRatio(value.splitRatio ?? DEFAULT_VIEW_STATE.splitRatio),
    cameraX:
      typeof value.cameraX === 'number' && Number.isFinite(value.cameraX)
        ? value.cameraX
        : DEFAULT_VIEW_STATE.cameraX,
    cameraY:
      typeof value.cameraY === 'number' && Number.isFinite(value.cameraY)
        ? value.cameraY
        : DEFAULT_VIEW_STATE.cameraY,
    zoom: clampZoom(value.zoom ?? DEFAULT_VIEW_STATE.zoom),
  };
}

export function useConversationMapState(activeConversationKey: string | null) {
  const [viewsByConversation, setViewsByConversation] = useState<
    Record<string, ConversationMapViewState>
  >({});
  const [openByConversation, setOpenByConversation] = useState<Record<string, boolean>>({});
  const [followPausedByConversation, setFollowPausedByConversation] = useState<
    Record<string, boolean>
  >({});
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setHasLoaded(true);
        return;
      }

      const parsed = JSON.parse(stored) as PersistedMapState;
      const nextViews = Object.fromEntries(
        Object.entries(parsed.viewsByConversation ?? {}).map(([key, value]) => [
          key,
          normalizeViewState(value),
        ])
      ) as Record<string, ConversationMapViewState>;

      setViewsByConversation(nextViews);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        viewsByConversation,
      } satisfies PersistedMapState)
    );
  }, [hasLoaded, viewsByConversation]);

  const isOpen =
    activeConversationKey !== null ? openByConversation[activeConversationKey] ?? false : false;
  const viewState =
    activeConversationKey !== null
      ? viewsByConversation[activeConversationKey] ?? DEFAULT_VIEW_STATE
      : DEFAULT_VIEW_STATE;
  const followModePaused =
    activeConversationKey !== null
      ? followPausedByConversation[activeConversationKey] ?? false
      : false;

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (!activeConversationKey) {
        return;
      }

      setOpenByConversation((current) => ({
        ...current,
        [activeConversationKey]: nextOpen,
      }));
    },
    [activeConversationKey]
  );

  const toggleOpen = useCallback(() => {
    if (!activeConversationKey) {
      return;
    }

    setOpenByConversation((current) => ({
      ...current,
      [activeConversationKey]: !(current[activeConversationKey] ?? false),
    }));
  }, [activeConversationKey]);

  const updateViewState = useCallback(
    (patch: Partial<ConversationMapViewState>) => {
      if (!activeConversationKey) {
        return;
      }

      setViewsByConversation((current) => ({
        ...current,
        [activeConversationKey]: normalizeViewState({
          ...(current[activeConversationKey] ?? DEFAULT_VIEW_STATE),
          ...patch,
        }),
      }));
    },
    [activeConversationKey]
  );

  const setFollowModePaused = useCallback(
    (nextPaused: boolean) => {
      if (!activeConversationKey) {
        return;
      }

      setFollowPausedByConversation((current) => ({
        ...current,
        [activeConversationKey]: nextPaused,
      }));
    },
    [activeConversationKey]
  );

  return {
    isOpen,
    viewState,
    followModePaused,
    setOpen,
    toggleOpen,
    updateViewState,
    setFollowModePaused,
    clampSplitRatio,
  };
}
