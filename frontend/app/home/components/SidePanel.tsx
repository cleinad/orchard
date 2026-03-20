'use client';

import { useEffect, useCallback } from 'react';
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
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
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
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
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
      // Mobile: full-screen overlay. Desktop: docked left column (so the chat can be pushed right).
      className={`fixed inset-0 z-40 transition-all duration-300 lg:inset-y-0 lg:left-0 lg:right-auto lg:w-[380px] ${
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      <div
        // The backdrop is only for the mobile overlay variant.
        className={`absolute inset-0 bg-foreground/[0.06] backdrop-blur-sm transition-opacity duration-300 dark:bg-black/40 lg:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`absolute left-0 top-0 h-full w-[380px] max-w-[85vw] transform transition-transform duration-300 ease-out lg:w-full lg:max-w-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div
          className="side-panel flex h-full flex-col backdrop-blur-2xl"
          style={{
            background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
            borderRight: '1px solid var(--border-subtle)',
          }}
        >
          <div className="px-6 pb-3 pt-6">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg text-foreground">
                Conversations
              </h2>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-muted/55 transition-colors hover:text-foreground"
                aria-label="Close"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="px-4 pb-2">
            <button
              type="button"
              onClick={() => {
                onNewNovusChat();
                onClose();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-2.5 text-[12px] font-medium text-muted transition-colors duration-150 hover:border-foreground/[0.12] hover:text-foreground"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              New Chat
            </button>
          </div>

          <div className="px-4 pb-3">
            <button
              type="button"
              onClick={() => {
                router.push('/memory');
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold text-foreground/84 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
              aria-label="Open memories"
              title="Open memories"
            >
              <svg
                className="h-4 w-4 text-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 3.75h9A2.25 2.25 0 0118.75 6v14.25l-6.75-3-6.75 3V6A2.25 2.25 0 017.5 3.75z"
                />
              </svg>
              <span>Memories</span>
            </button>
          </div>

          <div className="mx-6 h-px bg-border-subtle" />

          <div className="side-panel-scroll-area relative min-h-0 flex-1">
            <div className="side-panel-scroll h-full overflow-y-auto px-3 py-2">
              {conversations.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-muted">
                  No conversations yet.
                </div>
              ) : (
                <div>
                  {conversations.map((conversation) => {
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
                        className={`group w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${
                          isActive
                            ? 'bg-foreground/[0.06]'
                            : 'hover:bg-foreground/[0.04]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2 w-2 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: accent }}
                            />
                            <span className="truncate font-heading text-[13px] text-foreground">
                              {conversation.mentor_name}
                            </span>
                          </div>
                          <span className="flex-shrink-0 text-[11px] text-muted">
                            {formatDate(conversation.updated_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 pl-4 text-[11px] leading-snug text-muted">
                          {conversation.preview || conversation.title || 'No messages yet'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-3"
              style={{
                background:
                  'linear-gradient(to bottom, color-mix(in srgb, var(--surface) 94%, transparent), transparent)',
              }}
            />
          </div>
        </div>
      </aside>

      <style jsx>{`
        .side-panel {
          box-shadow:
            6px 0 32px color-mix(in srgb, var(--foreground) 10%, transparent),
            1px 0 8px color-mix(in srgb, var(--foreground) 5%, transparent);
        }

        .side-panel-scroll {
          scrollbar-width: none;
        }

        .side-panel-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
