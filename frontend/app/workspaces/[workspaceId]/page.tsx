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
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Tooltip from '@/app/components/Tooltip';
import ChatComposer from '@/app/home/components/ChatComposer';
import { persistInitialSendHandoff } from '@/app/home/components/initialSendHandoff';
import {
  uploadChatImageAttachments,
  type UploadedChatImageAttachment,
} from '@/app/home/components/chatImageUploads';
import {
  CHAT_MODEL_EFFORT_OVERRIDES_STORAGE_KEY,
  CHAT_MODEL_STORAGE_KEY,
  CHAT_MODEL_THINKING_OVERRIDES_STORAGE_KEY,
  isChatModelEffortOverrides,
  isChatModelThinkingOverrides,
} from '@/app/home/components/chatPreferencePersistence';
import { useChatModelCatalog } from '@/app/home/components/useChatModelCatalog';
import { useHomeDataContext } from '@/app/home/components/HomeDataContext';
import { usePersistedJson } from '@/app/home/components/usePersistedJson';
import { usePersistedString } from '@/app/home/components/usePersistedString';
import { useSidePanel } from '@/app/home/components/SidePanelContext';
import {
  GOOGLE_GIF_UNSUPPORTED_MESSAGE,
  IMAGE_MODEL_UNSUPPORTED_MESSAGE,
  useChatImageComposerState,
} from '@/app/home/components/useChatImageComposerState';
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
import { DEFAULT_SEARCH_MODE, type SearchMode } from '@/lib/chat-search';
import type { WorkspaceListItem } from '@/lib/workspaces';
import { CHAT_IMAGE_BUCKET } from '@/lib/chat-attachments';
import { supabase } from '@/lib/supabase';

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

function PencilIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.65"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M4.75 19.25l4.1-.9L18.6 8.6a2.12 2.12 0 00-3-3L5.85 15.35l-1.1 3.9z" />
      <path d="M13.95 7.25l2.8 2.8" />
    </svg>
  );
}

function EllipsisIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

export default function WorkspacePage() {
  const params = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isOpen: sidePanelOpen } = useSidePanel();
  const workspaceId = params.workspaceId;
  const {
    conversations,
    handleSelectConversation,
    handleCreateDraftSelection,
    openPersistentConversation,
    refreshSidebarData,
    selectedChat,
    setSelectedChat,
    setDraftChats,
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
  const [editingContext, setEditingContext] = useState(false);
  const [savingContext, setSavingContext] = useState(false);
  const [renamingWorkspace, setRenamingWorkspace] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState('');
  const [savingWorkspaceName, setSavingWorkspaceName] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [composerInput, setComposerInput] = useState('');
  const [composerLoading, setComposerLoading] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>(DEFAULT_SEARCH_MODE);
  const [selectedModelId, setSelectedModelId] = usePersistedString<ChatModelId>(
    CHAT_MODEL_STORAGE_KEY,
    DEFAULT_CHAT_MODEL_ID,
    isChatModelId
  );
  const [modelEffortOverrides, setModelEffortOverrides] =
    usePersistedJson<ChatModelEffortOverrides>(
      CHAT_MODEL_EFFORT_OVERRIDES_STORAGE_KEY,
      {},
      isChatModelEffortOverrides
    );
  const [thinkingEnabledOverrides, setThinkingEnabledOverrides] =
    usePersistedJson<ChatModelThinkingOverrides>(
      CHAT_MODEL_THINKING_OVERRIDES_STORAGE_KEY,
      {},
      isChatModelThinkingOverrides
    );
  const [responseStyle, setResponseStyle] =
    useState<ResponseStyle>(DEFAULT_RESPONSE_STYLE);
  const [composerWarning, setComposerWarning] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const contextTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const savingWorkspaceNameRef = useRef(false);

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
  const {
    imageInputDisabledReason,
    imageWarning,
    isUploadingImages,
    pendingImageAttachments,
    selectedModelRejectsGifImages,
    selectedModelSupportsImages,
    handleAttachImages,
    handleModelChange,
    handleRemoveImageAttachment,
    setImageWarning,
    setIsUploadingImages,
    setPendingImageAttachments,
  } = useChatImageComposerState({
    chatModels,
    selectedChatModel,
    setSelectedModelId,
  });

  const updateSelectedModelEffort = useCallback(
    (modelId: ChatModelId, effort: ChatModelEffortLevel) => {
      setModelEffortOverrides((current) => ({
        ...current,
        [modelId]: effort,
      }));
    },
    [setModelEffortOverrides]
  );

  const updateThinkingEnabled = useCallback((modelId: ChatModelId, enabled: boolean) => {
    setThinkingEnabledOverrides((current) => ({
      ...current,
      [modelId]: enabled,
    }));
  }, [setThinkingEnabledOverrides]);

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
          setWorkspaceNameDraft(payload.workspace?.name ?? '');
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

  useEffect(() => {
    if (!renamingWorkspace) return;
    requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  }, [renamingWorkspace]);

  useEffect(() => {
    if (!editingContext) return;
    requestAnimationFrame(() => contextTextareaRef.current?.focus());
  }, [editingContext]);

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

  const closeActions = () => {
    setActionsOpen(false);
  };

  const openDeleteConfirmation = () => {
    closeActions();
    setError(null);
    setConfirmingDelete(true);
  };

  const closeDeleteConfirmation = () => {
    if (deletingWorkspace) return;
    setConfirmingDelete(false);
  };

  const handleDeleteWorkspace = async () => {
    if (deletingWorkspace) return;

    setDeletingWorkspace(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: 'DELETE',
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'Failed to delete workspace');
      }

      setDraftChats((drafts) =>
        drafts.filter((draft) => draft.workspaceId !== workspaceId)
      );

      if (
        selectedChat
        && selectedChat.kind !== 'temporary'
        && selectedChat.workspaceId === workspaceId
      ) {
        setSelectedChat(null);
      }

      await refreshSidebarData();
      const e2e = searchParams.get('e2e');
      router.push(e2e ? `/home?e2e=${encodeURIComponent(e2e)}` : '/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workspace');
      setConfirmingDelete(false);
    } finally {
      setDeletingWorkspace(false);
    }
  };

  const startRenamingWorkspace = () => {
    setWorkspaceNameDraft(workspace?.name ?? '');
    setError(null);
    setRenamingWorkspace(true);
  };

  const cancelRenamingWorkspace = () => {
    setWorkspaceNameDraft(workspace?.name ?? '');
    setError(null);
    setRenamingWorkspace(false);
    setSavingWorkspaceName(false);
    savingWorkspaceNameRef.current = false;
  };

  const saveWorkspaceName = async (source: 'submit' | 'blur') => {
    if (savingWorkspaceNameRef.current) return;

    const normalizedName = workspaceNameDraft.replace(/\s+/g, ' ').trim();
    const currentName = workspace?.name ?? '';

    if (!normalizedName) {
      if (source === 'submit') {
        setError('Workspace name is required');
        nameInputRef.current?.focus();
        return;
      }
      cancelRenamingWorkspace();
      return;
    }

    if (normalizedName === currentName) {
      cancelRenamingWorkspace();
      return;
    }

    savingWorkspaceNameRef.current = true;
    setSavingWorkspaceName(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizedName }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'Failed to rename workspace');
      }
      setWorkspace(payload.workspace);
      setWorkspaceNameDraft(payload.workspace?.name ?? normalizedName);
      setRenamingWorkspace(false);
      await refreshSidebarData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename workspace');
      setRenamingWorkspace(true);
      requestAnimationFrame(() => nameInputRef.current?.focus());
    } finally {
      savingWorkspaceNameRef.current = false;
      setSavingWorkspaceName(false);
    }
  };

  const handleWorkspaceNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void saveWorkspaceName('submit');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelRenamingWorkspace();
    }
  };

  const openContextEditor = () => {
    setContextDraft(workspace?.context ?? '');
    setError(null);
    setEditingContext(true);
  };

  const closeContextEditor = () => {
    if (savingContext) return;
    setContextDraft(workspace?.context ?? '');
    setEditingContext(false);
  };

  const handleSaveContext = async () => {
    if (contextDraft === (workspace?.context ?? '')) {
      setEditingContext(false);
      return;
    }

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
      setEditingContext(false);
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
    const imagesToSend = pendingImageAttachments;
    let uploadedAttachments: UploadedChatImageAttachment[] = [];
    let shouldRevokeLocalImageUrls = false;

    if ((!message && imagesToSend.length === 0) || composerLoading || isUploadingImages) {
      return;
    }

    if (imagesToSend.length > 0 && !selectedModelSupportsImages) {
      setImageWarning(IMAGE_MODEL_UNSUPPORTED_MESSAGE);
      return;
    }

    if (
      selectedModelRejectsGifImages
      && imagesToSend.some((attachment) => attachment.mimeType === 'image/gif')
    ) {
      setImageWarning(GOOGLE_GIF_UNSUPPORTED_MESSAGE);
      return;
    }

    setComposerLoading(true);
    if (imagesToSend.length > 0) {
      setIsUploadingImages(true);
    }
    setComposerWarning(null);
    setImageWarning(null);
    setError(null);

    try {
      if (imagesToSend.length > 0) {
        uploadedAttachments = await uploadChatImageAttachments(imagesToSend);
      }

      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initialMessage: message || 'Image question',
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
        searchMode,
        uploadedAttachments,
      });
      setComposerInput('');
      setPendingImageAttachments([]);
      shouldRevokeLocalImageUrls = imagesToSend.length > 0;
      openPersistentConversation(conversationId);
      void refreshSidebarData();
    } catch (err) {
      if (uploadedAttachments.length > 0) {
        await supabase.storage
          .from(CHAT_IMAGE_BUCKET)
          .remove(uploadedAttachments.map((attachment) => attachment.storagePath));
      }

      setComposerWarning(
        err instanceof Error ? err.message : 'Failed to start workspace chat.'
      );
    } finally {
      if (shouldRevokeLocalImageUrls) {
        for (const attachment of imagesToSend) {
          URL.revokeObjectURL(attachment.url);
        }
      }
      if (imagesToSend.length > 0) {
        setIsUploadingImages(false);
      }
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
              <div className="mt-0.5 flex min-w-0 w-full items-center gap-2">
                {renamingWorkspace ? (
                  <input
                    ref={nameInputRef}
                    value={workspaceNameDraft}
                    onChange={(event) => setWorkspaceNameDraft(event.target.value)}
                    onBlur={() => {
                      if (!savingWorkspaceNameRef.current) void saveWorkspaceName('blur');
                    }}
                    onKeyDown={handleWorkspaceNameKeyDown}
                    disabled={savingWorkspaceName}
                    maxLength={80}
                    className="h-9 min-w-0 w-full max-w-xl rounded-md border border-border-subtle bg-surface px-2 font-sans text-2xl font-semibold text-foreground outline-none transition focus:border-foreground/[0.28] disabled:opacity-70"
                    aria-label="Workspace name"
                  />
                ) : (
                  <>
                    <h1 className="min-w-0 truncate font-sans text-2xl font-semibold text-foreground">
                      {workspaceName}
                    </h1>
                    <Tooltip content="Rename workspace">
                      <button
                        type="button"
                        onClick={startRenamingWorkspace}
                        className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                        aria-label="Rename workspace"
                      >
                        <PencilIcon />
                      </button>
                    </Tooltip>
                  </>
                )}
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                {workspace?.description || 'All chats and files share memory in this workspace'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartDraft}
              className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background transition hover:opacity-90"
            >
              New chat
            </button>
            <div className="relative">
              <Tooltip content="Workspace actions">
                <button
                  type="button"
                  onClick={() => setActionsOpen((open) => !open)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle bg-surface text-muted transition hover:bg-foreground/[0.04] hover:text-foreground"
                  aria-label="Workspace actions"
                  aria-expanded={actionsOpen}
                >
                  <EllipsisIcon />
                </button>
              </Tooltip>
              {actionsOpen && (
                <div
                  className="absolute right-0 top-11 z-30 min-w-44 rounded-lg border border-border-subtle bg-background p-1 shadow-xl"
                  role="menu"
                  aria-label="Workspace actions"
                >
                  <button
                    type="button"
                    onClick={openDeleteConfirmation}
                    className="flex w-full items-center rounded-md px-3 py-2 text-left font-sans text-sm text-red-600 transition hover:bg-red-500/[0.08] dark:text-red-300"
                    role="menuitem"
                  >
                    Delete workspace
                  </button>
                </div>
              )}
            </div>
          </div>
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
                chatModels={chatModels}
                input={composerInput}
                isLoading={composerLoading}
                imageInputDisabledReason={imageInputDisabledReason}
                isUploadingImages={isUploadingImages}
                pendingImageAttachments={pendingImageAttachments}
                responseStyle={responseStyle}
                selectedModelId={selectedModelId}
                modelEffortOverrides={modelEffortOverrides}
                thinkingEnabledOverrides={thinkingEnabledOverrides}
                searchMode={searchMode}
                temporaryChatEnabled={false}
                showTemporaryIntro={false}
                temporaryMemoryMode="off"
                searchWarning={composerWarning}
                imageWarning={imageWarning}
                textareaRef={textareaRef}
                onInputChange={setComposerInput}
                onAttachImages={handleAttachImages}
                onImageWarning={setImageWarning}
                onRemoveImageAttachment={handleRemoveImageAttachment}
                onModelChange={handleModelChange}
                onModelEffortChange={updateSelectedModelEffort}
                onThinkingEnabledChange={updateThinkingEnabled}
                onResponseStyleChange={setResponseStyle}
                onSearchModeChange={setSearchMode}
                onTemporaryMemoryModeChange={() => {}}
                onSubmit={handleComposerSubmit}
                onKeyDown={handleComposerKeyDown}
              />
            </div>
          </section>

          <aside className="min-h-0 border-t border-border-subtle py-5 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:pl-6">
            <section aria-labelledby="workspace-instructions-heading">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2
                    id="workspace-instructions-heading"
                    className="font-sans text-sm font-semibold text-foreground"
                  >
                    Instructions
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-muted">
                    Keen applies these only inside {workspaceName}.
                  </p>
                </div>
                <Tooltip content="Edit instructions">
                  <button
                    type="button"
                    onClick={openContextEditor}
                    className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                    aria-label="Edit instructions"
                  >
                    <PencilIcon />
                  </button>
                </Tooltip>
              </div>
              <button
                type="button"
                onClick={openContextEditor}
                className="flex min-h-[12rem] w-full items-start justify-start rounded-lg border border-border-subtle bg-surface px-3 py-3 text-left font-sans text-sm leading-6 text-foreground transition hover:border-foreground/[0.18] hover:bg-foreground/[0.02] focus:outline-none focus:ring-2 focus:ring-foreground/[0.12]"
                aria-label="Edit workspace instructions"
              >
                {workspace?.context ? (
                  <p className="whitespace-pre-wrap">{workspace.context}</p>
                ) : (
                  <p className="text-muted">No workspace instructions yet.</p>
                )}
              </button>
            </section>
          </aside>
        </div>
      </div>

      {editingContext && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/[0.18] px-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingContext) {
              closeContextEditor();
            }
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape' && !savingContext) {
              closeContextEditor();
            }
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveContext();
            }}
            className="w-full max-w-xl rounded-lg border border-border-subtle bg-background p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-workspace-instructions-heading"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="edit-workspace-instructions-heading"
                  className="font-sans text-base font-semibold text-foreground"
                >
                  Edit instructions
                </h2>
                <p className="mt-1 text-sm leading-5 text-muted">
                  These instructions apply when Keen is working in {workspaceName}.
                </p>
              </div>
              <button
                type="button"
                onClick={closeContextEditor}
                disabled={savingContext}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.65"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </svg>
              </button>
            </div>
            <textarea
              ref={contextTextareaRef}
              value={contextDraft}
              onChange={(event) => setContextDraft(event.target.value)}
              disabled={savingContext}
              className="mt-4 min-h-[16rem] w-full resize-y rounded-lg border border-border-subtle bg-surface px-3 py-3 font-sans text-sm leading-6 text-foreground outline-none transition focus:border-foreground/[0.24] disabled:opacity-70"
              placeholder={`Add background, preferences, constraints, or anything Keen should keep in mind for ${workspaceName}.`}
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeContextEditor}
                disabled={savingContext}
                className="rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingContext}
                className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingContext ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmingDelete && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/[0.18] px-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDeleteConfirmation();
            }
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              closeDeleteConfirmation();
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border-subtle bg-background p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-workspace-heading"
          >
            <h2
              id="delete-workspace-heading"
              className="font-sans text-base font-semibold text-foreground"
            >
              Delete this workspace?
            </h2>
            <p className="mt-2 font-sans text-sm leading-6 text-muted">
              This will permanently delete the workspace, all chats in it, and
              all memories saved to it. Global memory will not be changed.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirmation}
                disabled={deletingWorkspace}
                className="rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-foreground/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteWorkspace}
                disabled={deletingWorkspace}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingWorkspace ? 'Deleting...' : 'Delete workspace and chats'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
