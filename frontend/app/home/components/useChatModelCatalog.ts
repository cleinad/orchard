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

export function useChatModelCatalog(
  selectedModelId: ChatModelId,
  setSelectedModelId: (modelId: ChatModelId) => void
) {
  const [chatModels, setChatModels] = useState<ChatModelListItem[]>(
    CHAT_MODEL_OPTIONS.map((option) => ({
      id: option.id,
      label: option.label,
      provider: option.provider,
      providerLabel: option.providerLabel,
      iconKey: option.iconKey,
      description: option.description,
      ...(option.badge ? { badge: option.badge } : {}),
      available: true,
      isDefault: option.id === DEFAULT_CHAT_MODEL_ID,
      ...(option.effort ? { effort: option.effort } : {}),
      supportsImages: option.supportsImages ?? false,
    }))
  );

  useEffect(() => {
    let cancelled = false;

    const loadChatModels = async () => {
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
  }, []);

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
