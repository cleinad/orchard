import type { SelectedChat } from '@/app/home/components/HomeDataContext';

export const BLANK_COMPOSER_KEY = 'blank:keen';

export function getSelectedChatKey(selection: SelectedChat | null) {
  if (!selection) {
    return null;
  }

  if (selection.kind === 'persistent') {
    return `persistent:${selection.conversationId}`;
  }

  if (selection.kind === 'draft') {
    return `draft:${selection.draftId}`;
  }

  return `temporary:${selection.tempChatId}`;
}

export function getComposerStateKey(selection: SelectedChat | null) {
  return getSelectedChatKey(selection) ?? BLANK_COMPOSER_KEY;
}

export function isSameSelectedChat(a: SelectedChat | null, b: SelectedChat | null) {
  const aKey = getSelectedChatKey(a);
  return aKey !== null && aKey === getSelectedChatKey(b);
}

export function deleteRecordKey<T>(record: Record<string, T>, key: string) {
  if (!(key in record)) {
    return record;
  }

  const next = { ...record };
  delete next[key];
  return next;
}
