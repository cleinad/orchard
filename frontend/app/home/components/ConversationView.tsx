import type { RefObject } from 'react';
import MarkdownWithThreads from '@/app/home/components/MarkdownWithThreads';
import type { ThreadMeta } from '@/app/home/components/threadTypes';
import type { Message } from '@/app/home/types';
import { markdownContentClassName } from '@/lib/markdown';

interface ConversationViewProps {
  loadingLists: boolean;
  listError: string | null;
  messages: Message[];
  activeName: string;
  emptyTitle: string;
  emptySubtitle: string;
  isLoading: boolean;
  threadsMap: Map<string, ThreadMeta[]>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onThreadClick: (thread: ThreadMeta) => void;
  onAssistantPointerUp: () => void;
}

export default function ConversationView({
  loadingLists,
  listError,
  messages,
  activeName,
  emptyTitle,
  emptySubtitle,
  isLoading,
  threadsMap,
  messagesEndRef,
  onThreadClick,
  onAssistantPointerUp,
}: ConversationViewProps) {
  return (
    <div className="mx-auto max-w-2xl px-6 pb-4">
      {(loadingLists || listError) && (
        <div className="mb-4 rounded-lg bg-surface px-4 py-2 text-xs text-muted shadow-sm">
          {loadingLists ? 'Loading chats and mentors...' : listError}
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex h-full min-h-[50vh] flex-col items-center justify-center px-4">
          <div className="text-center">
            <h1 className="font-heading text-3xl text-foreground sm:text-4xl">
              {emptyTitle}
            </h1>
            <p className="mt-4 max-w-md text-md font-medium leading-relaxed text-muted">
              {emptySubtitle}
            </p>
          </div>
        </div>
      ) : (
        <div className="py-8">
          {messages.map((message) => (
            <div
              key={message.id}
              className="py-4"
              data-message-id={message.id}
              data-message-role={message.role}
              onPointerUp={message.role === 'assistant' ? onAssistantPointerUp : undefined}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium tracking-wider text-muted">
                  {message.role === 'user' ? 'You' : activeName}
                </span>
                <span className="text-xs text-muted/60">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div
                data-message-content="true"
                className={`${markdownContentClassName} mt-2 text-base leading-relaxed text-foreground`}
              >
                <MarkdownWithThreads
                  content={message.content}
                  threads={threadsMap.get(message.id) || []}
                  onThreadClick={onThreadClick}
                />
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="py-4">
              <span className="text-xs font-medium tracking-wider text-muted">
                {activeName}
              </span>
              <div className="mt-2 flex items-center gap-1.5">
                <span
                  className="h-2 w-2 animate-bounce rounded-full bg-muted/40"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="h-2 w-2 animate-bounce rounded-full bg-muted/40"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="h-2 w-2 animate-bounce rounded-full bg-muted/40"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
}
