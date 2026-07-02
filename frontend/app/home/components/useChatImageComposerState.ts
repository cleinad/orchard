"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  createPendingChatImageAttachments,
  type PendingChatImageAttachment,
} from '@/app/home/components/chatImageUploads';
import type { ChatModelId, ChatModelListItem } from '@/lib/chat-models';

export const IMAGE_MODEL_UNSUPPORTED_MESSAGE =
  'The selected model cannot read images. Choose a vision-capable model.';
export const REMOVED_IMAGES_FOR_MODEL_MESSAGE =
  'Removed attached images because the selected model cannot read images.';
export const GOOGLE_GIF_UNSUPPORTED_MESSAGE =
  'Google models do not support GIF images here. Use PNG, JPEG, or WebP.';

interface UseChatImageComposerStateParams {
  chatModels: ChatModelListItem[];
  selectedChatModel: ChatModelListItem | null;
  setSelectedModelId: Dispatch<SetStateAction<ChatModelId>>;
}

function revokeImageAttachmentUrls(attachments: PendingChatImageAttachment[]) {
  for (const attachment of attachments) {
    URL.revokeObjectURL(attachment.url);
  }
}

export function useChatImageComposerState({
  chatModels,
  selectedChatModel,
  setSelectedModelId,
}: UseChatImageComposerStateParams) {
  const [imageWarning, setImageWarning] = useState<string | null>(null);
  const [pendingImageAttachments, setPendingImageAttachments] = useState<
    PendingChatImageAttachment[]
  >([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const pendingImageAttachmentsRef = useRef<PendingChatImageAttachment[]>([]);

  const selectedModelSupportsImages = selectedChatModel?.supportsImages ?? true;
  const selectedModelRejectsGifImages = selectedChatModel?.provider === 'google';
  const imageInputDisabledReason = selectedModelSupportsImages
    ? null
    : IMAGE_MODEL_UNSUPPORTED_MESSAGE;

  useEffect(() => {
    pendingImageAttachmentsRef.current = pendingImageAttachments;
  }, [pendingImageAttachments]);

  useEffect(() => {
    return () => {
      revokeImageAttachmentUrls(pendingImageAttachmentsRef.current);
    };
  }, []);

  const clearPendingImageAttachments = useCallback((warning: string | null = null) => {
    setPendingImageAttachments((current) => {
      revokeImageAttachmentUrls(current);
      return [];
    });
    setImageWarning(warning);
  }, []);

  useEffect(() => {
    if (selectedModelSupportsImages || pendingImageAttachments.length === 0) {
      return;
    }

    clearPendingImageAttachments(REMOVED_IMAGES_FOR_MODEL_MESSAGE);
  }, [
    clearPendingImageAttachments,
    pendingImageAttachments.length,
    selectedModelSupportsImages,
  ]);

  const handleAttachImages = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    if (!selectedModelSupportsImages) {
      setImageWarning(IMAGE_MODEL_UNSUPPORTED_MESSAGE);
      return;
    }

    if (
      selectedModelRejectsGifImages
      && files.some((file) => file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif'))
    ) {
      setImageWarning(GOOGLE_GIF_UNSUPPORTED_MESSAGE);
      return;
    }

    if (isUploadingImages) {
      setImageWarning('Wait for the current image upload to finish.');
      return;
    }

    const result = await createPendingChatImageAttachments(
      files,
      pendingImageAttachments.length
    );

    if (result.attachments.length > 0) {
      setPendingImageAttachments((current) => [...current, ...result.attachments]);
    }

    setImageWarning(result.error);
  }, [
    isUploadingImages,
    pendingImageAttachments.length,
    selectedModelRejectsGifImages,
    selectedModelSupportsImages,
  ]);

  const handleRemoveImageAttachment = useCallback((id: string) => {
    setPendingImageAttachments((current) => {
      const attachment = current.find((item) => item.id === id);
      if (attachment) {
        URL.revokeObjectURL(attachment.url);
      }

      return current.filter((item) => item.id !== id);
    });
    setImageWarning(null);
  }, []);

  const handleModelChange = useCallback((modelId: ChatModelId) => {
    const nextModel = chatModels.find((model) => model.id === modelId) ?? null;
    const nextModelSupportsImages = nextModel?.supportsImages ?? true;

    if (!nextModelSupportsImages && pendingImageAttachmentsRef.current.length > 0) {
      clearPendingImageAttachments(REMOVED_IMAGES_FOR_MODEL_MESSAGE);
    } else if (nextModelSupportsImages) {
      setImageWarning((current) => {
        if (
          current === IMAGE_MODEL_UNSUPPORTED_MESSAGE
          || current === REMOVED_IMAGES_FOR_MODEL_MESSAGE
        ) {
          return null;
        }

        return current;
      });
    }

    setSelectedModelId(modelId);
  }, [chatModels, clearPendingImageAttachments, setSelectedModelId]);

  return {
    imageInputDisabledReason,
    imageWarning,
    isUploadingImages,
    pendingImageAttachments,
    selectedModelRejectsGifImages,
    selectedModelSupportsImages,
    clearPendingImageAttachments,
    handleAttachImages,
    handleModelChange,
    handleRemoveImageAttachment,
    setImageWarning,
    setIsUploadingImages,
    setPendingImageAttachments,
  };
}
