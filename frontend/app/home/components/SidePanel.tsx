'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ConversationListItem } from './ConversationsPanel';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  conversations: ConversationListItem[];
  activeConversationId: string | null;
  onSelectConversation: (conversation: ConversationListItem) => void;
  onNewNovusChat: () => void;
}

function formatDate(input: string): string {
  const date = new Date(input);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function SidePanel({
  isOpen,
  onClose,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewNovusChat,
}: Props) {
  const router = useRouter();

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleEscape]);

  return (
    <div
      className={`fixed inset-0 z-40 transition-all duration-300 ${
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/10 transition-opacity duration-300 dark:bg-black/40 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={`absolute left-0 top-0 h-full w-[380px] max-w-[85vw] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col bg-background shadow-xl dark:bg-[#131312]">
          {/* Header */}
          <div className="flex h-16 items-center justify-between px-6">
            <h2 className="font-heading text-xl text-foreground">
              Conversations
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-muted transition-colors hover:text-foreground"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* New Chat button */}
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={() => {
                onNewNovusChat();
                onClose();
              }}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-muted ring-1 ring-black/[0.06] transition-colors hover:text-foreground dark:ring-white/[0.08]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Chat
            </button>
          </div>

          {/* Divider */}
          <div className="mx-6 h-px bg-black/[0.06] dark:bg-white/[0.06]" />

          {/* Conversations list */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: 'none' }}>
            {conversations.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted">
                No conversations yet.
              </div>
            ) : (
              conversations.map((conversation) => {
                const isActive = activeConversationId === conversation.id;
                const accent = conversation.mentor_accent_color || '#94a3b8';
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => {
                      onSelectConversation(conversation);
                      onClose();
                    }}
                    className={`group w-full rounded-lg px-4 py-3 text-left transition-colors duration-150 ${
                      isActive
                        ? 'bg-foreground/[0.04]'
                        : 'hover:bg-foreground/[0.02]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: accent }}
                        />
                        <span className="truncate text-sm font-medium text-foreground">
                          {conversation.mentor_name}
                        </span>
                      </div>
                      <span className="flex-shrink-0 text-xs text-muted/60">
                        {formatDate(conversation.updated_at)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 pl-4 text-xs leading-snug text-muted/70">
                      {conversation.preview || conversation.title || 'No messages yet'}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer - Memories link */}
          <div className="border-t border-black/[0.06] px-6 py-4 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                router.push('/memory');
                onClose();
              }}
              className="flex w-full items-center justify-between text-sm text-muted transition-colors hover:text-foreground"
            >
              <span>Memories</span>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5-7.5M21 12H3" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
