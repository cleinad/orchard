export interface ThreadSource {
  highlightedText: string;
  sourceMessageId: string;
  startOffset: number;
  endOffset: number;
}

export interface ThreadMeta extends ThreadSource {
  threadId: string;
}
