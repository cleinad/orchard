import type { Message } from '@/app/home/types';
import type { SelectionStreamVersion } from '@/app/home/components/markdownSelectableStream';

export interface ThreadSource {
  highlightedText: string;
  sourceMessageId: string;
  startOffset: number;
  endOffset: number;
  selectionStreamVersion?: SelectionStreamVersion;
}

export interface ThreadMeta extends ThreadSource {
  threadId: string;
}

export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  searchMetadata?: Message['searchMetadata'];
}

export type ThreadSessionStatus = 'loading' | 'ready' | 'error';

export interface ThreadSession extends ThreadSource {
  sessionId: string;
  threadId: string | null;
  status: ThreadSessionStatus;
  messages: ThreadMessage[];
  draftInput: string;
  isHydrating: boolean;
}

export interface InlineThreadMarker extends ThreadSource {
  markerId: string;
  threadId: string | null;
  sessionId: string | null;
  status: ThreadSessionStatus;
}
