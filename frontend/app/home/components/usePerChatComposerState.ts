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

export function getSearchModeFromMap(
  modesByChatKey: Record<string, SearchMode>,
  composerStateKey: string
) {
  return modesByChatKey[composerStateKey] ?? 'auto';
}

export function setSearchModeForKey(
  modesByChatKey: Record<string, SearchMode>,
  key: string,
  mode: SearchMode,
  sessionStore: Record<string, SearchMode> = searchModesSessionStore
) {
  if (mode === 'auto') {
    delete sessionStore[key];
    return deleteRecordKey(modesByChatKey, key);
  }

  if (modesByChatKey[key] === mode) {
    return modesByChatKey;
  }

  sessionStore[key] = mode;
  return {
    ...modesByChatKey,
    [key]: mode,
  };
}

export function clearSearchModeForKey(
  modesByChatKey: Record<string, SearchMode>,
  key: string,
  sessionStore: Record<string, SearchMode> = searchModesSessionStore
) {
  delete sessionStore[key];
  return deleteRecordKey(modesByChatKey, key);
}

export function moveSearchModeBetweenKeys(
  modesByChatKey: Record<string, SearchMode>,
  fromKey: string,
  toKey: string,
  sessionStore: Record<string, SearchMode> = searchModesSessionStore
) {
  const mode = modesByChatKey[fromKey] ?? sessionStore[fromKey] ?? 'auto';
  delete sessionStore[fromKey];
  let nextModes = deleteRecordKey(modesByChatKey, fromKey);

  if (mode === 'auto') {
    delete sessionStore[toKey];
    return deleteRecordKey(nextModes, toKey);
  }

  sessionStore[toKey] = mode;
  nextModes = {
    ...nextModes,
    [toKey]: mode,
  };

  return nextModes;
}

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
  const activeSearchMode = getSearchModeFromMap(searchModesByChatKey, activeComposerStateKey);

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

  const clearSearchModeForSelection = useCallback((nextSelection: SelectedChat | null) => {
    const key = getComposerStateKey(nextSelection);
    setSearchModesByChatKey((prev) => clearSearchModeForKey(prev, key));
  }, []);

  const moveSearchModeBetweenSelections = useCallback(
    (fromSelection: SelectedChat | null, toSelection: SelectedChat | null) => {
      const fromKey = getComposerStateKey(fromSelection);
      const toKey = getComposerStateKey(toSelection);
      setSearchModesByChatKey((prev) => moveSearchModeBetweenKeys(prev, fromKey, toKey));
    },
    []
  );

  const setSearchModeForSelection = useCallback(
    (nextSelection: SelectedChat | null, mode: SearchMode) => {
      const key = nextSelection
        ? getComposerStateKey(nextSelection)
        : activeComposerStateKey;

      setSearchModesByChatKey((prev) => setSearchModeForKey(prev, key, mode));
    },
    [activeComposerStateKey]
  );

  const clearSelectionState = useCallback(
    (nextSelection: SelectedChat | null) => {
      clearInputForSelection(nextSelection);
      clearSearchStateForSelection(nextSelection);
      clearSearchModeForSelection(nextSelection);
    },
    [clearInputForSelection, clearSearchModeForSelection, clearSearchStateForSelection]
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
    clearSearchModeForSelection,
    clearSearchStateForSelection,
    clearSelectionState,
    moveSearchModeBetweenSelections,
    resetAllComposerState,
    setInputForSelection,
    setSearchModeForSelection,
    setSearchStateForSelection,
  };
}
