'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useParams } from 'next/navigation';
import ChatComposer from '@/app/home/components/ChatComposer';
import { persistInitialSendHandoff } from '@/app/home/components/initialSendHandoff';
import { useChatModelCatalog } from '@/app/home/components/useChatModelCatalog';
import { useHomeDataContext } from '@/app/home/components/HomeDataContext';
import { useSidePanel } from '@/app/home/components/SidePanelContext';
import MemoryEntry from '@/app/home/components/MemoryEntry';
import { useMemory } from '@/app/home/components/useMemory';
import {
  DEFAULT_CHAT_MODEL_ID,
  isChatModelId,
  type ChatModelEffortLevel,
  type ChatModelEffortOverrides,
  type ChatModelId,
  type ChatModelThinkingOverrides,
} from '@/lib/chat-models';
import { DEFAULT_RESPONSE_STYLE, type ResponseStyle } from '@/lib/response-style';
import type { WorkspaceListItem } from '@/lib/workspaces';

type TabKey = 'sessions' | 'memory';

function formatDate(input: string): string {
  const date = new Date(input);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function WorkspaceFolderIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.55"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M4.75 8.25a2 2 0 012-2h3.1l1.75 1.75h5.65a2 2 0 012 2v6.75a2 2 0 01-2 2H6.75a2 2 0 01-2-2v-8.5z" />
      <path d="M4.75 10h14.5" />
    </svg>
  );
}

export default function WorkspacePage() {
  const params = useParams<{ workspaceId: string }>();
  const { isOpen: sidePanelOpen } = useSidePanel();
  const workspaceId = params.workspaceId;
  const {
    conversations,
    handleSelectConversation,
    handleCreateDraftSelection,
    openPersistentConversation,
    refreshSidebarData,
    selectedChat,
  } = useHomeDataContext();
  const memory = useMemory();
  const {
    entries: memoryEntries,
    loading: memoryLoading,
    load: loadMemory,
    updateEntry,
    deleteEntry,
  } = memory;

  const [workspace, setWorkspace] = useState<WorkspaceListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('sessions');
  const [contextDraft, setContextDraft] = useState('');
  const [savingContext, setSavingContext] = useState(false);
  const [composerInput, setComposerInput] = useState('');
  const [composerLoading, setComposerLoading] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [selectedModelId, setSelectedModelId] =
    useState<ChatModelId>(DEFAULT_CHAT_MODEL_ID);
  const [modelEffortOverrides, setModelEffortOverrides] =
    useState<ChatModelEffortOverrides>({});
  const [thinkingEnabledOverrides, setThinkingEnabledOverrides] =
    useState<ChatModelThinkingOverrides>({});
  const [responseStyle, setResponseStyle] =
    useState<ResponseStyle>(DEFAULT_RESPONSE_STYLE);
  const [composerWarning, setComposerWarning] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const waveformRef = useRef<SVGPolylineElement | null>(null);
  const waveformGlowRef = useRef<SVGPolylineElement | null>(null);
  const waveformContainerRef = useRef<HTMLDivElement | null>(null);

  const chatModels = useChatModelCatalog(selectedModelId, setSelectedModelId);
  const selectedChatModel = chatModels.find((model) => model.id === selectedModelId) ?? null;
  const selectedModelEffortCandidate = modelEffortOverrides[selectedModelId] ?? null;
  const selectedModelEffort =
    selectedChatModel?.effort
    && selectedModelEffortCandidate
    && selectedChatModel.effort.levels.includes(selectedModelEffortCandidate)
      ? selectedModelEffortCandidate
      : null;
  const hasThinkingEnabledOverride = Object.prototype.hasOwnProperty.call(
    thinkingEnabledOverrides,
    selectedModelId
  );
  const thinkingEnabledOverride = hasThinkingEnabledOverride
    ? thinkingEnabledOverrides[selectedModelId] ?? null
    : null;

  const updateSelectedModelEffort = useCallback(
    (modelId: ChatModelId, effort: ChatModelEffortLevel) => {
      setModelEffortOverrides((current) => ({
        ...current,
        [modelId]: effort,
      }));
    },
    []
  );

  const updateThinkingEnabled = useCallback((modelId: ChatModelId, enabled: boolean) => {
    setThinkingEnabledOverrides((current) => ({
      ...current,
      [modelId]: enabled,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
          cache: 'no-store',
        });
        const payload = await response.json();
        if (!response.ok || payload.error) {
          throw new Error(payload.error || 'Failed to load workspace');
        }

        if (!cancelled) {
          setWorkspace(payload.workspace);
          setContextDraft(payload.workspace?.context ?? '');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load workspace');
          setWorkspace(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (activeTab === 'memory') {
      void loadMemory({ scope: `workspace:${workspaceId}` });
    }
  }, [activeTab, loadMemory, workspaceId]);

  const workspaceConversations = useMemo(
    () =>
      conversations
        .filter((conversation) => conversation.workspace_id === workspaceId)
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        ),
    [conversations, workspaceId]
  );

  const handleStartDraft = () => {
    handleCreateDraftSelection(null, workspaceId);
  };

  const handleSaveContext = async () => {
    setSavingContext(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: contextDraft }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'Failed to save instructions');
      }
      setWorkspace(payload.workspace);
      setContextDraft(payload.workspace?.context ?? '');
      await refreshSidebarData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save instructions');
    } finally {
      setSavingContext(false);
    }
  };

  const handleComposerSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = composerInput.trim();
    if (!message || composerLoading) {
      return;
    }

    setComposerLoading(true);
    setComposerWarning(null);
    setError(null);

    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initialMessage: message,
          workspaceId,
        }),
      });
      const payload = await response.json();
      const conversationId = payload.conversation?.id;

      if (!response.ok || payload.error || !conversationId) {
        throw new Error(payload.error || 'Failed to start workspace chat.');
      }

      persistInitialSendHandoff({
        conversationId,
        workspaceId,
        mentorId: null,
        message,
        modelId: isChatModelId(selectedModelId) ? selectedModelId : DEFAULT_CHAT_MODEL_ID,
        modelEffort: selectedModelEffort,
        thinkingEnabled: thinkingEnabledOverride,
        responseStyle,
        searchEnabled,
      });
      setComposerInput('');
      openPersistentConversation(conversationId);
      void refreshSidebarData();
    } catch (err) {
      setComposerWarning(err instanceof Error ? err.message : 'Failed to start workspace chat.');
    } finally {
      setComposerLoading(false);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const pageOffsetClass = sidePanelOpen ? 'lg:pl-[21.8rem]' : 'lg:pl-14';

  if (loading) {
    return (
      <main
        className={`flex min-h-0 flex-1 items-center justify-center bg-background pl-14 text-foreground transition-[padding-left] duration-300 ease-out ${pageOffsetClass}`}
      >
        <div className="text-sm text-muted">Loading workspace...</div>
      </main>
    );
  }

  if (error && !workspace) {
    return (
      <main
        className={`flex min-h-0 flex-1 items-center justify-center bg-background pl-14 text-foreground transition-[padding-left] duration-300 ease-out ${pageOffsetClass}`}
      >
        <div className="rounded-lg border border-border-subtle bg-surface px-4 py-3 text-sm text-foreground">
          {error}
        </div>
      </main>
    );
  }

  const workspaceName = workspace?.name ?? 'Workspace';
  const activeConversationId =
    selectedChat?.kind === 'persistent' ? selectedChat.conversationId : null;

  return (
    <main
      className={`flex min-h-0 flex-1 flex-col overflow-y-auto bg-background pl-14 text-foreground transition-[padding-left] duration-300 ease-out lg:overflow-hidden ${pageOffsetClass}`}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[92rem] flex-col px-4 pt-5 sm:px-6 lg:h-full lg:min-h-0 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4 pb-5">
          <div className="flex min-w-0 items-start gap-4">
            <div
              className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full border border-border-subtle text-foreground"
              style={{
                backgroundColor: workspace?.accent_color
                  ? `${workspace.accent_color}18`
                  : 'var(--surface)',
                color: workspace?.accent_color || 'var(--foreground)',
              }}
            >
              {workspace?.icon ? (
                <span className="text-xl font-semibold">{workspace.icon}</span>
              ) : (
                <WorkspaceFolderIcon className="h-7 w-7" />
              )}
            </div>
            <div className="min-w-0 pt-1">
              <p className="font-sans text-sm font-medium text-muted">Workspaces</p>
              <h1 className="truncate font-sans text-2xl font-semibold text-foreground">
                {workspaceName}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                {workspace?.description || 'Project notes, sessions, and memory for this workspace.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleStartDraft}
            className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background transition hover:opacity-90"
          >
            New chat
          </button>
        </header>

        {error && (
          <div className="mb-3 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 font-sans text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            {error}
          </div>
        )}

        <div className="grid border-t border-border-subtle lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
          <section className="flex flex-col overflow-visible lg:min-h-0 lg:overflow-hidden lg:pr-6">
            <nav className="flex gap-6 border-b border-border-subtle" aria-label="Workspace tabs">
              {(['sessions', 'memory'] as TabKey[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 py-4 text-sm font-medium capitalize transition ${
                    activeTab === tab
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted hover:text-foreground'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>

            <div className="py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {activeTab === 'sessions' && (
                <div className="space-y-1">
                  {workspaceConversations.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border-subtle p-5 text-sm text-muted">
                      No sessions yet. Start the first chat in {workspaceName}.
                    </div>
                  ) : (
                    workspaceConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => handleSelectConversation(conversation)}
                        className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left transition ${
                          activeConversationId === conversation.id
                            ? 'bg-foreground/[0.06]'
                            : 'hover:bg-foreground/[0.04]'
                        }`}
                      >
                        <span className="min-w-0 truncate font-sans text-sm font-medium text-foreground">
                          {conversation.title}
                        </span>
                        <span className="flex-shrink-0 font-sans text-xs text-muted">
                          {formatDate(conversation.updated_at)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'memory' && (
                <div className="space-y-3">
                  {memoryLoading ? (
                    <div className="text-sm text-muted">Loading memory...</div>
                  ) : memoryEntries.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border-subtle p-5 text-sm text-muted">
                      Workspace memory is learned from chats in {workspaceName} and stays inside this workspace.
                    </div>
                  ) : (
                    memoryEntries.map((entry) => (
                      <MemoryEntry
                        key={entry.id}
                        entry={entry}
                        onUpdate={updateEntry}
                        onDelete={deleteEntry}
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-border-subtle py-3">
              <ChatComposer
                activeName={workspaceName}
                chatModels={chatModels}
                input={composerInput}
                isLoading={composerLoading}
                imageInputDisabled
                isUploadingImages={false}
                micActive={false}
                pendingImageAttachments={[]}
                responseStyle={responseStyle}
                selectedModelId={selectedModelId}
                modelEffortOverrides={modelEffortOverrides}
                thinkingEnabledOverrides={thinkingEnabledOverrides}
                ttsEnabled={false}
                searchEnabled={searchEnabled}
                temporaryChatEnabled={false}
                showTemporaryIntro={false}
                temporaryMemoryMode="off"
                finalTranscript=""
                interimTranscript=""
                transcriptionStatus="idle"
                microphoneStatus="idle"
                microphoneErrorMessage={null}
                searchWarning={composerWarning}
                imageWarning={null}
                isTtsLoading={false}
                isTtsPlaying={false}
                textareaRef={textareaRef}
                waveformRef={waveformRef}
                waveformGlowRef={waveformGlowRef}
                waveformContainerRef={waveformContainerRef}
                onInputChange={setComposerInput}
                onAttachImages={() => {}}
                onRemoveImageAttachment={() => {}}
                onModelChange={setSelectedModelId}
                onModelEffortChange={updateSelectedModelEffort}
                onThinkingEnabledChange={updateThinkingEnabled}
                onResponseStyleChange={setResponseStyle}
                onToggleMic={() => {}}
                onToggleTts={() => {}}
                onToggleSearch={() => setSearchEnabled((value) => !value)}
                onTemporaryMemoryModeChange={() => {}}
                onSubmit={handleComposerSubmit}
                onKeyDown={handleComposerKeyDown}
              />
            </div>
          </section>

          <aside className="min-h-0 border-t border-border-subtle py-5 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:pl-6">
            <section aria-labelledby="workspace-instructions-heading">
              <div className="mb-3">
                <h2
                  id="workspace-instructions-heading"
                  className="font-sans text-sm font-semibold text-foreground"
                >
                  Instructions
                </h2>
                <p className="mt-1 text-sm leading-5 text-muted">
                  Context Keen should apply only inside {workspaceName}.
                </p>
              </div>
              <textarea
                value={contextDraft}
                onChange={(event) => setContextDraft(event.target.value)}
                className="min-h-[15rem] w-full resize-y rounded-lg border border-border-subtle bg-surface px-3 py-3 font-sans text-sm leading-6 text-foreground outline-none transition focus:border-foreground/[0.24]"
                placeholder={`Add instructions, background, and constraints for ${workspaceName}.`}
              />
              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleSaveContext}
                  disabled={savingContext}
                  className="rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingContext ? 'Saving...' : 'Save instructions'}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
