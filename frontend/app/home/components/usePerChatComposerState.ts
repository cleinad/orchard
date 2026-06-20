"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SelectedChat } from '@/app/home/components/HomeDataContext';
import {
  deleteRecordKey,
  getComposerStateKey,
} from '@/app/home/components/homeSelection';
import type { SearchMetadata } from '@/lib/chat-search';

interface UsePerChatComposerStateParams {
  storageKey: string;
  selection: SelectedChat | null;
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
  const composerDraftInputsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    composerDraftInputsRef.current = composerDraftInputsByChatKey;
  }, [composerDraftInputsByChatKey]);

  const activeComposerStateKey = getComposerStateKey(selection);
  const input = composerDraftInputsByChatKey[activeComposerStateKey] ?? '';
  const activeSearchState = searchStatesByChatKey[activeComposerStateKey] ?? null;

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
    activeSearchState,
    composerDraftInputsRef,
    input,
    clearInputForSelection,
    clearSearchStateForSelection,
    clearSelectionState,
    resetAllComposerState,
    setInputForSelection,
    setSearchStateForSelection,
  };
}
