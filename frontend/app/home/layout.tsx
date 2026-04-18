'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { SidePanelProvider, useSidePanel } from '@/app/home/components/SidePanelContext';
import { HomeDataProvider, useHomeDataContext } from '@/app/home/components/HomeDataContext';
import SidePanel from '@/app/home/components/SidePanel';
import { getHomeE2eFixture } from '@/app/home/e2eFixtures';

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

function HomeShell({ children }: { children: ReactNode }) {
  const {
    isOpen: sidePanelOpen,
    toggle: handleToggleSidePanel,
    close: handleCloseSidePanel,
    openWithScroll,
    scrollRequest: sidePanelScrollRequest,
    clearScrollRequest: clearSidePanelScrollRequest,
  } = useSidePanel();

  const {
    mentorGroups,
    draftChats,
    temporaryChats,
    selectedChat,
    handleSelectConversation,
    handleSelectDraft,
    handleSelectTemporaryChat,
    handleCreateDraftSelection,
    handleCloseTemporaryChat,
  } = useHomeDataContext();

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
            : 'side-panel-section-all-chats';

      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      clearSidePanelScrollRequest();
    };

    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [sidePanelOpen, sidePanelScrollRequest, clearSidePanelScrollRequest]);

  const handleRailNewChatKeen = () => {
    handleCreateDraftSelection(null);
    openWithScroll('new');
  };

  return (
    <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      {children}

      <SidePanel
        isOpen={sidePanelOpen}
        onClose={handleCloseSidePanel}
        onToggleSidePanel={handleToggleSidePanel}
        onNewChatKeen={handleRailNewChatKeen}
        onOpenTemporarySection={() => openWithScroll('temporary')}
        onOpenAllChats={() => openWithScroll('all')}
        mentorGroups={mentorGroups}
        draftChats={draftChats.map((d) => ({
          id: d.id,
          mentor_id: d.mentorId,
          title: d.title,
          updated_at: d.updatedAt,
        }))}
        temporaryChats={temporaryChats.map((c) => ({
          id: c.id,
          title: c.title,
          updated_at: c.updatedAt,
        }))}
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
        onSelectConversation={(conversation) => {
          handleSelectConversation(conversation);
          if (window.innerWidth < 1024) handleCloseSidePanel();
        }}
        onSelectDraft={(draftId) => {
          handleSelectDraft(draftId);
          if (window.innerWidth < 1024) handleCloseSidePanel();
        }}
        onSelectTemporaryChat={(tempChatId) => {
          handleSelectTemporaryChat(tempChatId);
          if (window.innerWidth < 1024) handleCloseSidePanel();
        }}
        onCreateDraft={(mentorId) => {
          handleCreateDraftSelection(mentorId);
          if (window.innerWidth < 1024) handleCloseSidePanel();
        }}
        onCloseTemporaryChat={handleCloseTemporaryChat}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout root — extracts route params and wires providers
// ---------------------------------------------------------------------------

function HomeLayoutInner({ children }: { children: ReactNode }) {
  const params = useParams<{ conversationId?: string[] }>();
  const searchParams = useSearchParams();

  const routeConversationId =
    Array.isArray(params.conversationId) && params.conversationId.length > 0
      ? params.conversationId[0]
      : null;
  const e2eQueryParam = searchParams.get('e2e');
  const skipInitialSidebarRefresh = getHomeE2eFixture(e2eQueryParam) !== null;

  return (
    <SidePanelProvider>
      <SidePanelShortcut />
      <HomeDataProvider
        routeConversationId={routeConversationId}
        e2eQueryParam={e2eQueryParam}
        skipInitialSidebarRefresh={skipInitialSidebarRefresh}
      >
        <HomeShell>{children}</HomeShell>
      </HomeDataProvider>
    </SidePanelProvider>
  );
}

export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <HomeLayoutInner>{children}</HomeLayoutInner>
    </Suspense>
  );
}
