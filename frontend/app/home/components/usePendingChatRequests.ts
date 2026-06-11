"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SelectedChat } from '@/app/home/components/HomeDataContext';
import {
  deleteRecordKey,
  getSelectedChatKey,
} from '@/app/home/components/homeSelection';

export interface PendingChatRequest {
  selection: SelectedChat;
  userMessageId: string;
  phase: 'awaiting-response' | 'reconciling';
}

export function usePendingChatRequests(selectedChat: SelectedChat | null) {
  const [pendingChatRequestsByChatKey, setPendingChatRequestsByChatKey] = useState<
    Record<string, PendingChatRequest>
  >({});
  const pendingChatRequestsRef = useRef<Record<string, PendingChatRequest>>({});

  useEffect(() => {
    pendingChatRequestsRef.current = pendingChatRequestsByChatKey;
  }, [pendingChatRequestsByChatKey]);

  const activePendingRequest =
    selectedChat
      ? pendingChatRequestsByChatKey[getSelectedChatKey(selectedChat)!] ?? null
      : null;
  const isLoading = activePendingRequest !== null;

  const setPendingRequest = useCallback(
    (selection: SelectedChat, request: PendingChatRequest | null) => {
      const key = getSelectedChatKey(selection);

      if (!key) {
        return;
      }

      setPendingChatRequestsByChatKey((prev) => {
        const next =
          request === null
            ? deleteRecordKey(prev, key)
            : {
                ...prev,
                [key]: request,
              };

        pendingChatRequestsRef.current = next;
        return next;
      });
    },
    []
  );

  const clearPendingRequest = useCallback((selection: SelectedChat) => {
    setPendingRequest(selection, null);
  }, [setPendingRequest]);

  const movePendingRequest = useCallback(
    (fromSelection: SelectedChat, toSelection: SelectedChat) => {
      const fromKey = getSelectedChatKey(fromSelection);
      const toKey = getSelectedChatKey(toSelection);

      if (!fromKey || !toKey || fromKey === toKey) {
        return;
      }

      setPendingChatRequestsByChatKey((prev) => {
        const request = prev[fromKey];

        if (!request) {
          return prev;
        }

        const next: Record<string, PendingChatRequest> = {
          ...prev,
          [toKey]: {
            ...request,
            selection: toSelection,
          },
        };
        delete next[fromKey];
        pendingChatRequestsRef.current = next;
        return next;
      });
    },
    []
  );

  const setPendingPhase = useCallback(
    (
      selection: SelectedChat,
      phase: PendingChatRequest['phase']
    ) => {
      const key = getSelectedChatKey(selection);

      if (!key) {
        return;
      }

      setPendingChatRequestsByChatKey((prev) => {
        const current = prev[key];

        if (!current || current.phase === phase) {
          return prev;
        }

        const next = {
          ...prev,
          [key]: {
            ...current,
            phase,
          },
        };

        pendingChatRequestsRef.current = next;
        return next;
      });
    },
    []
  );

  const resetPendingRequests = useCallback(() => {
    pendingChatRequestsRef.current = {};
    setPendingChatRequestsByChatKey({});
  }, []);

  return {
    activePendingRequest,
    isLoading,
    pendingChatRequestsRef,
    clearPendingRequest,
    movePendingRequest,
    resetPendingRequests,
    setPendingPhase,
    setPendingRequest,
  };
}
