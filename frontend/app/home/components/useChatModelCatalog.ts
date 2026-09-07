"use client";

import { useEffect, useState } from 'react';
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL_ID,
  type ChatModelId,
  type ChatModelListItem,
} from '@/lib/chat-models';

interface ChatModelsResponse {
  models?: ChatModelListItem[];
  error?: string;
}

const EMPTY_CHAT_MODELS: ChatModelListItem[] = [];

export function useChatModelCatalog(
  selectedModelId: ChatModelId,
  setSelectedModelId: (modelId: ChatModelId) => void,
  initialChatModels: ChatModelListItem[] = EMPTY_CHAT_MODELS
) {
  const [chatModels, setChatModels] = useState<ChatModelListItem[]>(
    initialChatModels.length > 0
      ? initialChatModels
      : CHAT_MODEL_OPTIONS.map((option) => ({
          id: option.id,
          label: option.label,
          provider: option.provider,
          providerLabel: option.providerLabel,
          iconKey: option.iconKey,
          description: option.description,
          available: true,
          isDefault: option.id === DEFAULT_CHAT_MODEL_ID,
          ...(option.effort ? { effort: option.effort } : {}),
          supportsImages:
            option.provider === 'auto' ? false : option.supportsImages ?? false,
        }))
  );

  useEffect(() => {
    let cancelled = false;

    const loadChatModels = async () => {
      if (initialChatModels.length > 0) {
        return;
      }

      try {
        const response = await fetch('/api/chat/models', { cache: 'no-store' });
        const data = (await response.json()) as ChatModelsResponse;

        if (!response.ok || data.error || !data.models) {
          throw new Error(data.error || 'Failed to load chat models');
        }

        if (!cancelled) {
          setChatModels(data.models);
        }
      } catch {
        // Keep the optimistic client-side catalog if the server list can't load.
      }
    };

    void loadChatModels();

    return () => {
      cancelled = true;
    };
  }, [initialChatModels]);

  useEffect(() => {
    const hasSelectedModel = chatModels.some(
      (model) => model.id === selectedModelId && model.available
    );

    if (hasSelectedModel) {
      return;
    }

    const fallbackModel =
      chatModels.find((model) => model.isDefault && model.available) ||
      chatModels.find((model) => model.available) ||
      null;

    if (fallbackModel) {
      setSelectedModelId(fallbackModel.id);
    }
  }, [chatModels, selectedModelId, setSelectedModelId]);

  return chatModels;
}
