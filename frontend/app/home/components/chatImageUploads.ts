import {
  CHAT_IMAGE_BUCKET,
  CHAT_IMAGE_SIGNED_URL_TTL_SECONDS,
  MAX_CHAT_IMAGE_ATTACHMENTS,
  MAX_CHAT_IMAGE_BYTES,
  type ChatImageAttachment,
  type ChatImageAttachmentRequest,
  isChatImageMimeType,
  sanitizeAttachmentFileName,
} from '@/lib/chat-attachments';

export interface PendingChatImageAttachment {
  id: string;
  file: File;
  fileName: string;
  mimeType: ChatImageAttachment['mimeType'];
  sizeBytes: number;
  width: number | null;
  height: number | null;
  url: string;
}

export interface UploadedChatImageAttachment extends ChatImageAttachmentRequest {
  id: string;
  url: string;
}

function readImageDimensions(url: string): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null });
    image.onerror = () => resolve({ width: null, height: null });
    image.src = url;
  });
}

export async function createPendingChatImageAttachments(
  files: File[],
  existingCount: number
): Promise<{ attachments: PendingChatImageAttachment[]; error: string | null }> {
  const remainingSlots = MAX_CHAT_IMAGE_ATTACHMENTS - existingCount;
  if (remainingSlots <= 0) {
    return {
      attachments: [],
      error: `Attach up to ${MAX_CHAT_IMAGE_ATTACHMENTS} images at a time.`,
    };
  }

  const acceptedFiles = files.slice(0, remainingSlots);
  const rejectedForLimit = files.length > remainingSlots;
  const attachments: PendingChatImageAttachment[] = [];

  for (const file of acceptedFiles) {
    if (!isChatImageMimeType(file.type)) {
      return {
        attachments,
        error: 'Only PNG, JPEG, WebP, and GIF images are supported.',
      };
    }

    if (file.size <= 0 || file.size > MAX_CHAT_IMAGE_BYTES) {
      return {
        attachments,
        error: `Images must be ${Math.floor(MAX_CHAT_IMAGE_BYTES / 1024 / 1024)}MB or smaller.`,
      };
    }

    const url = URL.createObjectURL(file);
    const dimensions = await readImageDimensions(url);

    attachments.push({
      id: crypto.randomUUID(),
      file,
      fileName: sanitizeAttachmentFileName(file.name),
      mimeType: file.type,
      sizeBytes: file.size,
      width: dimensions.width,
      height: dimensions.height,
      url,
    });
  }

  return {
    attachments,
    error: rejectedForLimit
      ? `Only the first ${remainingSlots} image${remainingSlots === 1 ? '' : 's'} were attached.`
      : null,
  };
}

export async function uploadChatImageAttachments(
  attachments: PendingChatImageAttachment[]
): Promise<UploadedChatImageAttachment[]> {
  if (attachments.length === 0) {
    return [];
  }

  const { supabase } = await import('@/lib/supabase');
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('You must be signed in to attach images.');
  }

  const uploaded: UploadedChatImageAttachment[] = [];

  for (const attachment of attachments) {
    const extension = attachment.fileName.split('.').pop()?.toLowerCase();
    const safeExtension = extension && extension.length <= 8 ? `.${extension}` : '';
    const storagePath = `${user.id}/${crypto.randomUUID()}${safeExtension}`;
    const { error } = await supabase.storage
      .from(CHAT_IMAGE_BUCKET)
      .upload(storagePath, attachment.file, {
        cacheControl: '3600',
        contentType: attachment.mimeType,
        upsert: false,
      });

    if (error) {
      if (uploaded.length > 0) {
        await supabase.storage
          .from(CHAT_IMAGE_BUCKET)
          .remove(uploaded.map((item) => item.storagePath));
      }
      throw new Error(error.message || 'Failed to upload image.');
    }

    const { data: signedUrl, error: signedUrlError } = await supabase.storage
      .from(CHAT_IMAGE_BUCKET)
      .createSignedUrl(storagePath, CHAT_IMAGE_SIGNED_URL_TTL_SECONDS);

    if (signedUrlError || !signedUrl?.signedUrl) {
      await supabase.storage
        .from(CHAT_IMAGE_BUCKET)
        .remove([...uploaded.map((item) => item.storagePath), storagePath]);
      throw new Error('Failed to prepare image preview.');
    }

    uploaded.push({
      id: attachment.id,
      storagePath,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      width: attachment.width,
      height: attachment.height,
      url: signedUrl.signedUrl,
    });
  }

  return uploaded;
}

export async function removeChatImageStoragePaths(
  storagePaths: string[]
): Promise<void> {
  if (storagePaths.length === 0) return;

  const { supabase } = await import('@/lib/supabase');
  const { error } = await supabase.storage
    .from(CHAT_IMAGE_BUCKET)
    .remove(storagePaths);
  if (error) {
    throw new Error(error.message || 'Failed to remove image.');
  }
}
