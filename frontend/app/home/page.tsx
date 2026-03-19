"use client";

import { Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import HomeBackground from '@/app/home/components/HomeBackground';
import HomeHeader from '@/app/home/components/HomeHeader';
import ChatComposer from '@/app/home/components/ChatComposer';
import ConversationView from '@/app/home/components/ConversationView';
import { useHomeData } from '@/app/home/components/useHomeData';
import { useHomeThreads } from '@/app/home/components/useHomeThreads';
import { useHomeVoice } from '@/app/home/components/useHomeVoice';
import type { ThreadMeta } from '@/app/home/components/MarkdownWithThreads';
import type { SearchMetadata } from '@/lib/chat-search';
import type { MentorListItem } from '@/lib/mentors/types';
import { type ConversationListItem } from '@/app/home/components/ConversationsPanel';
import SidePanel from '@/app/home/components/SidePanel';
import MentorDetailPanel from '@/app/home/components/MentorDetailPanel';
import CreateMentorPanel from '@/app/home/components/CreateMentorPanel';
import { LearningModeProvider, useLearningMode } from '@/app/home/components/LearningModeContext';
import TextSelectionPopover from '@/app/home/components/TextSelectionPopover';
import ThreadPanel, { type ThreadMessage } from '@/app/home/components/ThreadPanel';
import type { Message } from '@/app/home/types';
import {
  createTemporaryId,
  toChatHistory,
  type ChatMode,
  type TemporaryMemoryMode,
} from '@/lib/chat-session';

interface ChatResponse {
  message?: string;
  conversationId?: string;
  mentorId?: string | null;
  threadId?: string | null;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  search?: SearchMetadata;
  error?: string;
}

const TTS_STORAGE_KEY = 'novus-tts-enabled';

/**
 * Home page - editorial voice + text conversation interface
 */
export default function HomePage() {
  return (
    <Suspense>
      <LearningModeProvider>
        <HomePageInner />
      </LearningModeProvider>
    </Suspense>
  );
}

function HomePageInner() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [lastSearchState, setLastSearchState] = useState<SearchMetadata | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>('persistent');
  const [temporaryMemoryMode, setTemporaryMemoryMode] =
    useState<TemporaryMemoryMode>('use_existing');
  const [temporaryMessages, setTemporaryMessages] = useState<Message[]>([]);
  const [temporaryThreadsMap, setTemporaryThreadsMap] = useState<Map<string, ThreadMeta[]>>(
    new Map()
  );
  const [temporaryThreadMessages, setTemporaryThreadMessages] = useState<
    Map<string, ThreadMessage[]>
  >(new Map());

  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [detailMentorSlug, setDetailMentorSlug] = useState<string | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);

  const { learningMode } = useLearningMode();

  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    messages,
    setMessages,
    conversationId,
    setConversationId,
    activeMentor,
    setActiveMentor,
    mentors,
    conversations,
    loadingLists,
    listError,
    setListError,
    threadsMap,
    setThreadsMap,
    clearConversationState,
    refreshSidebarData,
    loadConversationMessages,
  } = useHomeData();
  const isTemporaryChat = chatMode === 'temporary';
  const activeMessages = isTemporaryChat ? temporaryMessages : messages;
  const activeThreadsMap = isTemporaryChat ? temporaryThreadsMap : threadsMap;
  const activeConversationId = isTemporaryChat ? null : conversationId;

  const {
    micActive,
    ttsEnabled,
    tts,
    microphone,
    transcription,
    visualization,
    startMic,
    stopMic: stopVoiceCapture,
    toggleTtsEnabled,
  } = useHomeVoice(TTS_STORAGE_KEY);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    popoverState,
    activeThread,
    threadPanelOpen,
    threadPanelInitialMessages,
    pendingThreadMessage,
    resetThreadUi,
    dismissPopover,
    handlePointerUp,
    handleGraduateToThread,
    handleThreadClick,
    clearPendingThreadMessage,
    closeThreadPanel,
  } = useHomeThreads(learningMode, containerRef);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const clearTemporaryConversationState = useCallback(() => {
    setTemporaryMessages([]);
    setTemporaryThreadsMap(new Map());
    setTemporaryThreadMessages(new Map());
  }, []);

  const setTemporaryThreadMessagesForThread = useCallback(
    (threadId: string, nextMessages: ThreadMessage[]) => {
      setTemporaryThreadMessages((prev) => {
        const next = new Map(prev);
        if (nextMessages.length === 0) {
          next.delete(threadId);
        } else {
          next.set(threadId, nextMessages);
        }
        return next;
      });
    },
    []
  );

  const addThreadMeta = useCallback(
    (threadId: string, sourceMessageId: string, highlightedText: string) => {
      const updateMap = (prev: Map<string, ThreadMeta[]>) => {
        const next = new Map(prev);
        const existing = next.get(sourceMessageId) || [];
        if (existing.some((thread) => thread.threadId === threadId)) {
          return next;
        }

        next.set(sourceMessageId, [
          ...existing,
          { threadId, highlightedText, sourceMessageId },
        ]);
        return next;
      };

      if (isTemporaryChat) {
        setTemporaryThreadsMap(updateMap);
      } else {
        setThreadsMap(updateMap);
      }
    },
    [isTemporaryChat, setThreadsMap]
  );

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (!userHasScrolled && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [userHasScrolled]);

  useEffect(() => {
    scrollToBottom();
  }, [activeMessages, scrollToBottom]);

  useEffect(() => {
    void refreshSidebarData();
  }, [refreshSidebarData]);

  useEffect(() => {
    if (!activeMentor) return;
    const synced = mentors.find((mentor) => mentor.id === activeMentor.id);
    if (synced && synced !== activeMentor) {
      setActiveMentor(synced);
    }
  }, [activeMentor, mentors]);

  // Handle scroll detection
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setUserHasScrolled(!isAtBottom);
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopMic = useCallback(() => {
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
    stopVoiceCapture();
  }, [stopVoiceCapture]);

  const toggleMic = useCallback(() => {
    if (micActive) {
      stopMic();
    } else {
      void startMic();
    }
  }, [micActive, startMic, stopMic]);

  const handleSelectNovus = useCallback(() => {
    tts.stop();
    resetThreadUi();
    setActiveMentor(null);
    clearTemporaryConversationState();
    clearConversationState();
    setLastSearchState(null);
    setInput('');
    setUserHasScrolled(false);
  }, [
    clearConversationState,
    clearTemporaryConversationState,
    resetThreadUi,
    setActiveMentor,
    tts,
  ]);

  const handleSelectMentor = useCallback(
    async (mentor: MentorListItem) => {
      tts.stop();
      resetThreadUi();
      setActiveMentor(mentor);
      clearTemporaryConversationState();
      setInput('');
      setLastSearchState(null);
      setUserHasScrolled(false);

      if (isTemporaryChat) {
        clearConversationState();
        return;
      }

      if (mentor.conversation_id) {
        try {
          await loadConversationMessages(mentor.conversation_id);
        } catch (err) {
          setListError(err instanceof Error ? err.message : 'Failed to load conversation');
        }
      } else {
        clearConversationState();
      }
    },
    [
      clearConversationState,
      clearTemporaryConversationState,
      isTemporaryChat,
      loadConversationMessages,
      resetThreadUi,
      setActiveMentor,
      setListError,
      tts,
    ]
  );

  // Handle ?mentor=<slug> search param from /mentors page
  const mentorSlugHandledRef = useRef(false);
  useEffect(() => {
    if (mentorSlugHandledRef.current) return;
    const mentorSlug = searchParams.get('mentor');
    if (!mentorSlug || mentors.length === 0) return;
    mentorSlugHandledRef.current = true;

    const target = mentors.find((m) => m.slug === mentorSlug);
    if (target) {
      void handleSelectMentor(target);
    }
    // Clear the search param
    router.replace('/home', { scroll: false });
  }, [searchParams, mentors, handleSelectMentor, router]);

  const handleSelectConversation = useCallback(
    async (conversation: ConversationListItem) => {
      tts.stop();
      resetThreadUi();
      setChatMode('persistent');
      clearTemporaryConversationState();
      setInput('');
      setLastSearchState(null);
      setUserHasScrolled(false);

      const nextMentor = conversation.mentor_id
        ? mentors.find((mentor) => mentor.id === conversation.mentor_id) || null
        : null;
      setActiveMentor(nextMentor);

      try {
        await loadConversationMessages(conversation.id);
      } catch (err) {
        setListError(err instanceof Error ? err.message : 'Failed to load conversation');
      }
    },
    [clearTemporaryConversationState, mentors, loadConversationMessages, resetThreadUi, tts]
  );

  const handleToggleTemporaryChat = useCallback(async () => {
    const nextMode: ChatMode = isTemporaryChat ? 'persistent' : 'temporary';

    tts.stop();
    stopMic();
    resetThreadUi();
    setInput('');
    setLastSearchState(null);
    setUserHasScrolled(false);
    clearTemporaryConversationState();
    clearConversationState();

    if (nextMode === 'persistent') {
      setChatMode('persistent');
      if (activeMentor?.conversation_id) {
        try {
          await loadConversationMessages(activeMentor.conversation_id);
        } catch (err) {
          setListError(err instanceof Error ? err.message : 'Failed to load conversation');
        }
      }
      return;
    }

    setChatMode('temporary');
  }, [
    activeMentor?.conversation_id,
    clearConversationState,
    clearTemporaryConversationState,
    isTemporaryChat,
    loadConversationMessages,
    resetThreadUi,
    setListError,
    stopMic,
    tts,
  ]);

  // Send message (from text or voice)
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Cancel pending auto-send and clear transcript
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
    transcription.clearTranscript();

    const userMessage: Message = {
      id: isTemporaryChat ? createTemporaryId('message') : Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    if (isTemporaryChat) {
      setTemporaryMessages((prev) => [...prev, userMessage]);
    } else {
      setMessages((prev) => [...prev, userMessage]);
    }
    setInput('');
    setIsLoading(true);
    setLastSearchState(null);
    setUserHasScrolled(false);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          conversationId: isTemporaryChat ? undefined : conversationId,
          mentorId: activeMentor?.id ?? undefined,
          searchEnabled,
          chatMode,
          ...(isTemporaryChat
            ? {
                memoryMode: temporaryMemoryMode,
                history: toChatHistory(activeMessages),
              }
            : {}),
        }),
      });

      const data = (await response.json()) as ChatResponse;

      if (!response.ok || data.error) {
        const errorMessage: Message = {
          id: isTemporaryChat ? createTemporaryId('message') : (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Something went wrong. ${data.error || ''}`,
          timestamp: new Date(),
        };
        if (isTemporaryChat) {
          setTemporaryMessages((prev) => [...prev, errorMessage]);
        } else {
          setMessages((prev) => [...prev, errorMessage]);
        }
        return;
      }

      if (!isTemporaryChat && data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
      }

      setLastSearchState(data.search ?? null);

      const responseText =
        data.message?.trim() || 'Something went wrong. The assistant returned an empty response.';
      const assistantMessage: Message = {
        id:
          isTemporaryChat
            ? createTemporaryId('message')
            : data.assistantMessageId || (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      };

      if (isTemporaryChat) {
        setTemporaryMessages((prev) => [...prev, assistantMessage]);
      } else {
        // Update user message with real DB ID and add assistant message
        setMessages((prev) => {
          const persistedUserMessageId =
            typeof data.userMessageId === 'string' ? data.userMessageId : null;
          const updated = persistedUserMessageId
            ? prev.map((m) => m.id === userMessage.id ? { ...m, id: persistedUserMessageId } : m)
            : prev;
          return [...updated, assistantMessage];
        });

        await refreshSidebarData();
      }

      if (ttsEnabled && responseText && !responseText.startsWith('Something went wrong')) {
        tts.speak(responseText);
      }
    } catch {
      const errorMessage: Message = {
        id: isTemporaryChat ? createTemporaryId('message') : (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, there was an error processing your message.',
        timestamp: new Date(),
      };
      if (isTemporaryChat) {
        setTemporaryMessages((prev) => [...prev, errorMessage]);
      } else {
        setMessages((prev) => [...prev, errorMessage]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    activeMessages,
    activeMentor?.id,
    chatMode,
    conversationId,
    isLoading,
    isTemporaryChat,
    refreshSidebarData,
    searchEnabled,
    temporaryMemoryMode,
    ttsEnabled,
    tts,
    transcription.clearTranscript,
  ]);

  // Auto-send voice transcript with adaptive delay based on transcript completeness.
  // Deepgram provides punctuation via punctuate=true & smart_format=true, so we can
  // use sentence-ending punctuation as a strong signal of a complete thought.
  useEffect(() => {
    const text = transcription.finalTranscript.trim();
    const hasFinal = text.length > 0;
    const hasInterim = transcription.interimTranscript.length > 0;

    if (hasFinal && !hasInterim && micActive && !isLoading) {
      const lastChar = text[text.length - 1];
      const lastWord = text.split(/\s+/).pop()?.toLowerCase().replace(/[.,!?;:]$/, '') ?? '';
      const wordCount = text.split(/\s+/).length;

      let delay: number;

      // Trailing conjunctions / prepositions — clearly mid-thought
      const incomplete = ['and', 'but', 'or', 'so', 'because', 'since', 'although',
        'however', 'with', 'to', 'for', 'the', 'a', 'an', 'that', 'which', 'who',
        'if', 'then', 'like', 'of', 'in', 'on', 'about', 'is', 'are', 'was', 'were'];
      if (incomplete.includes(lastWord)) {
        delay = 4000;
      // Mid-sentence punctuation — user paused but isn't done
      } else if (lastChar === ',' || lastChar === ';' || lastChar === ':') {
        delay = 4000;
      // Complete sentence — Deepgram is confident it's a full thought
      } else if (lastChar === '.' || lastChar === '?' || lastChar === '!') {
        delay = wordCount <= 4 ? 1500 : 2000;
      // No terminal punctuation — Deepgram wasn't sure, give a bit more time
      } else {
        delay = 3000;
      }

      autoSendTimerRef.current = setTimeout(() => {
        sendMessage(transcription.finalTranscript.trim());
        autoSendTimerRef.current = null;
      }, delay);
    }

    return () => {
      if (autoSendTimerRef.current) {
        clearTimeout(autoSendTimerRef.current);
        autoSendTimerRef.current = null;
      }
    };
  }, [transcription.finalTranscript, transcription.interimTranscript, micActive, isLoading, sendMessage]);

  const handleThreadCreated = useCallback(
    (threadId: string, sourceMessageId: string, highlightedText: string) => {
      addThreadMeta(threadId, sourceMessageId, highlightedText);
    },
    [addThreadMeta]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const textToSend = input.trim();
    if (textToSend) {
      sendMessage(textToSend);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const activeName = activeMentor?.name || 'Novus';
  const activeTemporaryThreadMessages = activeThread
    ? temporaryThreadMessages.get(activeThread.id) ?? null
    : null;
  const searchModeHelper = searchEnabled
    ? 'Always grounds replies with current web results'
    : 'Lets the model decide when live search is needed';
  const lastSearchSuccessMessage =
    lastSearchState?.attempted && lastSearchState.status === 'success'
      ? `Last reply grounded with ${lastSearchState.resultCount} live ${
          lastSearchState.resultCount === 1 ? 'source' : 'sources'
        }`
      : null;
  const emptyTitle = isTemporaryChat
    ? 'Temporary chat'
    : activeMentor
      ? `Talk to ${activeMentor.name}`
      : "What's on your mind?";
  const emptySubtitle = isTemporaryChat
    ? 'Nothing from this conversation will be saved.'
    : activeMentor
      ? activeMentor.tagline
      : "I'm Listening";

  return (
    <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <HomeBackground />

      <main
        className={`relative flex min-h-0 flex-1 flex-col transition-[padding] duration-300 ease-out ${
          // Desktop: when the left sidebar is open, push the chat area right (ChatGPT-style).
          sidePanelOpen ? 'lg:pl-[380px]' : ''
        } ${threadPanelOpen ? 'lg:pr-[460px]' : ''}`}
      >
        {/* Full-width header: stretches left/right on desktop while content stays constrained below. */}
        <div className="w-full shrink-0 px-6">
          <HomeHeader
            activeName={activeName}
            temporaryChatEnabled={isTemporaryChat}
            temporaryMemoryMode={temporaryMemoryMode}
            onOpenSidePanel={() => setSidePanelOpen(true)}
            onBrowseMentors={() => router.push('/mentors')}
            onToggleTemporaryChat={() => {
              void handleToggleTemporaryChat();
            }}
          />
        </div>

        {/* Conversation area — scrollbar sits at the right edge of main */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="relative min-h-0 flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,0,0,0.08) transparent' }}
        >
          <ConversationView
            loadingLists={loadingLists}
            listError={listError}
            messages={activeMessages}
            activeName={activeName}
            emptyTitle={emptyTitle}
            emptySubtitle={emptySubtitle}
            isLoading={isLoading}
            threadsMap={activeThreadsMap}
            messagesEndRef={messagesEndRef}
            onThreadClick={handleThreadClick}
            onAssistantPointerUp={handlePointerUp}
          />
          <TextSelectionPopover
            popoverState={popoverState}
            chatMode={chatMode}
            conversationId={activeConversationId}
            mentorId={activeMentor?.id ?? null}
            memoryMode={temporaryMemoryMode}
            history={activeMessages}
            temporaryThreadMessages={temporaryThreadMessages}
            onTemporaryThreadMessagesChange={setTemporaryThreadMessagesForThread}
            onDismiss={dismissPopover}
            onThreadCreated={handleThreadCreated}
            onGraduateToThread={handleGraduateToThread}
          />
        </div>

        <ChatComposer
          activeName={activeName}
          input={input}
          isLoading={isLoading}
          micActive={micActive}
          ttsEnabled={ttsEnabled}
          searchEnabled={searchEnabled}
          temporaryChatEnabled={isTemporaryChat}
          showTemporaryIntro={activeMessages.length === 0}
          temporaryMemoryMode={temporaryMemoryMode}
          finalTranscript={transcription.finalTranscript}
          interimTranscript={transcription.interimTranscript}
          transcriptionStatus={transcription.status}
          microphoneStatus={microphone.status}
          microphoneErrorMessage={microphone.errorMessage}
          searchHelperText={searchModeHelper}
          searchWarning={lastSearchState?.warning ?? null}
          searchSuccessMessage={lastSearchSuccessMessage}
          isTtsLoading={tts.isLoading}
          isTtsPlaying={tts.isPlaying}
          textareaRef={textareaRef}
          waveformRef={visualization.lineRef}
          waveformGlowRef={visualization.glowRef}
          waveformContainerRef={visualization.visualRef}
          onInputChange={setInput}
          onToggleMic={toggleMic}
          onToggleTts={toggleTtsEnabled}
          onToggleSearch={() => setSearchEnabled((prev) => !prev)}
          onTemporaryMemoryModeChange={setTemporaryMemoryMode}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
        />
      </main>

      <SidePanel
        isOpen={sidePanelOpen}
        onClose={() => setSidePanelOpen(false)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(conversation) => {
          void handleSelectConversation(conversation);
        }}
        onNewNovusChat={handleSelectNovus}
      />
      <MentorDetailPanel
        isOpen={detailPanelOpen}
        slug={detailMentorSlug}
        onClose={() => setDetailPanelOpen(false)}
        onUpdated={() => {
          void refreshSidebarData();
        }}
        onDeleted={(deletedSlug) => {
          if (activeMentor?.slug === deletedSlug) {
            handleSelectNovus();
          }
          void refreshSidebarData();
        }}
      />
      <CreateMentorPanel
        isOpen={createPanelOpen}
        onClose={() => setCreatePanelOpen(false)}
        onCreated={(mentor) => {
          resetThreadUi();
          setActiveMentor(mentor);
          clearTemporaryConversationState();
          clearConversationState();
          setLastSearchState(null);
          setUserHasScrolled(false);
          void refreshSidebarData();
        }}
      />

      <ThreadPanel
        isOpen={threadPanelOpen}
        thread={activeThread}
        chatMode={chatMode}
        conversationId={activeConversationId}
        mentorId={activeMentor?.id ?? null}
        memoryMode={temporaryMemoryMode}
        conversationMessages={activeMessages}
        initialMessages={threadPanelInitialMessages}
        temporaryMessages={activeTemporaryThreadMessages}
        temporaryChatEnabled={isTemporaryChat}
        pendingMessage={pendingThreadMessage}
        onTemporaryMessagesChange={setTemporaryThreadMessagesForThread}
        onPendingMessageConsumed={clearPendingThreadMessage}
        onClose={closeThreadPanel}
      />

    </div>
  );
}
