import type { PersistedSearchMetadata } from '@/lib/chat-search';
import type { ChatImageAttachment } from '@/lib/chat-attachments';

export interface Message {
  id: string;
  renderId?: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatImageAttachment[];
  timestamp: Date;
  searchMetadata?: PersistedSearchMetadata | null;
  previousMessageId: string | null;
  isStreaming?: boolean;
}

export interface ConversationBranch {
  id: string;
  sourceMessageId: string;
  entryMessageId: string;
  title: string;
  isMain: boolean;
  position: number;
}

export type BranchSelectionMap = Record<string, string>;

export interface ConversationListItem {
  id: string;
  mentor_id: string | null;
  workspace_id: string | null;
  title: string;
  updated_at: string;
  created_at: string;
  mentor_name: string;
  mentor_accent_color: string | null;
  workspace_name: string | null;
  workspace_icon: string | null;
  workspace_accent_color: string | null;
}

export interface SidebarMentorGroup {
  mentor_id: string | null;
  mentor_name: string;
  mentor_accent_color: string | null;
  last_activity_at: string | null;
  conversations: ConversationListItem[];
}

export interface SidebarWorkspaceGroup {
  workspace_id: string;
  workspace_name: string;
  workspace_icon: string | null;
  workspace_accent_color: string | null;
  workspace_description: string | null;
  last_activity_at: string | null;
  conversations: ConversationListItem[];
}
