'use client';

import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SidebarPanelIcon from '@/app/components/SidebarPanelIcon';
import Tooltip from '@/app/components/Tooltip';
import {
  RailIconAllChats,
  RailIconNewChat,
  RailIconTemporary,
  RailIconWorkspace,
} from '@/app/home/components/home-rail-icons';
import { buttonStyles, cx } from '@/app/components/buttonStyles';
import {
  SIDE_PANEL_COLLAPSED_WIDTH_PX,
  SIDE_PANEL_MAX_WIDTH_PX,
  SIDE_PANEL_MIN_WIDTH_PX,
  clampSidePanelWidthPx,
} from '@/app/home/components/SidePanelContext';
import { useViewer } from '@/app/components/ViewerContext';
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
  onOpen: () => void;
  onToggleSidePanel: () => void;
  onSidePanelWidthChange: (widthPx: number) => void;
  onNewChat: () => void;
  onOpenWorkspacesSection: () => void;
  onOpenTemporarySection: () => void;
  onCreateTemporaryChat: () => void;
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
  buildWorkspaceHref: (workspaceId: string) => string;
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

function getWorkspaceSelectionKey(
  workspaceKey: string,
  selectedDraftId: string | null,
  selectedConversationId: string | null
) {
  if (selectedDraftId) return `${workspaceKey}:draft:${selectedDraftId}`;
  if (selectedConversationId) return `${workspaceKey}:conversation:${selectedConversationId}`;
  return null;
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
  cx(
    'relative z-10 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-foreground',
    buttonStyles.transition,
    buttonStyles.focus,
    buttonStyles.navRowHover
  );
const CHAT_LIST_KEY = '__chats__';
const GLOBAL_DROP_TARGET_KEY = 'global';
const SIDE_PANEL_DESKTOP_MEDIA_QUERY = '(min-width: 768px)';
type ExpandedSectionKey = 'workspaces' | 'temporary' | 'chats';

const DEFAULT_EXPANDED_SECTIONS: Record<ExpandedSectionKey, boolean> = {
  workspaces: true,
  temporary: true,
  chats: true,
};

function SectionCaret({ expanded }: { expanded: boolean }) {
  return (
    <span className="inline-flex h-[1.625rem] w-[1.625rem] flex-shrink-0 items-center justify-center rounded-full text-muted transition-colors group-hover:bg-foreground/[0.05] group-hover:text-foreground">
      <svg
        className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5.25L15 12l-6 6.75" />
      </svg>
    </span>
  );
}

export default function SidePanel({
  isOpen,
  sidePanelWidthPx,
  onClose,
  onOpen,
  onToggleSidePanel,
  onSidePanelWidthChange,
  onNewChat,
  onOpenWorkspacesSection,
  onOpenTemporarySection,
  onCreateTemporaryChat,
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
  buildWorkspaceHref,
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
  const [expandedSections, setExpandedSections] = useState(DEFAULT_EXPANDED_SECTIONS);
  const lastAutoExpandedWorkspaceSelectionRef = useRef<string | null>(null);
  const manuallyCollapsedWorkspaceSelectionRef = useRef<Record<string, string>>({});
  const { viewerResult } = useViewer();
  const profileName =
    viewerResult.status === 'ready'
      ? viewerResult.viewer.fullName
        || viewerResult.viewer.email
        || 'Your profile'
      : viewerResult.viewer.email || 'Your profile';
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
        const selectedItem = items[selectedIndex];
        const autoExpandKey = `${workspaceKey}:${selectedItem.kind}:${selectedItem.id}`;
        if (
          lastAutoExpandedWorkspaceSelectionRef.current !== autoExpandKey &&
          manuallyCollapsedWorkspaceSelectionRef.current[workspaceKey] !== autoExpandKey
        ) {
          lastAutoExpandedWorkspaceSelectionRef.current = autoExpandKey;
          delete manuallyCollapsedWorkspaceSelectionRef.current[workspaceKey];
          setExpandedWorkspaces((prev) => ({ ...prev, [workspaceKey]: true }));
        }

        const minimumVisible = selectedIndex < 3 ? 3 : Math.max(10, selectedIndex + 1);
        setVisibleCounts((prev) => ({
          ...prev,
          [workspaceKey]: Math.max(prev[workspaceKey] ?? 3, minimumVisible),
        }));
      }

      return;
    }

    if (selectedMentorId) {
      lastAutoExpandedWorkspaceSelectionRef.current = null;
      return;
    }

    lastAutoExpandedWorkspaceSelectionRef.current = null;

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
      if (!isOpen || !window.matchMedia(SIDE_PANEL_DESKTOP_MEDIA_QUERY).matches) {
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

  const handleCollapsedRailClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (isOpen) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('button, a, [role="button"]')) {
        return;
      }

      onOpen();
    },
    [isOpen, onOpen]
  );

  const handleRailPanelButtonClick = useCallback(() => {
    if (isOpen) {
      onToggleSidePanel();
      return;
    }

    onOpen();
  }, [isOpen, onOpen, onToggleSidePanel]);

  const expandSection = useCallback((section: ExpandedSectionKey) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: true,
    }));
  }, []);

  const toggleSection = useCallback((section: ExpandedSectionKey) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  const handleOpenWorkspacesFromRail = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      expandSection('workspaces');
      onOpenWorkspacesSection();
    },
    [expandSection, onOpenWorkspacesSection]
  );

  const handleOpenTemporaryFromRail = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      expandSection('temporary');
      onOpenTemporarySection();
    },
    [expandSection, onOpenTemporarySection]
  );

  const handleCreateTemporaryFromSection = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      expandSection('temporary');
      onCreateTemporaryChat();
    },
    [expandSection, onCreateTemporaryChat]
  );

  const handleOpenChatsFromRail = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      expandSection('chats');
      onOpenAllChats();
    },
    [expandSection, onOpenAllChats]
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

  const prefetchWorkspace = (href: string) => {
    // Dynamic routes are only partially prefetched by default. The full mode
    // includes the selected workspace detail so a subsequent click can render
    // without waiting on a route request.
    router.prefetch(
      href,
      { kind: 'full' } as NonNullable<Parameters<typeof router.prefetch>[1]>
    );
  };

  const workspaceList = (
    <div className="pb-3">
      {workspaceGroups.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted">No workspaces yet.</div>
      ) : (
        workspaceGroups.map((group) => {
          const workspaceKey = getWorkspaceKey(group.workspace_id);
          const workspaceHref = buildWorkspaceHref(group.workspace_id);
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
                className={cx(
                  'mr-2 flex items-center gap-2 rounded-xl px-3 py-1',
                  buttonStyles.transition,
                  isSelectedWorkspace ? 'bg-foreground/[0.05]' : 'hover:bg-foreground/[0.03]',
                  getDropTargetClass(group.workspace_id)
                )}
              >
                <Link
                  href={workspaceHref}
                  prefetch={false}
                  onPointerEnter={() => prefetchWorkspace(workspaceHref)}
                  onFocus={() => prefetchWorkspace(workspaceHref)}
                  onClick={(event) => {
                    if (
                      event.defaultPrevented
                      || event.button !== 0
                      || event.metaKey
                      || event.ctrlKey
                      || event.shiftKey
                      || event.altKey
                    ) {
                      return;
                    }
                    onOpenWorkspace(group.workspace_id);
                  }}
                  className={cx(
                    'flex min-w-0 flex-1 items-center gap-3 text-left',
                    buttonStyles.focus
                  )}
                >
                  {renderWorkspaceIcon(group)}
                  <span className="min-w-0 flex-1 truncate font-sans text-[15px] text-foreground">
                    {group.workspace_name}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    const nextExpanded = !isExpanded;
                    const selectedWorkspaceKey =
                      selectedWorkspaceId === group.workspace_id
                        ? getWorkspaceSelectionKey(
                            workspaceKey,
                            selectedDraftId,
                            selectedConversationId
                          )
                        : null;
                    if (nextExpanded || !selectedWorkspaceKey) {
                      delete manuallyCollapsedWorkspaceSelectionRef.current[workspaceKey];
                    } else {
                      manuallyCollapsedWorkspaceSelectionRef.current[workspaceKey] =
                        selectedWorkspaceKey;
                    }
                    setExpandedWorkspaces((prev) => ({
                      ...prev,
                      [workspaceKey]: nextExpanded,
                    }));
                  }}
                  className={cx(
                    'inline-flex h-[1.625rem] w-[1.625rem] flex-shrink-0 items-center justify-center rounded-full',
                    buttonStyles.transition,
                    buttonStyles.focus,
                    buttonStyles.ghost
                  )}
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
                  className={cx(
                    'inline-flex h-[1.625rem] w-[1.625rem] flex-shrink-0 items-center justify-center rounded-full',
                    buttonStyles.transition,
                    buttonStyles.focus,
                    buttonStyles.ghost
                  )}
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
                      className={cx(
                        'mr-2 flex w-[calc(100%-0.5rem)] items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-left',
                        buttonStyles.transition,
                        buttonStyles.focus,
                        selectedDraftId === draft.id
                          ? buttonStyles.listRowSelected
                          : buttonStyles.listRowHover
                      )}
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
                      className={cx(
                        'mr-2 flex w-[calc(100%-0.5rem)] items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-left',
                        buttonStyles.transition,
                        buttonStyles.focus,
                        selectedConversationId === conversation.id
                          ? buttonStyles.listRowSelected
                          : buttonStyles.listRowHover,
                        movingConversationId === conversation.id ? 'opacity-60' : null
                      )}
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
                          className={cx(
                            'text-[11px] font-sans font-medium tracking-wide',
                            buttonStyles.transition,
                            buttonStyles.focus,
                            buttonStyles.ghostQuiet
                          )}
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
                          className={cx(
                            'text-[11px] font-medium tracking-wide',
                            buttonStyles.transition,
                            buttonStyles.focus,
                            buttonStyles.ghostQuiet
                          )}
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
              className={cx(
                'mr-2 flex w-[calc(100%-0.5rem)] items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-left',
                buttonStyles.transition,
                buttonStyles.focus,
                selectedDraftId === globalDraft.id
                  ? buttonStyles.listRowSelected
                  : buttonStyles.listRowHover
              )}
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
              className={cx(
                'mr-2 flex w-[calc(100%-0.5rem)] items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-left',
                buttonStyles.transition,
                buttonStyles.focus,
                selectedConversationId === conversation.id
                  ? buttonStyles.listRowSelected
                  : buttonStyles.listRowHover,
                movingConversationId === conversation.id ? 'opacity-60' : null
              )}
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
                  className={cx(
                    'text-[11px] font-sans font-medium tracking-wide',
                    buttonStyles.transition,
                    buttonStyles.focus,
                    buttonStyles.ghostQuiet
                  )}
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
                  className={cx(
                    'text-[11px] font-medium tracking-wide',
                    buttonStyles.transition,
                    buttonStyles.focus,
                    buttonStyles.ghostQuiet
                  )}
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
          onClick={handleRailPanelButtonClick}
          className={`${railIconButtonClass} ${isOpen ? 'text-foreground' : ''}`}
          aria-pressed={isOpen}
          aria-label={isOpen ? 'Close conversations' : 'Open conversations'}
        >
          <SidebarPanelIcon className="h-5 w-5 text-foreground" />
        </button>
      </Tooltip>
      <Tooltip content="New chat" side="right">
        <button
          type="button"
          onClick={onNewChat}
          className={railIconButtonClass}
          aria-label="New chat with Orchard"
        >
          <RailIconNewChat className="h-5 w-5 text-foreground" />
        </button>
      </Tooltip>
      <Tooltip content="Workspaces" side="right">
        <button
          type="button"
          onClick={handleOpenWorkspacesFromRail}
          className={railIconButtonClass}
          aria-label="Workspaces"
        >
          <RailIconWorkspace className="h-5 w-5 text-foreground" />
        </button>
      </Tooltip>
      <Tooltip content="Temporary" side="right">
        <button
          type="button"
          onClick={handleOpenTemporaryFromRail}
          className={railIconButtonClass}
          aria-label="Temporary chats"
        >
          <RailIconTemporary className="h-5 w-5 text-foreground" />
        </button>
      </Tooltip>
      <Tooltip content="Chats" side="right">
        <button
          type="button"
          onClick={handleOpenChatsFromRail}
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
      <div
        className={`side-panel-backdrop fixed inset-0 z-40 bg-foreground/[0.06] backdrop-blur-sm transition-opacity duration-300 dark:bg-black/40 ${
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
          onClick={handleCollapsedRailClick}
          className={`absolute inset-y-0 left-0 flex w-14 flex-shrink-0 flex-col bg-background transition-opacity duration-300 ${
            isOpen ? 'pointer-events-none opacity-0' : 'cursor-pointer opacity-100'
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
                    className={cx(
                      'flex h-10 w-full items-center text-left',
                      buttonStyles.transition,
                      buttonStyles.focus,
                      buttonStyles.navRowHover
                    )}
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
                    onClick={onNewChat}
                    aria-label="New chat with Orchard"
                    className={cx(
                      'flex h-10 w-full items-center text-left',
                      buttonStyles.transition,
                      buttonStyles.focus,
                      buttonStyles.navRowHover
                    )}
                  >
                    <div className="flex w-14 flex-shrink-0 items-center justify-center">
                      <RailIconNewChat className="h-5 w-5 text-foreground" />
                    </div>
                    <span className="font-sans text-sm font-medium text-foreground">New chat</span>
                  </button>
                </div>

                <div id="side-panel-section-workspaces" className="scroll-mt-2">
                  <div className="flex h-10 w-full items-center">
                    <button
                      type="button"
                      onClick={() => toggleSection('workspaces')}
                      className={cx(
                        'group flex min-w-0 flex-1 items-center self-stretch text-left',
                        buttonStyles.transition,
                        buttonStyles.focus,
                        buttonStyles.navRowHover
                      )}
                      aria-expanded={expandedSections.workspaces}
                      aria-controls="side-panel-workspaces-list"
                    >
                      <div className="flex w-14 flex-shrink-0 items-center justify-center">
                        <RailIconWorkspace className="h-5 w-5 text-foreground" />
                      </div>
                      <span className="font-sans text-sm font-medium text-foreground">Workspaces</span>
                      <span className="ml-2">
                        <SectionCaret expanded={expandedSections.workspaces} />
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={onCreateWorkspace}
                      className={cx(
                        'ml-auto mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full',
                        buttonStyles.transition,
                        buttonStyles.focus,
                        buttonStyles.ghost
                      )}
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
                  {expandedSections.workspaces && (
                    <div id="side-panel-workspaces-list" className="pl-9 pr-0">
                      {workspaceList}
                    </div>
                  )}
                </div>

                {expandedSections.workspaces && moveError && (
                  <p
                    className="ml-11 mr-5 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 font-sans text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
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
                    <button
                      type="button"
                      onClick={() => toggleSection('temporary')}
                      className={cx(
                        'group flex min-w-0 flex-1 items-center self-stretch text-left',
                        buttonStyles.transition,
                        buttonStyles.focus,
                        buttonStyles.navRowHover
                      )}
                      aria-expanded={expandedSections.temporary}
                      aria-controls="side-panel-temporary-list"
                    >
                      <div className="flex w-14 flex-shrink-0 items-center justify-center">
                        <RailIconTemporary className="h-5 w-5 text-foreground" />
                      </div>
                      <span className="font-sans text-sm font-medium text-foreground">Temporary</span>
                      <span className="ml-2">
                        <SectionCaret expanded={expandedSections.temporary} />
                      </span>
                    </button>
                    <Tooltip content="New temporary chat">
                      <button
                        type="button"
                        onClick={handleCreateTemporaryFromSection}
                        className={cx(
                          'mr-3 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                          buttonStyles.transition,
                          buttonStyles.focus,
                          buttonStyles.ghost
                        )}
                        aria-label="New temporary chat"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                      </button>
                    </Tooltip>
                  </div>
                  {expandedSections.temporary && (
                    <div id="side-panel-temporary-list" className="pl-11 pr-2">
                      {temporaryChats.length > 0 ? (
                        <div className="space-y-1">
                          {temporaryChats.map((chat) => {
                            const isActive = selectedTempChatId === chat.id;
                            return (
                              <div
                                key={chat.id}
                                className={cx(
                                  'group mr-2 flex items-center gap-3 rounded-xl px-3 py-1.5',
                                  buttonStyles.transition,
                                  isActive ? buttonStyles.listRowSelected : buttonStyles.listRowHover
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => onSelectTemporaryChat(chat.id)}
                                  aria-label={`Temp ${chat.title}`}
                                  className={cx(
                                    'flex min-w-0 flex-1 items-center gap-3 text-left',
                                    buttonStyles.focus
                                  )}
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
                                  className={cx(
                                    'rounded-full p-1',
                                    buttonStyles.transition,
                                    buttonStyles.focus,
                                    buttonStyles.ghost
                                  )}
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
                        <p className="px-3 font-sans text-xs text-muted">No temporary chats.</p>
                      )}
                    </div>
                  )}
                </div>

                <div id="side-panel-section-all-chats" className="scroll-mt-2">
                  <div
                    className={`flex h-10 w-full items-center transition-colors ${getDropTargetClass(null)}`}
                    onDragOver={(event) => handleDropTargetDragOver(event, null)}
                    onDragLeave={(event) => handleDropTargetDragLeave(event, null)}
                    onDrop={(event) => handleConversationDrop(event, null)}
                    data-testid="global-drop-target"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSection('chats')}
                      className={cx(
                        'group flex min-w-0 flex-1 items-center self-stretch text-left',
                        buttonStyles.transition,
                        buttonStyles.focus,
                        buttonStyles.navRowHover
                      )}
                      aria-expanded={expandedSections.chats}
                      aria-controls="side-panel-chats-list"
                    >
                      <div className="flex w-14 flex-shrink-0 items-center justify-center">
                        <RailIconAllChats className="h-5 w-5 text-foreground" />
                      </div>
                      <span className="font-sans text-sm font-medium text-foreground">Chats</span>
                      <span className="ml-2">
                        <SectionCaret expanded={expandedSections.chats} />
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={onNewChat}
                      className={cx(
                        'ml-auto mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full',
                        buttonStyles.transition,
                        buttonStyles.focus,
                        buttonStyles.ghost
                      )}
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
                  {expandedSections.chats && (
                    <div id="side-panel-chats-list" className="pl-11 pb-6 pr-2">
                      {chatList}
                    </div>
                  )}
                </div>
                </div>{/* end header rows */}
              </div>

            </div>

            <div className="border-t border-border-subtle px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-[9px] font-semibold text-foreground">
                    {profileInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-sans text-xs text-foreground">{profileName}</p>
                  </div>
                </div>

                <Link
                  href="/settings"
                  prefetch={false}
                  onPointerEnter={() => router.prefetch('/settings')}
                  onFocus={() => router.prefetch('/settings')}
                  onClick={onClose}
                  className={cx(
                    'inline-flex h-8 w-8 items-center justify-center rounded-lg',
                    buttonStyles.transition,
                    buttonStyles.focus,
                    buttonStyles.ghost
                  )}
                  aria-label="Open settings"
                  title="Open settings"
                >
                  <svg
                    className="h-[18px] w-[18px] text-muted/80"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46a.5.5 0 00-.61-.22l-2.49 1a7.28 7.28 0 00-1.69-.98L14.5 2.42A.5.5 0 0014 2h-4a.5.5 0 00-.49.42L9.13 5.07c-.61.24-1.18.56-1.69.98l-2.49-1a.5.5 0 00-.61.22l-2 3.46a.5.5 0 00.12.64l2.11 1.65a7.93 7.93 0 000 1.96l-2.11 1.65a.5.5 0 00-.12.64l2 3.46c.13.22.39.31.61.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65A.5.5 0 0010 22h4a.5.5 0 00.49-.42l.38-2.65c.61-.24 1.18-.56 1.69-.98l2.49 1c.23.08.48 0 .61-.22l2-3.46a.5.5 0 00-.12-.64l-2.11-1.65zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"
                    />
                  </svg>
                </Link>
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
          className={`side-panel-resize-handle group absolute inset-y-0 right-[-3px] z-20 hidden w-2 cursor-col-resize items-stretch justify-center outline-none ${
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

        @media ${SIDE_PANEL_DESKTOP_MEDIA_QUERY} {
          .side-panel-backdrop {
            display: none;
          }

          .side-panel-shell[data-open='true'] {
            width: min(var(--side-panel-width), calc(100vw - 5rem));
          }

          .side-panel-resize-handle {
            display: flex;
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
