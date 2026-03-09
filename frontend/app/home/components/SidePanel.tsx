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
        className={`absolute inset-0 bg-stone-500/8 backdrop-blur-sm transition-opacity duration-300 dark:bg-black/40 lg:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`absolute left-0 top-0 h-full w-[380px] max-w-[85vw] transform transition-transform duration-300 ease-out lg:w-full lg:max-w-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="side-panel flex h-full flex-col bg-[#faf9f6]/97 backdrop-blur-2xl dark:bg-[#111110]/97">
          <div className="px-6 pb-3 pt-6">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg text-stone-800 dark:text-stone-100">
                Conversations
              </h2>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-stone-300 transition-colors hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400"
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
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200/60 px-4 py-2.5 text-[12px] font-medium text-stone-400 transition-colors duration-150 hover:border-stone-300/70 hover:text-stone-600 dark:border-stone-800/50 dark:text-stone-500 dark:hover:border-stone-700/60 dark:hover:text-stone-300"
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
              className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold text-stone-700 transition-colors hover:bg-stone-100/60 hover:text-stone-900 dark:text-stone-200 dark:hover:bg-stone-800/30 dark:hover:text-white"
              aria-label="Open memories"
              title="Open memories"
            >
              <svg
                className="h-4 w-4 text-stone-500 dark:text-stone-400"
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

          <div className="mx-6 h-px bg-stone-200/50 dark:bg-stone-800/50" />

          <div className="side-panel-scroll-area relative min-h-0 flex-1">
            <div className="side-panel-scroll h-full overflow-y-auto px-3 py-2">
              {conversations.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-stone-400 dark:text-stone-500">
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
                            ? 'bg-stone-200/50 dark:bg-stone-800/40'
                            : 'hover:bg-stone-100/60 dark:hover:bg-stone-800/25'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2 w-2 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: accent }}
                            />
                            <span className="truncate font-heading text-[13px] text-stone-800 dark:text-stone-100">
                              {conversation.mentor_name}
                            </span>
                          </div>
                          <span className="flex-shrink-0 text-[11px] text-stone-400 dark:text-stone-500">
                            {formatDate(conversation.updated_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 pl-4 text-[11px] leading-snug text-stone-400 dark:text-stone-500">
                          {conversation.preview || conversation.title || 'No messages yet'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-[#faf9f6]/97 to-transparent dark:from-[#111110]/97" />
          </div>
        </div>
      </aside>

      <style jsx>{`
        .side-panel {
          box-shadow:
            6px 0 32px rgba(0, 0, 0, 0.04),
            1px 0 8px rgba(0, 0, 0, 0.02);
        }

        :global(.dark) .side-panel {
          box-shadow:
            6px 0 32px rgba(0, 0, 0, 0.3),
            1px 0 8px rgba(0, 0, 0, 0.15);
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
