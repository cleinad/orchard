'use client';

import {
  useEffect,
  useCallback,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import SidebarPanelIcon from '@/app/components/SidebarPanelIcon';
import Tooltip from '@/app/components/Tooltip';
import {
  RailIconAllChats,
  RailIconNewChat,
  RailIconTemporary,
  RailIconWorkspace,
} from '@/app/home/components/home-rail-icons';
import {
  SIDE_PANEL_COLLAPSED_WIDTH_PX,
  SIDE_PANEL_MAX_WIDTH_PX,
  SIDE_PANEL_MIN_WIDTH_PX,
  clampSidePanelWidthPx,
} from '@/app/home/components/SidePanelContext';
import { useViewerIdentity } from '@/app/components/useViewerIdentity';
import { initialsFor } from '@/lib/mentors/ui-helpers';
import type {
  ConversationListItem,
  SidebarWorkspaceGroup,
} from '@/app/home/types';

interface DraftChatListItem {
  id: string;
  mentor_id: string | null;
  workspace_id: string | null;
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
  sidePanelWidthPx: number;
  onClose: () => void;
  onToggleSidePanel: () => void;
  onSidePanelWidthChange: (widthPx: number) => void;
  onNewChatKeen: () => void;
  onOpenWorkspacesSection: () => void;
  onOpenTemporarySection: () => void;
  onOpenAllChats: () => void;
  workspaceGroups: SidebarWorkspaceGroup[];
  conversations: ConversationListItem[];
  draftChats: DraftChatListItem[];
  temporaryChats: TemporaryChatListItem[];
  selectedConversationId: string | null;
  selectedDraftId: string | null;
  selectedTempChatId: string | null;
  selectedMentorId: string | null;
  selectedWorkspaceId: string | null;
  onSelectConversation: (conversation: ConversationListItem) => void;
  onSelectDraft: (draftId: string) => void;
  onSelectTemporaryChat: (tempChatId: string) => void;
  onCreateWorkspaceDraft: (workspaceId: string) => void;
  onCreateWorkspace: () => void;
  onOpenWorkspace: (workspaceId: string) => void;
  onCloseTemporaryChat: (tempChatId: string) => void;
  onMoveConversation: (
    conversation: ConversationListItem,
    targetWorkspaceId: string | null
  ) => Promise<void>;
}

function getWorkspaceKey(workspaceId: string) {
  return `workspace:${workspaceId}`;
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
const CHAT_LIST_KEY = '__chats__';
const GLOBAL_DROP_TARGET_KEY = 'global';

export default function SidePanel({
  isOpen,
  sidePanelWidthPx,
  onClose,
  onToggleSidePanel,
  onSidePanelWidthChange,
  onNewChatKeen,
  onOpenWorkspacesSection,
  onOpenTemporarySection,
  onOpenAllChats,
  workspaceGroups,
  conversations,
  draftChats,
  temporaryChats,
  selectedConversationId,
  selectedDraftId,
  selectedTempChatId,
  selectedMentorId,
  selectedWorkspaceId,
  onSelectConversation,
  onSelectDraft,
  onSelectTemporaryChat,
  onCreateWorkspaceDraft,
  onCreateWorkspace,
  onOpenWorkspace,
  onCloseTemporaryChat,
  onMoveConversation,
}: Props) {
  const router = useRouter();
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<string, boolean>>({});
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [draggedConversation, setDraggedConversation] = useState<ConversationListItem | null>(null);
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null);
  const [movingConversationId, setMovingConversationId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    conversation: ConversationListItem;
    targetWorkspaceId: string | null;
  } | null>(null);
  const { viewer } = useViewerIdentity();
  const profileName = viewer?.fullName || viewer?.email || 'Your profile';
  const profileInitials = initialsFor(profileName);
  const panelStyle = {
    '--side-panel-width': `${sidePanelWidthPx}px`,
  } as CSSProperties;

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
    if (!selectedMentorId && !selectedWorkspaceId && !selectedDraftId && !selectedConversationId) {
      return;
    }

    if (selectedWorkspaceId) {
      const workspaceKey = getWorkspaceKey(selectedWorkspaceId);
      const draftByWorkspaceKey = new Map(
        draftChats
          .filter((draft) => draft.workspace_id)
          .map((draft) => [getWorkspaceKey(draft.workspace_id!), draft])
      );
      const group = workspaceGroups.find((entry) => entry.workspace_id === selectedWorkspaceId);
      if (!group) return;

      setExpandedWorkspaces((prev) => ({ ...prev, [workspaceKey]: true }));

      const items = [
        ...(draftByWorkspaceKey.get(workspaceKey)
          ? [{ kind: 'draft' as const, id: draftByWorkspaceKey.get(workspaceKey)!.id }]
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
          [workspaceKey]: Math.max(prev[workspaceKey] ?? 3, minimumVisible),
        }));
      }

      return;
    }

    if (selectedMentorId) {
      return;
    }

    const globalDraft = draftChats.find((draft) => !draft.workspace_id && !draft.mentor_id);
    const globalConversations = conversations.filter(
      (conversation) => !conversation.workspace_id && !conversation.mentor_id
    );

    const items = [
      ...(globalDraft
        ? [{ kind: 'draft' as const, id: globalDraft.id }]
        : []),
      ...globalConversations.map((conversation) => ({
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
        [CHAT_LIST_KEY]: Math.max(prev[CHAT_LIST_KEY] ?? 10, minimumVisible),
      }));
    }
  }, [
    conversations,
    draftChats,
    selectedConversationId,
    selectedDraftId,
    selectedMentorId,
    selectedWorkspaceId,
    workspaceGroups,
  ]);

  const draftByWorkspaceKey = new Map(
    draftChats
      .filter((draft) => draft.workspace_id)
      .map((draft) => [getWorkspaceKey(draft.workspace_id!), draft])
  );
  const globalDraft = draftChats.find((draft) => !draft.workspace_id && !draft.mentor_id) || null;
  const globalConversations = conversations.filter(
    (conversation) => !conversation.workspace_id && !conversation.mentor_id
  );
  const visibleChatCount = visibleCounts[CHAT_LIST_KEY] ?? 10;
  const visibleGlobalConversations = globalConversations.slice(0, visibleChatCount);
  const hasMoreGlobalConversations = globalConversations.length > visibleGlobalConversations.length;

  const getDropTargetKey = (workspaceId: string | null) =>
    workspaceId ? getWorkspaceKey(workspaceId) : GLOBAL_DROP_TARGET_KEY;

  const canDropConversation = (
    conversation: ConversationListItem | null,
    targetWorkspaceId: string | null
  ) => {
    if (!conversation || conversation.mentor_id) return false;
    return (conversation.workspace_id ?? null) !== targetWorkspaceId;
  };

  const performConversationMove = useCallback(
    async (conversation: ConversationListItem, targetWorkspaceId: string | null) => {
      setMovingConversationId(conversation.id);
      setMoveError(null);

      try {
        await onMoveConversation(conversation, targetWorkspaceId);
        if (targetWorkspaceId) {
          const workspaceKey = getWorkspaceKey(targetWorkspaceId);
          setExpandedWorkspaces((prev) => ({ ...prev, [workspaceKey]: true }));
        }
        setPendingMove(null);
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Could not move chat.');
      } finally {
        setMovingConversationId(null);
        setDraggedConversation(null);
        setActiveDropTarget(null);
      }
    },
    [onMoveConversation]
  );

  const handleStartResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isOpen || !window.matchMedia('(min-width: 1024px)').matches) {
        return;
      }

      const previousBodyCursor = document.body.style.cursor;
      const previousBodyUserSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        onSidePanelWidthChange(clampSidePanelWidthPx(moveEvent.clientX));
      };

      const handlePointerUp = () => {
        document.body.style.cursor = previousBodyCursor;
        document.body.style.userSelect = previousBodyUserSelect;
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
      event.preventDefault();
    },
    [isOpen, onSidePanelWidthChange]
  );

  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!isOpen) {
        return;
      }

      if (event.key === 'Home') {
        onSidePanelWidthChange(SIDE_PANEL_MIN_WIDTH_PX);
        event.preventDefault();
        return;
      }

      if (event.key === 'End') {
        onSidePanelWidthChange(SIDE_PANEL_MAX_WIDTH_PX);
        event.preventDefault();
        return;
      }

      const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (direction === 0) {
        return;
      }

      const step = event.shiftKey ? 24 : 12;
      onSidePanelWidthChange(sidePanelWidthPx + direction * step);
      event.preventDefault();
    },
    [isOpen, onSidePanelWidthChange, sidePanelWidthPx]
  );

  const handleConversationDrop = (
    event: DragEvent<HTMLElement>,
    targetWorkspaceId: string | null
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const conversation = draggedConversation;
    if (!conversation || !canDropConversation(conversation, targetWorkspaceId)) {
      setActiveDropTarget(null);
      return;
    }

    if (targetWorkspaceId === null && conversation.workspace_id) {
      setPendingMove({ conversation, targetWorkspaceId });
      setActiveDropTarget(null);
      setDraggedConversation(null);
      return;
    }

    void performConversationMove(conversation, targetWorkspaceId);
  };

  const handleDropTargetDragOver = (
    event: DragEvent<HTMLElement>,
    targetWorkspaceId: string | null
  ) => {
    if (!canDropConversation(draggedConversation, targetWorkspaceId)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setActiveDropTarget(getDropTargetKey(targetWorkspaceId));
  };

  const handleDropTargetDragLeave = (
    event: DragEvent<HTMLElement>,
    targetWorkspaceId: string | null
  ) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setActiveDropTarget((current) =>
      current === getDropTargetKey(targetWorkspaceId) ? null : current
    );
  };

  const getConversationDragProps = (conversation: ConversationListItem) => ({
    draggable: !conversation.mentor_id && movingConversationId !== conversation.id,
    onDragStart: (event: DragEvent<HTMLButtonElement>) => {
      if (conversation.mentor_id || movingConversationId === conversation.id) {
        event.preventDefault();
        return;
      }

      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', conversation.id);
      setDraggedConversation(conversation);
      setMoveError(null);
    },
    onDragEnd: () => {
      setDraggedConversation(null);
      setActiveDropTarget(null);
    },
    'data-testid': `conversation-row-${conversation.id}`,
  });

  const getDropTargetClass = (workspaceId: string | null) => {
    const isActive = activeDropTarget === getDropTargetKey(workspaceId);
    return isActive
      ? 'outline outline-2 outline-foreground/30 bg-foreground/[0.06]'
      : '';
  };

  const renderWorkspaceIcon = (group: SidebarWorkspaceGroup) => (
    <span
      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-xs"
      style={{
        backgroundColor: group.workspace_accent_color
          ? `${group.workspace_accent_color}22`
          : 'var(--surface-muted)',
        color: group.workspace_accent_color || 'var(--muted)',
      }}
    >
      {group.workspace_icon || <RailIconWorkspace className="h-3.5 w-3.5" />}
    </span>
  );

  const workspaceList = (
    <div className="pb-3">
      {workspaceGroups.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted">No workspaces yet.</div>
      ) : (
        workspaceGroups.map((group) => {
          const workspaceKey = getWorkspaceKey(group.workspace_id);
          const draft = draftByWorkspaceKey.get(workspaceKey) || null;
          const isExpanded = expandedWorkspaces[workspaceKey] || false;
          const visibleCount = visibleCounts[workspaceKey] ?? 3;
          const visibleConversations = isExpanded
            ? group.conversations.slice(0, visibleCount)
            : [];
          const hasMore = group.conversations.length > visibleConversations.length;
          const isSelectedWorkspace =
            selectedWorkspaceId === group.workspace_id && selectedMentorId === null;

          return (
            <div key={workspaceKey} className="py-px">
              <div
                onDragOver={(event) => handleDropTargetDragOver(event, group.workspace_id)}
                onDragLeave={(event) => handleDropTargetDragLeave(event, group.workspace_id)}
                onDrop={(event) => handleConversationDrop(event, group.workspace_id)}
                data-testid={`workspace-drop-target-${group.workspace_id}`}
                className={`flex items-center gap-2 rounded-xl px-3 py-1 transition-colors ${
                  isSelectedWorkspace ? 'bg-foreground/[0.05]' : 'hover:bg-foreground/[0.03]'
                } ${getDropTargetClass(group.workspace_id)}`}
              >
                <button
                  type="button"
                  onClick={() => onOpenWorkspace(group.workspace_id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  {renderWorkspaceIcon(group)}
                  <span className="min-w-0 flex-1 truncate font-sans text-[15px] text-foreground">
                    {group.workspace_name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedWorkspaces((prev) => ({
                      ...prev,
                      [workspaceKey]: !isExpanded,
                    }))
                  }
                  className="inline-flex h-[1.625rem] w-[1.625rem] flex-shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${group.workspace_name}`}
                >
                  <svg
                    className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5.25L15 12l-6 6.75" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onCreateWorkspaceDraft(group.workspace_id)}
                  className="inline-flex h-[1.625rem] w-[1.625rem] flex-shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                  aria-label={`New chat in ${group.workspace_name}`}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>

              {isExpanded && (
                <div className="ml-6 mt-px space-y-px border-l border-border-subtle/80 pl-4">
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
                      {...getConversationDragProps(conversation)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-left transition-colors ${
                        selectedConversationId === conversation.id
                          ? 'bg-foreground/[0.06]'
                          : 'hover:bg-foreground/[0.04]'
                      } ${movingConversationId === conversation.id ? 'opacity-60' : ''}`}
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
                              [workspaceKey]:
                                (prev[workspaceKey] ?? 3) <= 3
                                  ? 10
                                  : (prev[workspaceKey] ?? 3) + 10,
                            }))
                          }
                          className="text-[11px] font-sans font-medium tracking-wide text-muted transition-colors hover:text-foreground"
                        >
                          Show more
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleCounts((prev) => ({
                              ...prev,
                              [workspaceKey]: 3,
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
        })
      )}
    </div>
  );

  const chatList = (
    <div className="space-y-px pb-6">
      {!globalDraft && globalConversations.length === 0 ? (
        <p className="px-3 py-2 font-sans text-xs text-muted">No chats yet.</p>
      ) : (
        <>
          {globalDraft && (
            <button
              type="button"
              onClick={() => onSelectDraft(globalDraft.id)}
              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-left transition-colors ${
                selectedDraftId === globalDraft.id
                  ? 'bg-foreground/[0.06]'
                  : 'hover:bg-foreground/[0.04]'
              }`}
            >
              <span className="truncate font-sans text-sm text-foreground">{globalDraft.title}</span>
              <span className="flex-shrink-0 font-sans text-[11px] text-muted">
                {formatDate(globalDraft.updated_at)}
              </span>
            </button>
          )}

          {visibleGlobalConversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelectConversation(conversation)}
              {...getConversationDragProps(conversation)}
              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-left transition-colors ${
                selectedConversationId === conversation.id
                  ? 'bg-foreground/[0.06]'
                  : 'hover:bg-foreground/[0.04]'
              } ${movingConversationId === conversation.id ? 'opacity-60' : ''}`}
            >
              <span className="truncate font-sans text-sm text-foreground/88">
                {conversation.title}
              </span>
              <span className="flex-shrink-0 font-sans text-[11px] text-muted">
                {formatDate(conversation.updated_at)}
              </span>
            </button>
          ))}

          {globalConversations.length > 10 && (
            <div className="flex items-center gap-3 px-3 pt-1">
              {hasMoreGlobalConversations ? (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCounts((prev) => ({
                      ...prev,
                      [CHAT_LIST_KEY]:
                        (prev[CHAT_LIST_KEY] ?? 10) + 10,
                    }))
                  }
                  className="text-[11px] font-sans font-medium tracking-wide text-muted transition-colors hover:text-foreground"
                >
                  Show more
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCounts((prev) => ({
                      ...prev,
                      [CHAT_LIST_KEY]: 10,
                    }))
                  }
                  className="text-[11px] font-medium tracking-wide text-muted transition-colors hover:text-foreground"
                >
                  Show less
                </button>
              )}
            </div>
          )}
        </>
      )}
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
      <Tooltip content="Workspaces" side="right">
        <button
          type="button"
          onClick={onOpenWorkspacesSection}
          className={railIconButtonClass}
          aria-label="Workspaces"
        >
          <RailIconWorkspace className="h-5 w-5 text-foreground" />
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
      <Tooltip content="Chats" side="right">
        <button
          type="button"
          onClick={onOpenAllChats}
          className={railIconButtonClass}
          aria-label="Chats"
        >
          <RailIconAllChats className="h-5 w-5 text-foreground" />
        </button>
      </Tooltip>
    </>
  );

  return (
    <>
      {pendingMove && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/[0.18] px-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !movingConversationId) {
              setPendingMove(null);
            }
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape' && !movingConversationId) {
              setPendingMove(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-chat-title"
            className="w-full max-w-sm rounded-lg border border-border-subtle bg-background p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="move-chat-title" className="font-sans text-base font-semibold text-foreground">
                  Move this chat to Chats?
                </h2>
                <p className="mt-2 font-sans text-sm leading-5 text-muted">
                  Existing workspace memories from this chat will stay in the workspace and will not
                  become global.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingMove(null)}
                disabled={movingConversationId !== null}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingMove(null)}
                disabled={movingConversationId !== null}
                className="rounded-lg border border-border-subtle bg-surface px-3 py-2 font-sans text-sm font-semibold text-foreground transition hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  void performConversationMove(
                    pendingMove.conversation,
                    pendingMove.targetWorkspaceId
                  )
                }
                disabled={movingConversationId !== null}
                className="rounded-lg bg-foreground px-3 py-2 font-sans text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {movingConversationId ? 'Moving...' : 'Move chat'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`fixed inset-0 z-40 bg-foreground/[0.06] backdrop-blur-sm transition-opacity duration-300 dark:bg-black/40 lg:hidden ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden
      />

      <div
        data-open={isOpen}
        className="side-panel-shell fixed left-0 top-0 z-50 flex h-dvh overflow-hidden border-r border-foreground/[0.06] bg-background transition-[width] duration-300 ease-out dark:border-foreground/[0.08]"
        style={panelStyle}
      >
        {/* Rail icons — always mounted, faded out when panel is open so the width transition has no DOM swap */}
        <nav
          className={`absolute inset-y-0 left-0 flex w-14 flex-shrink-0 flex-col bg-background transition-opacity duration-300 ${
            isOpen ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
          aria-label="Chat navigation"
          aria-hidden={isOpen}
        >
          <div className="flex flex-1 flex-col items-center gap-1.5 py-4">{railIcons}</div>
        </nav>

        {/* Expanded panel — always mounted, faded in when open */}
        <div
          className={`flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden transition-opacity duration-300 ${
            isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
            {/* One surface: paired icon + section rows (no vertical rule between icon column and body). */}
            <div className="side-panel-scroll-area relative min-h-0 flex-1">
              <div
                id="side-panel-scroll"
                className="side-panel-scroll h-full overflow-y-auto pt-4 pb-6"
                role="region"
                aria-label="Conversations and sections"
              >
                {/* Header rows — flex column with gap-1.5 + h-10 per row to mirror collapsed rail exactly */}
                <div className="flex flex-col gap-1.5">
                {/* Chats header — w-14 icon zone mirrors the collapsed rail column exactly */}
                <Tooltip content="Hide chats" side="right">
                  <button
                    type="button"
                    onClick={onToggleSidePanel}
                    aria-pressed
                    aria-label="Close conversations"
                    className="flex h-10 w-full items-center text-left transition-colors hover:bg-foreground/[0.04]"
                  >
                    <div className="flex w-14 flex-shrink-0 items-center justify-center">
                      <SidebarPanelIcon className="h-5 w-5 text-foreground" />
                    </div>
                    <h2 className="font-sans text-lg font-semibold text-foreground">Chats</h2>
                  </button>
                </Tooltip>

                {/* New chat row — same w-14 icon zone */}
                <div id="side-panel-section-new" className="scroll-mt-2">
                  <button
                    type="button"
                    onClick={onNewChatKeen}
                    aria-label="New chat with Keen"
                    className="flex h-10 w-full items-center text-left transition-colors hover:bg-foreground/[0.04]"
                  >
                    <div className="flex w-14 flex-shrink-0 items-center justify-center">
                      <RailIconNewChat className="h-5 w-5 text-foreground" />
                    </div>
                    <span className="font-sans text-sm font-medium text-foreground">New chat</span>
                  </button>
                </div>

                <div id="side-panel-section-workspaces" className="scroll-mt-2">
                  <div className="flex h-10 w-full items-center">
                    <div className="flex w-14 flex-shrink-0 items-center justify-center">
                      <RailIconWorkspace className="h-5 w-5 text-foreground" />
                    </div>
                    <span className="font-sans text-sm font-medium text-foreground">Workspaces</span>
                    <button
                      type="button"
                      onClick={onCreateWorkspace}
                      className="ml-auto mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                      aria-label="New workspace"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </button>
                  </div>
                  <div className="pl-14 pr-2">
                    {workspaceList}
                  </div>
                </div>

                {moveError && (
                  <p
                    className="ml-14 mr-5 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 font-sans text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
                    role="alert"
                  >
                    {moveError}
                  </p>
                )}

                <div
                  id="side-panel-section-temporary"
                  className="scroll-mt-2"
                >
                  <div className="flex h-10 w-full items-center">
                    <div className="flex w-14 flex-shrink-0 items-center justify-center">
                      <RailIconTemporary className="h-5 w-5 text-foreground" />
                    </div>
                    <span className="font-sans text-sm font-medium text-foreground">Temporary</span>
                  </div>
                  <div className="pl-14 pr-2">
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
                                aria-label={`Temp ${chat.title}`}
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

                <div id="side-panel-section-all-chats" className="scroll-mt-2">
                  <div
                    className={`flex h-10 w-full items-center transition-colors ${getDropTargetClass(null)}`}
                    onDragOver={(event) => handleDropTargetDragOver(event, null)}
                    onDragLeave={(event) => handleDropTargetDragLeave(event, null)}
                    onDrop={(event) => handleConversationDrop(event, null)}
                    data-testid="global-drop-target"
                  >
                    <div className="flex w-14 flex-shrink-0 items-center justify-center">
                      <RailIconAllChats className="h-5 w-5 text-foreground" />
                    </div>
                    <span className="font-sans text-sm font-medium text-foreground">Chats</span>
                    <button
                      type="button"
                      onClick={onNewChatKeen}
                      className="ml-auto mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                      aria-label="New chat"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </button>
                  </div>
                  <div className="pl-14 pb-6 pr-2">
                    {chatList}
                  </div>
                </div>
                </div>{/* end header rows */}
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

        <div
          role="separator"
          aria-label="Resize conversations sidebar"
          aria-orientation="vertical"
          aria-valuemin={SIDE_PANEL_MIN_WIDTH_PX}
          aria-valuemax={SIDE_PANEL_MAX_WIDTH_PX}
          aria-valuenow={sidePanelWidthPx}
          tabIndex={isOpen ? 0 : -1}
          data-testid="side-panel-resize-handle"
          onPointerDown={handleStartResize}
          onKeyDown={handleResizeKeyDown}
          className={`group absolute inset-y-0 right-[-3px] z-20 hidden w-2 cursor-col-resize items-stretch justify-center outline-none lg:flex ${
            isOpen ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <span className="my-4 w-px rounded-full bg-transparent transition-colors group-hover:bg-foreground/20 group-focus-visible:bg-foreground/30" />
        </div>
      </div>

      <style jsx>{`
        .side-panel-shell {
          width: ${SIDE_PANEL_COLLAPSED_WIDTH_PX}px;
        }

        .side-panel-shell[data-open='true'] {
          width: min(21.8rem, 100vw);
        }

        @media (min-width: 1024px) {
          .side-panel-shell[data-open='true'] {
            width: min(var(--side-panel-width), calc(100vw - 5rem));
          }
        }

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
