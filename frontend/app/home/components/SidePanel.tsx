'use client';

import { useState, useEffect, useCallback } from 'react';
import { useMemory } from './useMemory';
import MemoryEntryComponent from './MemoryEntry';
import { MEMORY_CATEGORIES, CATEGORY_HEADINGS, type MemoryCategory } from '@/lib/memory-types';
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

function formatMemoryDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - date.getTime();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function SidePanel({
  isOpen,
  onClose,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewNovusChat,
}: Props) {
  const [memoriesExpanded, setMemoriesExpanded] = useState(false);
  const { entries, loading: memoriesLoading, load: loadMemories, updateEntry, deleteEntry } = useMemory();

  useEffect(() => {
    if (isOpen && memoriesExpanded) {
      loadMemories();
    }
  }, [isOpen, memoriesExpanded, loadMemories]);

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

  // Group memory entries
  const longTermByCategory = MEMORY_CATEGORIES.map((cat) => ({
    category: cat,
    heading: CATEGORY_HEADINGS[cat as MemoryCategory],
    entries: entries.filter((e) => e.type === 'long-term' && e.category === cat),
  })).filter((group) => group.entries.length > 0);

  const dailyByDate = entries
    .filter((e) => e.type === 'daily')
    .reduce(
      (acc, entry) => {
        const date = entry.date || 'Unknown';
        if (!acc[date]) acc[date] = [];
        acc[date].push(entry);
        return acc;
      },
      {} as Record<string, typeof entries>
    );

  const dailyDates = Object.keys(dailyByDate).sort((a, b) => b.localeCompare(a));
  const hasMemoryEntries = entries.length > 0;

  return (
    <div
      className={`fixed inset-0 z-40 transition-all duration-300 ${
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-stone-500/8 backdrop-blur-sm transition-opacity duration-300 dark:bg-black/40 ${
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
        <div className="side-panel flex h-full flex-col bg-[#faf9f6]/97 backdrop-blur-2xl dark:bg-[#111110]/97">
          {/* Header */}
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

          {/* New Chat button */}
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

          {/* Divider */}
          <div className="mx-6 h-px bg-stone-200/50 dark:bg-stone-800/50" />

          {/* Scrollable content */}
          <div className="side-panel-scroll-area relative min-h-0 flex-1">
            <div className="side-panel-scroll h-full overflow-y-auto px-3 py-2">
              {/* Conversations list */}
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

              {/* Memories section */}
              <div className="mt-3">
                <div className="mx-3 h-px bg-stone-200/50 dark:bg-stone-800/50" />
                <button
                  type="button"
                  onClick={() => setMemoriesExpanded(!memoriesExpanded)}
                  className="flex w-full items-center gap-2 px-3 py-3 text-left"
                >
                  <svg
                    className={`h-3 w-3 text-stone-400 transition-transform duration-200 dark:text-stone-500 ${
                      memoriesExpanded ? 'rotate-90' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-[11px] font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">
                    Memories
                  </span>
                  {entries.length > 0 && (
                    <span className="text-[10px] text-stone-300 dark:text-stone-600">
                      {entries.length}
                    </span>
                  )}
                </button>

                {memoriesExpanded && (
                  <div className="pb-4">
                    {memoriesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500 dark:border-stone-700 dark:border-t-stone-400" />
                      </div>
                    ) : !hasMemoryEntries ? (
                      <div className="px-3 py-6 text-center">
                        <p className="text-[11px] text-stone-400 dark:text-stone-500">
                          No memories yet. Novus will remember things as you chat.
                        </p>
                      </div>
                    ) : (
                      <div>
                        {longTermByCategory.map((group) => (
                          <div key={group.category}>
                            <div className="px-4 py-2">
                              <h3 className="text-[10px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
                                {group.heading}
                              </h3>
                            </div>
                            {group.entries.map((entry) => (
                              <MemoryEntryComponent
                                key={`${entry.fileId}-${entry.entryIndex}`}
                                entry={entry}
                                onUpdate={updateEntry}
                                onDelete={deleteEntry}
                              />
                            ))}
                          </div>
                        ))}

                        {dailyDates.length > 0 && (
                          <div>
                            <div className="px-4 py-2">
                              <h3 className="text-[10px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
                                Recent Notes
                              </h3>
                            </div>
                            {dailyDates.map((date) => (
                              <div key={date}>
                                <div className="px-4 py-1">
                                  <span className="text-[10px] text-stone-400 dark:text-stone-500">
                                    {formatMemoryDate(date)}
                                  </span>
                                </div>
                                {dailyByDate[date].map((entry) => (
                                  <MemoryEntryComponent
                                    key={`${entry.fileId}-${entry.entryIndex}`}
                                    entry={entry}
                                    onUpdate={updateEntry}
                                    onDelete={deleteEntry}
                                  />
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Top fade mask */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-[#faf9f6]/97 to-transparent dark:from-[#111110]/97" />
            {/* Bottom fade mask */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-[#faf9f6]/97 to-transparent dark:from-[#111110]/97" />
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
