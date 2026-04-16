'use client';

import { useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import SidebarPanelIcon from '@/app/components/SidebarPanelIcon';
import Tooltip from '@/app/components/Tooltip';
import {
  RailIconAllChats,
  RailIconNewChat,
  RailIconTemporary,
} from '@/app/home/components/home-rail-icons';
import { useViewerIdentity } from '@/app/components/useViewerIdentity';
import { initialsFor } from '@/lib/mentors/ui-helpers';
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
  onToggleSidePanel: () => void;
  onNewChatKeen: () => void;
  onOpenTemporarySection: () => void;
  onOpenAllChats: () => void;
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

const railIconButtonClass =
  'relative z-10 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-foreground/[0.04]';

export default function SidePanel({
  isOpen,
  onClose,
  onToggleSidePanel,
  onNewChatKeen,
  onOpenTemporarySection,
  onOpenAllChats,
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
  const { viewer } = useViewerIdentity();
  const profileName = viewer?.fullName || viewer?.email || 'Your profile';
  const profileInitials = initialsFor(profileName);

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

  // Mentor list sits under the Chats heading; same expand/draft logic as before.
  const mentorList = (
    <div className="pt-1">
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
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 transition-colors ${
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
                <span className="min-w-0 flex-1 truncate font-sans text-[15px] text-foreground">
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
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-left transition-colors ${
                      selectedDraftId === draft.id
                        ? 'bg-foreground/[0.06]'
                        : 'hover:bg-foreground/[0.04]'
                    }`}
                  >
                    <span className="truncate font-sans text-sm text-foreground">{draft.title}</span>
                    <span className="flex-shrink-0 font-sans text-[11px] text-muted">
                      {formatDate(draft.updated_at)}
                    </span>
                  </button>
                )}

                {visibleConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => onSelectConversation(conversation)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-left transition-colors ${
                      selectedConversationId === conversation.id
                        ? 'bg-foreground/[0.06]'
                        : 'hover:bg-foreground/[0.04]'
                    }`}
                  >
                    <span className="truncate font-sans text-sm text-foreground/88">
                      {conversation.title}
                    </span>
                    <span className="flex-shrink-0 font-sans text-[11px] text-muted">
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
                        className="text-[11px] font-medium tracking-wide text-muted transition-colors hover:text-foreground"
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
                        className="text-[11px] font-medium tracking-wide text-muted transition-colors hover:text-foreground"
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
  );

  // Collapsed strip only; when open, icons are paired in rows below so each lines up with its section.
  const railIcons = (
    <>
      <Tooltip content={isOpen ? 'Hide chats' : 'Chats'} side="right">
        <button
          type="button"
          onClick={onToggleSidePanel}
          className={`${railIconButtonClass} ${isOpen ? 'text-foreground' : ''}`}
          aria-pressed={isOpen}
          aria-label={isOpen ? 'Close conversations' : 'Open conversations'}
        >
          <SidebarPanelIcon className="h-5 w-5 text-foreground" />
        </button>
      </Tooltip>
      <Tooltip content="New chat (Keen)" side="right">
        <button
          type="button"
          onClick={onNewChatKeen}
          className={railIconButtonClass}
          aria-label="New chat with Keen"
        >
          <RailIconNewChat className="h-5 w-5 text-foreground" />
        </button>
      </Tooltip>
      <Tooltip content="Temporary" side="right">
        <button
          type="button"
          onClick={onOpenTemporarySection}
          className={railIconButtonClass}
          aria-label="Temporary chats"
        >
          <RailIconTemporary className="h-5 w-5 text-foreground" />
        </button>
      </Tooltip>
      <Tooltip content="All chats" side="right">
        <button
          type="button"
          onClick={onOpenAllChats}
          className={railIconButtonClass}
          aria-label="All chats"
        >
          <RailIconAllChats className="h-5 w-5 text-foreground" />
        </button>
      </Tooltip>
    </>
  );

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-foreground/[0.06] backdrop-blur-sm transition-opacity duration-300 dark:bg-black/40 lg:hidden ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden
      />

      <div
        className={`fixed left-0 top-0 z-50 flex h-dvh overflow-hidden border-r border-foreground/[0.06] bg-background transition-[width] duration-300 ease-out dark:border-foreground/[0.08] ${
          isOpen
            ? 'w-[min(27.25rem,100vw)]'
            : 'w-14'
        }`}
      >
        {/* Rail icons — always mounted, faded out when panel is open so the width transition has no DOM swap */}
        <nav
          className={`absolute inset-y-0 left-0 flex w-14 flex-shrink-0 flex-col bg-background transition-opacity duration-200 ${
            isOpen ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
          aria-label="Chat navigation"
          aria-hidden={isOpen}
        >
          <div className="flex flex-1 flex-col items-center gap-1.5 py-4">{railIcons}</div>
        </nav>

        {/* Expanded panel — always mounted, faded in when open */}
        <div
          className={`flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden transition-opacity duration-200 ${
            isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
            {/* One surface: paired icon + section rows (no vertical rule between icon column and body). */}
            <div className="side-panel-scroll-area relative min-h-0 flex-1">
              <div
                id="side-panel-scroll"
                className="side-panel-scroll h-full overflow-y-auto pb-6"
                role="region"
                aria-label="Conversations and sections"
              >
                {/* Chats header — toggle button + title aligned in one row */}
                <div className="px-2 pt-2 pb-1">
                  <Tooltip content="Hide chats" side="right">
                    <button
                      type="button"
                      onClick={onToggleSidePanel}
                      aria-pressed
                      aria-label="Close conversations"
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.04]"
                    >
                      <SidebarPanelIcon className="h-5 w-5 text-foreground" />
                      <h2 className="font-sans text-lg font-semibold text-foreground">Chats</h2>
                    </button>
                  </Tooltip>
                </div>

                {/* Full-width new chat row — icon + label as one clickable surface */}
                <div id="side-panel-section-new" className="scroll-mt-2 px-2 py-1">
                  <button
                    type="button"
                    onClick={onNewChatKeen}
                    aria-label="New chat with Keen"
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.04]"
                  >
                    <RailIconNewChat className="h-5 w-5 text-foreground" />
                    <span className="font-sans text-sm font-medium text-foreground">New chat</span>
                  </button>
                </div>

                <div
                  id="side-panel-section-temporary"
                  className="scroll-mt-2 px-2 py-1"
                >
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <RailIconTemporary className="h-5 w-5 text-foreground" />
                    <span className="font-sans text-sm font-medium text-foreground">Temporary</span>
                  </div>
                  <div className="pl-2 pr-2">
                    {temporaryChats.length > 0 ? (
                      <div className="space-y-1">
                        {temporaryChats.map((chat) => {
                          const isActive = selectedTempChatId === chat.id;
                          return (
                            <div
                              key={chat.id}
                              className={`group flex items-center gap-3 rounded-xl px-3 py-1.5 transition-colors ${
                                isActive ? 'bg-foreground/[0.06]' : 'hover:bg-foreground/[0.04]'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => onSelectTemporaryChat(chat.id)}
                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                              >
                                <span className="min-w-0 flex-1 truncate font-sans text-sm text-foreground">
                                  {chat.title}
                                </span>
                                <span className="flex-shrink-0 font-sans text-[11px] text-muted">
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
                    ) : (
                      <p className="font-sans text-xs text-muted">No temporary chats.</p>
                    )}
                  </div>
                </div>

                <div id="side-panel-section-all-chats" className="scroll-mt-2 px-2 py-1">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <RailIconAllChats className="h-5 w-5 text-foreground" />
                    <span className="font-sans text-sm font-medium text-foreground">All chats</span>
                  </div>
                  <div className="pb-6">{mentorList}</div>
                </div>
              </div>

            </div>

            <div className="border-t border-border-subtle px-4 py-2">
              <div className="flex items-center justify-between gap-3 px-3 py-0.5">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-[11px] font-semibold text-foreground">
                    {profileInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-sans text-sm text-foreground">{profileName}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    router.push('/settings');
                    onClose();
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                  aria-label="Open settings"
                  title="Open settings"
                >
                  <svg
                    className="h-[26px] w-[26px] translate-x-[1px] text-muted"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 3.75v2.1M12 18.15v2.1M3.75 12h2.1M18.15 12h2.1M6.17 6.17l1.48 1.48M16.35 16.35l1.48 1.48M17.83 6.17l-1.48 1.48M7.65 16.35l-1.48 1.48"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.65a5.35 5.35 0 100 10.7 5.35 5.35 0 000-10.7z"
                    />
                    <circle cx="12" cy="12" r="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
        </div>
      </div>

      <style jsx>{`
        .side-panel-scroll {
          scrollbar-width: none;
        }

        .side-panel-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </>
  );
}
