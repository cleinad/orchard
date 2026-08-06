'use client';

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { SidePanelProvider } from '@/app/home/components/SidePanelContext';
import { useSidePanel } from '@/app/home/components/SidePanelContext';
import {
  HomeDataProvider,
  useHomeShellContext,
} from '@/app/home/components/HomeDataContext';
import SidePanel from '@/app/home/components/SidePanel';
import { getHomeE2eFixture } from '@/app/home/e2eFixtures';
import type { HomeBootstrapData } from '@/app/home/server-data';
import { recordHomePerformanceEvent } from '@/app/home/components/homePerformanceInstrumentation';

const SIDE_PANEL_DRAWER_BREAKPOINT_PX = 768;

// ---------------------------------------------------------------------------
// Cmd/Ctrl+B shortcut — lives here so it persists across route changes
// ---------------------------------------------------------------------------

function SidePanelShortcut() {
  const { toggle } = useSidePanel();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.shiftKey ||
        event.altKey ||
        (!event.ctrlKey && !event.metaKey) ||
        event.key.toLowerCase() !== 'b'
      ) {
        return;
      }
      event.preventDefault();
      toggle();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  return null;
}

// ---------------------------------------------------------------------------
// Persistent shell — SidePanel never remounts across /home route changes
// (Mentor detail / create mentor live on /mentors only.)
// ---------------------------------------------------------------------------

interface CreateWorkspaceModalProps {
  open: boolean;
  value: string;
  error: string | null;
  isSubmitting: boolean;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function CreateWorkspaceModal({
  open,
  value,
  error,
  isSubmitting,
  onValueChange,
  onClose,
  onSubmit,
}: CreateWorkspaceModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/[0.18] px-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' && !isSubmitting) {
          onClose();
        }
      }}
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-border-subtle bg-background p-4 shadow-2xl"
        aria-label="Create workspace"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-sans text-base font-semibold text-foreground">New workspace</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <label htmlFor="workspace-name" className="mt-4 block font-sans text-sm font-medium text-foreground">
          Workspace name
        </label>
        <input
          ref={inputRef}
          id="workspace-name"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          disabled={isSubmitting}
          className="mt-2 h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 font-sans text-sm text-foreground outline-none transition focus:border-foreground/[0.28] disabled:cursor-not-allowed disabled:opacity-60"
        />

        {error && (
          <p className="mt-2 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 font-sans text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-border-subtle bg-surface px-3 py-2 font-sans text-sm font-semibold text-foreground transition hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || value.trim().length === 0}
            className="rounded-lg bg-foreground px-3 py-2 font-sans text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function HomeShell({ children }: { children: ReactNode }) {
  recordHomePerformanceEvent('home-shell-render');
  const {
    isOpen: sidePanelOpen,
    widthPx: sidePanelWidthPx,
    setWidthPx: setSidePanelWidthPx,
    toggle: handleToggleSidePanel,
    open: handleOpenSidePanel,
    close: handleCloseSidePanel,
    openWithScroll,
    scrollRequest: sidePanelScrollRequest,
    clearScrollRequest: clearSidePanelScrollRequest,
  } = useSidePanel();

  const {
    workspaceGroups,
    conversations,
    draftChats,
    temporaryChats,
    selectedChat,
    setSelectedChat,
    handleSelectConversation,
    handleSelectDraft,
    handleSelectTemporaryChat,
    handleCreateDraftSelection,
    handleCreateTemporaryChat,
    handleCloseTemporaryChat,
    refreshSidebarData,
    upsertWorkspaceSummary,
    buildHomeHref,
    openWorkspace,
  } = useHomeShellContext();
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState('');
  const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  // Scroll the sidebar to the requested section after it opens
  useEffect(() => {
    if (!sidePanelOpen || !sidePanelScrollRequest) return;

    const run = () => {
      const scrollEl = document.getElementById('side-panel-scroll');
      if (!scrollEl) return;

      const sectionId =
        sidePanelScrollRequest === 'temporary'
          ? 'side-panel-section-temporary'
          : sidePanelScrollRequest === 'new'
            ? 'side-panel-section-new'
            : sidePanelScrollRequest === 'workspaces'
              ? 'side-panel-section-workspaces'
              : 'side-panel-section-all-chats';

      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      clearSidePanelScrollRequest();
    };

    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [sidePanelOpen, sidePanelScrollRequest, clearSidePanelScrollRequest]);

  const handleRailNewChat = () => {
    handleCreateDraftSelection(null);
    openWithScroll('new');
  };

  const openCreateWorkspaceModal = () => {
    setWorkspaceNameDraft('');
    setCreateWorkspaceError(null);
    setCreateWorkspaceOpen(true);
  };

  const closeCreateWorkspaceModal = () => {
    if (creatingWorkspace) return;
    setCreateWorkspaceOpen(false);
    setWorkspaceNameDraft('');
    setCreateWorkspaceError(null);
  };

  const handleCreateWorkspaceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = workspaceNameDraft.replace(/\s+/g, ' ').trim();
    if (!normalizedName || creatingWorkspace) return;

    setCreatingWorkspace(true);
    setCreateWorkspaceError(null);

    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizedName }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error || !payload.workspace?.id) {
        throw new Error(payload.error || 'Failed to create workspace');
      }

      upsertWorkspaceSummary(payload.workspace);
      setCreateWorkspaceOpen(false);
      setWorkspaceNameDraft('');
      openWorkspace(payload.workspace.id);
      if (window.innerWidth < SIDE_PANEL_DRAWER_BREAKPOINT_PX) handleCloseSidePanel();
    } catch (err) {
      setCreateWorkspaceError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const handleMoveConversation = async (
    conversation: Parameters<typeof handleSelectConversation>[0],
    targetWorkspaceId: string | null
  ) => {
    const response = await fetch(
      `/api/conversations/${encodeURIComponent(conversation.id)}/context`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: targetWorkspaceId,
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.error) {
      throw new Error(payload.error || 'Could not move chat.');
    }

    const nextWorkspaceId =
      typeof payload.conversation?.workspaceId === 'string'
        ? payload.conversation.workspaceId
        : null;

    setSelectedChat((current) =>
      current?.kind === 'persistent' && current.conversationId === conversation.id
        ? {
            ...current,
            mentorId: null,
            workspaceId: nextWorkspaceId,
          }
        : current
    );

    await refreshSidebarData();
  };

  return (
    <div
      data-home-region="shell"
      className="side-panel-layout relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground"
      data-side-panel-open={sidePanelOpen}
      style={{ '--side-panel-width': `${sidePanelWidthPx}px` } as CSSProperties}
    >
      {children}

      <CreateWorkspaceModal
        open={createWorkspaceOpen}
        value={workspaceNameDraft}
        error={createWorkspaceError}
        isSubmitting={creatingWorkspace}
        onValueChange={setWorkspaceNameDraft}
        onClose={closeCreateWorkspaceModal}
        onSubmit={handleCreateWorkspaceSubmit}
      />

      <SidePanel
        isOpen={sidePanelOpen}
        sidePanelWidthPx={sidePanelWidthPx}
        onClose={handleCloseSidePanel}
        onOpen={handleOpenSidePanel}
        onToggleSidePanel={handleToggleSidePanel}
        onSidePanelWidthChange={setSidePanelWidthPx}
        onNewChat={handleRailNewChat}
        onOpenWorkspacesSection={() => openWithScroll('workspaces')}
        onOpenTemporarySection={() => openWithScroll('temporary')}
        onCreateTemporaryChat={() => {
          handleCreateTemporaryChat();
          if (window.innerWidth < SIDE_PANEL_DRAWER_BREAKPOINT_PX) handleCloseSidePanel();
        }}
        onOpenAllChats={() => openWithScroll('all')}
        workspaceGroups={workspaceGroups}
        conversations={conversations}
        draftChats={draftChats}
        temporaryChats={temporaryChats}
        selectedConversationId={
          selectedChat?.kind === 'persistent' ? selectedChat.conversationId : null
        }
        selectedDraftId={selectedChat?.kind === 'draft' ? selectedChat.draftId : null}
        selectedTempChatId={
          selectedChat?.kind === 'temporary' ? selectedChat.tempChatId : null
        }
        selectedMentorId={
          selectedChat?.kind === 'temporary' ? null : selectedChat?.mentorId ?? null
        }
        selectedWorkspaceId={
          selectedChat?.kind === 'temporary' ? null : selectedChat?.workspaceId ?? null
        }
        onSelectConversation={(conversation) => {
          handleSelectConversation(conversation);
          if (window.innerWidth < SIDE_PANEL_DRAWER_BREAKPOINT_PX) handleCloseSidePanel();
        }}
        onSelectDraft={(draftId) => {
          handleSelectDraft(draftId);
          if (window.innerWidth < SIDE_PANEL_DRAWER_BREAKPOINT_PX) handleCloseSidePanel();
        }}
        onSelectTemporaryChat={(tempChatId) => {
          handleSelectTemporaryChat(tempChatId);
          if (window.innerWidth < SIDE_PANEL_DRAWER_BREAKPOINT_PX) handleCloseSidePanel();
        }}
        onCreateWorkspaceDraft={(workspaceId) => {
          handleCreateDraftSelection(null, workspaceId);
          if (window.innerWidth < SIDE_PANEL_DRAWER_BREAKPOINT_PX) handleCloseSidePanel();
        }}
        onCreateWorkspace={openCreateWorkspaceModal}
        buildWorkspaceHref={(workspaceId) =>
          buildHomeHref(`/workspaces/${encodeURIComponent(workspaceId)}`)
        }
        onOpenWorkspace={(workspaceId) => {
          openWorkspace(workspaceId, { navigate: false });
          if (window.innerWidth < SIDE_PANEL_DRAWER_BREAKPOINT_PX) handleCloseSidePanel();
        }}
        onCloseTemporaryChat={handleCloseTemporaryChat}
        onMoveConversation={handleMoveConversation}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout root — extracts route params and wires providers
// ---------------------------------------------------------------------------

function ChatShellInner({
  children,
  initialBootstrap,
}: {
  children: ReactNode;
  initialBootstrap: HomeBootstrapData | null;
}) {
  const params = useParams<{ conversationId?: string[] }>();
  const searchParams = useSearchParams();

  const routeConversationId =
    Array.isArray(params.conversationId) && params.conversationId.length > 0
      ? params.conversationId[0]
      : null;
  const e2eQueryParam = searchParams.get('e2e');
  const skipInitialSidebarRefresh = getHomeE2eFixture(e2eQueryParam) !== null;

  return (
    <>
      <SidePanelShortcut />
      <HomeDataProvider
        routeConversationId={routeConversationId}
        e2eQueryParam={e2eQueryParam}
        skipInitialSidebarRefresh={skipInitialSidebarRefresh}
        initialNavigationData={initialBootstrap?.navigation}
        initialChatModels={initialBootstrap?.chatModels}
      >
        <HomeShell>{children}</HomeShell>
      </HomeDataProvider>
    </>
  );
}

export default function ChatShell({
  children,
  initialBootstrap,
}: {
  children: ReactNode;
  initialBootstrap: HomeBootstrapData | null;
}) {
  return (
    <Suspense>
      <SidePanelProvider>
        <ChatShellInner initialBootstrap={initialBootstrap}>
          {children}
        </ChatShellInner>
      </SidePanelProvider>
    </Suspense>
  );
}
