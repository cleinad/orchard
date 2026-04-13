export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  previousMessageId: string | null;
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
  title: string;
  updated_at: string;
  created_at: string;
  preview: string;
  mentor_name: string;
  mentor_accent_color: string | null;
}

export interface SidebarMentorGroup {
  mentor_id: string | null;
  mentor_name: string;
  mentor_accent_color: string | null;
  last_activity_at: string | null;
  conversations: ConversationListItem[];
}
