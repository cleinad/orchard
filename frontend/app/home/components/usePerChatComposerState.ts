"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SelectedChat } from '@/app/home/components/HomeDataContext';
import {
  deleteRecordKey,
  getComposerStateKey,
} from '@/app/home/components/homeSelection';
import type { SearchMetadata, SearchMode } from '@/lib/chat-search';

interface UsePerChatComposerStateParams {
  storageKey: string;
  selection: SelectedChat | null;
}

const searchModesSessionStore: Record<string, SearchMode> = {};

export function usePerChatComposerState({
  storageKey,
  selection,
}: UsePerChatComposerStateParams) {
  const [composerDraftInputsByChatKey, setComposerDraftInputsByChatKey] = useState<
    Record<string, string>
  >({});
  const [searchStatesByChatKey, setSearchStatesByChatKey] = useState<
    Record<string, SearchMetadata | null>
  >({});
  const [searchModesByChatKey, setSearchModesByChatKey] = useState<
    Record<string, SearchMode>
  >(() => ({ ...searchModesSessionStore }));
  const composerDraftInputsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    composerDraftInputsRef.current = composerDraftInputsByChatKey;
  }, [composerDraftInputsByChatKey]);

  const activeComposerStateKey = getComposerStateKey(selection);
  const input = composerDraftInputsByChatKey[activeComposerStateKey] ?? '';
  const activeSearchState = searchStatesByChatKey[activeComposerStateKey] ?? null;
  const activeSearchMode = searchModesByChatKey[activeComposerStateKey] ?? 'auto';

  const setInputForSelection = useCallback(
    (nextSelection: SelectedChat | null, value: string) => {
      const key = getComposerStateKey(nextSelection);

      setComposerDraftInputsByChatKey((prev) => {
        if (value.length === 0) {
          return deleteRecordKey(prev, key);
        }

        if (prev[key] === value) {
          return prev;
        }

        return {
          ...prev,
          [key]: value,
        };
      });
    },
    []
  );

  const clearInputForSelection = useCallback((nextSelection: SelectedChat | null) => {
    const key = getComposerStateKey(nextSelection);
    setComposerDraftInputsByChatKey((prev) => deleteRecordKey(prev, key));
  }, []);

  const setSearchStateForSelection = useCallback(
    (nextSelection: SelectedChat | null, value: SearchMetadata | null) => {
      const key = getComposerStateKey(nextSelection);

      setSearchStatesByChatKey((prev) => {
        if (value === null) {
          return deleteRecordKey(prev, key);
        }

        return {
          ...prev,
          [key]: value,
        };
      });
    },
    []
  );

  const clearSearchStateForSelection = useCallback((nextSelection: SelectedChat | null) => {
    const key = getComposerStateKey(nextSelection);
    setSearchStatesByChatKey((prev) => deleteRecordKey(prev, key));
  }, []);

  const setSearchModeForSelection = useCallback(
    (nextSelection: SelectedChat | null, mode: SearchMode) => {
      const key = nextSelection
        ? getComposerStateKey(nextSelection)
        : activeComposerStateKey;

      setSearchModesByChatKey((prev) => {
        if (mode === 'auto') {
          delete searchModesSessionStore[key];
          return deleteRecordKey(prev, key);
        }

        if (prev[key] === mode) {
          return prev;
        }

        searchModesSessionStore[key] = mode;
        return {
          ...prev,
          [key]: mode,
        };
      });
    },
    [activeComposerStateKey]
  );

  const clearSelectionState = useCallback(
    (nextSelection: SelectedChat | null) => {
      clearInputForSelection(nextSelection);
      clearSearchStateForSelection(nextSelection);
    },
    [clearInputForSelection, clearSearchStateForSelection]
  );

  const resetAllComposerState = useCallback(() => {
    setComposerDraftInputsByChatKey({});
    setSearchStatesByChatKey({});
    for (const key of Object.keys(searchModesSessionStore)) {
      delete searchModesSessionStore[key];
    }
    setSearchModesByChatKey({});
  }, []);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      const restoredDrafts = Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string'
        )
      );
      setComposerDraftInputsByChatKey(restoredDrafts);
    } catch (error) {
      console.error('Failed to restore composer drafts:', error);
      window.sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    if (Object.keys(composerDraftInputsByChatKey).length === 0) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }

    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify(composerDraftInputsByChatKey)
    );
  }, [composerDraftInputsByChatKey, storageKey]);

  return {
    activeSearchMode,
    activeSearchState,
    composerDraftInputsRef,
    input,
    clearInputForSelection,
    clearSearchStateForSelection,
    clearSelectionState,
    resetAllComposerState,
    setInputForSelection,
    setSearchModeForSelection,
    setSearchStateForSelection,
  };
}
