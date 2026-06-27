"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SelectedChat } from '@/app/home/components/HomeDataContext';
import {
  deleteRecordKey,
  getComposerStateKey,
} from '@/app/home/components/homeSelection';
import type { SearchMetadata } from '@/lib/chat-search';
import {
  DEFAULT_RESPONSE_STYLE,
  isDefaultResponseStyle,
  sanitizeResponseStyle,
  type ResponseStyle,
} from '@/lib/response-style';

interface UsePerChatComposerStateParams {
  storageKey: string;
  responseStyleStorageKey: string;
  selection: SelectedChat | null;
}

export function usePerChatComposerState({
  responseStyleStorageKey,
  storageKey,
  selection,
}: UsePerChatComposerStateParams) {
  const [composerDraftInputsByChatKey, setComposerDraftInputsByChatKey] = useState<
    Record<string, string>
  >({});
  const [searchStatesByChatKey, setSearchStatesByChatKey] = useState<
    Record<string, SearchMetadata | null>
  >({});
  const [responseStylesByChatKey, setResponseStylesByChatKey] = useState<
    Record<string, ResponseStyle>
  >({});
  const composerDraftInputsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    composerDraftInputsRef.current = composerDraftInputsByChatKey;
  }, [composerDraftInputsByChatKey]);

  const activeComposerStateKey = getComposerStateKey(selection);
  const input = composerDraftInputsByChatKey[activeComposerStateKey] ?? '';
  const activeSearchState = searchStatesByChatKey[activeComposerStateKey] ?? null;
  const activeResponseStyle =
    responseStylesByChatKey[activeComposerStateKey] ?? DEFAULT_RESPONSE_STYLE;

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

  const setResponseStyleForSelection = useCallback(
    (nextSelection: SelectedChat | null, value: ResponseStyle) => {
      const key = getComposerStateKey(nextSelection);
      const normalized = {
        ...sanitizeResponseStyle({ ...value, sessionNote: '' }),
        sessionNote: value.sessionNote.slice(0, 1_000),
      };

      setResponseStylesByChatKey((prev) => {
        if (isDefaultResponseStyle(normalized)) {
          return deleteRecordKey(prev, key);
        }

        return {
          ...prev,
          [key]: normalized,
        };
      });
    },
    []
  );

  const clearResponseStyleForSelection = useCallback((nextSelection: SelectedChat | null) => {
    const key = getComposerStateKey(nextSelection);
    setResponseStylesByChatKey((prev) => deleteRecordKey(prev, key));
  }, []);

  const moveResponseStyleBetweenSelections = useCallback(
    (fromSelection: SelectedChat | null, toSelection: SelectedChat) => {
      const fromKey = getComposerStateKey(fromSelection);
      const toKey = getComposerStateKey(toSelection);

      setResponseStylesByChatKey((prev) => {
        const style = prev[fromKey];
        if (!style) {
          return prev;
        }

        const next = { ...prev };
        delete next[fromKey];
        next[toKey] = style;
        return next;
      });
    },
    []
  );

  const clearSelectionState = useCallback(
    (nextSelection: SelectedChat | null) => {
      clearInputForSelection(nextSelection);
      clearSearchStateForSelection(nextSelection);
      clearResponseStyleForSelection(nextSelection);
    },
    [clearInputForSelection, clearResponseStyleForSelection, clearSearchStateForSelection]
  );

  const resetAllComposerState = useCallback(() => {
    setComposerDraftInputsByChatKey({});
    setSearchStatesByChatKey({});
    setResponseStylesByChatKey({});
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

  useEffect(() => {
    const stored = window.sessionStorage.getItem(responseStyleStorageKey);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      const restoredStyles = Object.fromEntries(
        Object.entries(parsed)
          .map(([key, value]) => [key, sanitizeResponseStyle(value)] as const)
          .filter(([, value]) => !isDefaultResponseStyle(value))
      );
      setResponseStylesByChatKey(restoredStyles);
    } catch (error) {
      console.error('Failed to restore response styles:', error);
      window.sessionStorage.removeItem(responseStyleStorageKey);
    }
  }, [responseStyleStorageKey]);

  useEffect(() => {
    if (Object.keys(responseStylesByChatKey).length === 0) {
      window.sessionStorage.removeItem(responseStyleStorageKey);
      return;
    }

    window.sessionStorage.setItem(
      responseStyleStorageKey,
      JSON.stringify(responseStylesByChatKey)
    );
  }, [responseStyleStorageKey, responseStylesByChatKey]);

  return {
    activeSearchState,
    activeResponseStyle,
    composerDraftInputsRef,
    input,
    clearInputForSelection,
    clearResponseStyleForSelection,
    clearSearchStateForSelection,
    clearSelectionState,
    moveResponseStyleBetweenSelections,
    resetAllComposerState,
    setInputForSelection,
    setResponseStyleForSelection,
    setSearchStateForSelection,
  };
}
