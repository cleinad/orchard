'use client';

import ConversationView, {
  type ConversationViewProps,
} from '@/app/home/components/ConversationView';
import TextSelectionPopover, {
  type PopoverState,
} from '@/app/home/components/TextSelectionPopover';
import type { ThreadSource } from '@/app/home/components/threadTypes';

interface TranscriptSurfaceProps extends ConversationViewProps {
  popoverState: PopoverState | null;
  onDismissPopover: () => void;
  onSubmitThreadQuestion: (source: ThreadSource, question: string) => void;
  onOpenThreadDraft: (source: ThreadSource, draftInput: string) => void;
}

export default function TranscriptSurface({
  popoverState,
  onDismissPopover,
  onSubmitThreadQuestion,
  onOpenThreadDraft,
  ...conversationViewProps
}: TranscriptSurfaceProps) {
  return (
    <>
      <ConversationView {...conversationViewProps} />
      <TextSelectionPopover
        popoverState={popoverState}
        onDismiss={onDismissPopover}
        onSubmitQuestion={onSubmitThreadQuestion}
        onOpenThreadDraft={onOpenThreadDraft}
      />
    </>
  );
}
