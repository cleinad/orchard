import type { TemporaryChatSession } from '@/app/home/components/HomeDataContext';

export function getTemporaryChatAttachmentStoragePaths(
  temporaryChats: TemporaryChatSession[],
  tempChatId: string
) {
  const closedChat = temporaryChats.find((chat) => chat.id === tempChatId);

  return Array.from(
    new Set(
      (closedChat?.messages || [])
        .flatMap((message) => message.attachments || [])
        .map((attachment) => attachment.storagePath)
        .filter((storagePath): storagePath is string => storagePath.length > 0)
    )
  );
}
