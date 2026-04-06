'use client';

import { useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ConversationListItem,
  SidebarMentorGroup,
} from '@/app/home/types';

interface DraftChatListItem {
  id: string;
  mentor_id: string | null;
  title: string;
  updated_at: string;
}

interface TemporaryChatListItem {
  id: string;
  title: string;
  updated_at: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  mentorGroups: SidebarMentorGroup[];
  draftChats: DraftChatListItem[];
  temporaryChats: TemporaryChatListItem[];
  selectedConversationId: string | null;
  selectedDraftId: string | null;
  selectedTempChatId: string | null;
  selectedMentorId: string | null;
  onSelectConversation: (conversation: ConversationListItem) => void;
  onSelectDraft: (draftId: string) => void;
  onSelectTemporaryChat: (tempChatId: string) => void;
  onCreateDraft: (mentorId: string | null) => void;
  onCloseTemporaryChat: (tempChatId: string) => void;
}

function getMentorKey(mentorId: string | null) {
  return mentorId ?? '__keen__';
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
  mentorGroups,
  draftChats,
  temporaryChats,
  selectedConversationId,
  selectedDraftId,
  selectedTempChatId,
  selectedMentorId,
  onSelectConversation,
  onSelectDraft,
  onSelectTemporaryChat,
  onCreateDraft,
  onCloseTemporaryChat,
}: Props) {
  const router = useRouter();
  const [expandedMentors, setExpandedMentors] = useState<Record<string, boolean>>({});
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});

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

  useEffect(() => {
    if (!selectedMentorId && !selectedDraftId && !selectedConversationId) {
      return;
    }

    const mentorKey = getMentorKey(selectedMentorId);
    const draftByMentorKey = new Map(
      draftChats.map((draft) => [getMentorKey(draft.mentor_id), draft])
    );
    const group = mentorGroups.find((entry) => entry.mentor_id === selectedMentorId);
    if (!group) {
      return;
    }

    setExpandedMentors((prev) => ({ ...prev, [mentorKey]: true }));

    const items = [
      ...(draftByMentorKey.get(mentorKey)
        ? [{ kind: 'draft' as const, id: draftByMentorKey.get(mentorKey)!.id }]
        : []),
      ...group.conversations.map((conversation) => ({
        kind: 'conversation' as const,
        id: conversation.id,
      })),
    ];

    const selectedIndex = items.findIndex((item) =>
      item.kind === 'draft'
        ? item.id === selectedDraftId
        : item.id === selectedConversationId
    );

    if (selectedIndex >= 0) {
      const minimumVisible = selectedIndex < 3 ? 3 : Math.max(10, selectedIndex + 1);
      setVisibleCounts((prev) => ({
        ...prev,
        [mentorKey]: Math.max(prev[mentorKey] ?? 3, minimumVisible),
      }));
    }
  }, [
    draftChats,
    mentorGroups,
    selectedConversationId,
    selectedDraftId,
    selectedMentorId,
  ]);

  const draftByMentorKey = new Map(
    draftChats.map((draft) => [getMentorKey(draft.mentor_id), draft])
  );

  return (
    <div
      className={`fixed inset-0 z-40 transition-all duration-300 lg:inset-y-0 lg:left-0 lg:right-auto lg:w-[380px] ${
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      <div
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
              <h2 className="font-heading text-lg text-foreground">Chats</h2>
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

          <div className="side-panel-scroll-area relative min-h-0 flex-1">
            <div className="side-panel-scroll h-full overflow-y-auto px-4 pb-6">
              <button
                type="button"
                onClick={() => {
                  router.push('/memory');
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition-colors hover:bg-foreground/[0.04]"
              >
                <span className="font-heading text-[15px] text-foreground">Memories</span>
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
                    d="M13.5 6.75L18.75 12m0 0l-5.25 5.25M18.75 12H5.25"
                  />
                </svg>
              </button>

              <div className="mx-2 h-px bg-border-subtle" />

              {temporaryChats.length > 0 && (
                <>
                  <div className="px-3 pb-2 pt-4 text-[11px] font-medium uppercase tracking-[0.18em] text-muted/70">
                    Temporary
                  </div>
                  <div className="space-y-1">
                    {temporaryChats.map((chat) => {
                      const isActive = selectedTempChatId === chat.id;
                      return (
                        <div
                          key={chat.id}
                          className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors ${
                            isActive ? 'bg-foreground/[0.06]' : 'hover:bg-foreground/[0.04]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectTemporaryChat(chat.id)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <span className="inline-flex items-center rounded-full border border-border-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted/80">
                              Temp
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                              {chat.title}
                            </span>
                            <span className="flex-shrink-0 text-[11px] text-muted">
                              {formatDate(chat.updated_at)}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onCloseTemporaryChat(chat.id)}
                            className="rounded-full p-1 text-muted/60 transition-colors hover:text-foreground"
                            aria-label={`Close ${chat.title}`}
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
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mx-2 mt-4 h-px bg-border-subtle" />
                </>
              )}

              <div className="pt-4">
                {mentorGroups.map((group) => {
                  const mentorKey = getMentorKey(group.mentor_id);
                  const draft = draftByMentorKey.get(mentorKey) || null;
                  const isExpanded = expandedMentors[mentorKey] || false;
                  const visibleCount = visibleCounts[mentorKey] ?? 3;
                  const visibleConversations = isExpanded
                    ? group.conversations.slice(0, visibleCount)
                    : [];
                  const hasMore = group.conversations.length > visibleConversations.length;
                  const isSelectedMentor =
                    selectedMentorId === group.mentor_id &&
                    (selectedConversationId !== null || selectedDraftId !== null);

                  return (
                    <div key={mentorKey} className="py-1">
                      <div
                        className={`flex items-center gap-2 rounded-2xl px-3 py-2 transition-colors ${
                          isSelectedMentor ? 'bg-foreground/[0.05]' : 'hover:bg-foreground/[0.03]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMentors((prev) => ({
                              ...prev,
                              [mentorKey]: !isExpanded,
                            }))
                          }
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span
                            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                            style={{
                              backgroundColor: group.mentor_accent_color || '#94a3b8',
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate font-heading text-[15px] text-foreground">
                            {group.mentor_name}
                          </span>
                          <svg
                            className={`h-4 w-4 flex-shrink-0 text-muted transition-transform ${
                              isExpanded ? 'rotate-90' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 5.25L15 12l-6 6.75"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => onCreateDraft(group.mentor_id)}
                          className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                          aria-label={`New chat with ${group.mentor_name}`}
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
                              d="M12 4.5v15m7.5-7.5h-15"
                            />
                          </svg>
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="ml-6 mt-1 space-y-0.5 border-l border-border-subtle/80 pl-4">
                          {draft && (
                            <button
                              type="button"
                              onClick={() => onSelectDraft(draft.id)}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                                selectedDraftId === draft.id
                                  ? 'bg-foreground/[0.06]'
                                  : 'hover:bg-foreground/[0.04]'
                              }`}
                            >
                              <span className="truncate text-sm text-foreground">
                                {draft.title}
                              </span>
                              <span className="flex-shrink-0 text-[11px] text-muted">
                                {formatDate(draft.updated_at)}
                              </span>
                            </button>
                          )}

                          {visibleConversations.map((conversation) => (
                            <button
                              key={conversation.id}
                              type="button"
                              onClick={() => onSelectConversation(conversation)}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                                selectedConversationId === conversation.id
                                  ? 'bg-foreground/[0.06]'
                                  : 'hover:bg-foreground/[0.04]'
                              }`}
                            >
                              <span className="truncate text-sm text-foreground/88">
                                {conversation.title}
                              </span>
                              <span className="flex-shrink-0 text-[11px] text-muted">
                                {formatDate(conversation.updated_at)}
                              </span>
                            </button>
                          ))}

                          {group.conversations.length > 3 && (
                            <div className="flex items-center gap-3 px-3 pt-1">
                              {hasMore ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setVisibleCounts((prev) => ({
                                      ...prev,
                                      [mentorKey]:
                                        (prev[mentorKey] ?? 3) <= 3
                                          ? 10
                                          : (prev[mentorKey] ?? 3) + 10,
                                    }))
                                  }
                                  className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted transition-colors hover:text-foreground"
                                >
                                  Show more
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setVisibleCounts((prev) => ({
                                      ...prev,
                                      [mentorKey]: 3,
                                    }))
                                  }
                                  className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted transition-colors hover:text-foreground"
                                >
                                  Show less
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
