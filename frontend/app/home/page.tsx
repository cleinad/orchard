"use client";

import { Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import HomeBackground from '@/app/home/components/HomeBackground';
import HomeHeader from '@/app/home/components/HomeHeader';
import { useTTS } from '@/app/home/components/useTTS';
import { useMicrophone } from '@/app/home/components/useMicrophone';
import { useAudioVisualization } from '@/app/home/components/useAudioVisualization';
import { useTranscription } from '@/app/home/components/useTranscription';
import type { SearchMetadata } from '@/lib/chat-search';
import { supabase } from '@/lib/supabase';
import type { MentorListItem } from '@/lib/mentors/types';
import { type ConversationListItem } from '@/app/home/components/ConversationsPanel';
import SidePanel from '@/app/home/components/SidePanel';
import MentorDetailPanel from '@/app/home/components/MentorDetailPanel';
import CreateMentorPanel from '@/app/home/components/CreateMentorPanel';
import { LearningModeProvider, useLearningMode } from '@/app/home/components/LearningModeContext';
import TextSelectionPopover, { type PopoverState } from '@/app/home/components/TextSelectionPopover';
import ThreadPanel from '@/app/home/components/ThreadPanel';
import MarkdownWithThreads, { type ThreadMeta } from '@/app/home/components/MarkdownWithThreads';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

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

interface ConversationRow {
  id: string;
  title: string | null;
  mentor_id: string | null;
  updated_at: string;
  created_at: string;
}

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [lastSearchState, setLastSearchState] = useState<SearchMetadata | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeMentor, setActiveMentor] = useState<MentorListItem | null>(null);
  const [mentors, setMentors] = useState<MentorListItem[]>([]);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [ttsEnabled] = useState(true);
  const [micActive, setMicActive] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [detailMentorSlug, setDetailMentorSlug] = useState<string | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);

  // Learning mode state
  const { learningMode } = useLearningMode();
  const [popoverState, setPopoverState] = useState<PopoverState | null>(null);
  const [threadsMap, setThreadsMap] = useState<Map<string, ThreadMeta[]>>(new Map());
  const [activeThread, setActiveThread] = useState<{ id: string; highlightedText: string; sourceMessageId: string } | null>(null);
  const [threadPanelOpen, setThreadPanelOpen] = useState(false);
  const [pendingThreadMessage, setPendingThreadMessage] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  const tts = useTTS();
  const microphone = useMicrophone();
  const transcription = useTranscription();
  const visualization = useAudioVisualization({
    analyser: microphone.analyser,
    isActive: micActive,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [userHasScrolled, setUserHasScrolled] = useState(false);

  const resetThreadUi = useCallback(() => {
    setPopoverState(null);
    setActiveThread(null);
    setThreadPanelOpen(false);
    setPendingThreadMessage(null);
  }, []);

  const loadMentors = useCallback(async (): Promise<MentorListItem[]> => {
    const response = await fetch('/api/mentors', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || 'Failed to load mentors');
    }
    return data as MentorListItem[];
  }, []);

  const loadConversations = useCallback(
    async (mentorSource: MentorListItem[]) => {
      const mentorById = new Map(mentorSource.map((mentor) => [mentor.id, mentor]));
      const { data: conversationRows, error: conversationError } = await supabase
        .from('conversations')
        .select('id, title, mentor_id, updated_at, created_at')
        .order('updated_at', { ascending: false })
        .limit(100);

      if (conversationError) {
        throw new Error(conversationError.message);
      }

      const rows = (conversationRows || []) as ConversationRow[];
      const previews = await Promise.all(
        rows.map(async (row) => {
          const { data: latestMessage } = await supabase
            .from('messages')
            .select('content')
            .eq('conversation_id', row.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            conversationId: row.id,
            preview: latestMessage?.content || '',
          };
        })
      );

      const previewByConversationId = new Map(
        previews.map((item) => [item.conversationId, item.preview])
      );

      const nextConversations: ConversationListItem[] = rows.map((row) => {
        const mentor = row.mentor_id ? mentorById.get(row.mentor_id) : null;
        const preview = previewByConversationId.get(row.id) || '';
        return {
          id: row.id,
          title: row.title,
          mentor_id: row.mentor_id,
          updated_at: row.updated_at,
          created_at: row.created_at,
          preview: preview.length > 180 ? `${preview.slice(0, 177)}...` : preview,
          mentor_name: mentor?.name || 'Novus',
          mentor_accent_color: mentor?.accent_color || null,
        };
      });

      setConversations(nextConversations);
    },
    []
  );

  const refreshSidebarData = useCallback(async () => {
    setLoadingLists(true);
    setListError(null);
    try {
      const nextMentors = await loadMentors();
      setMentors(nextMentors);
      await loadConversations(nextMentors);
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : 'Failed to load mentors and conversations'
      );
    } finally {
      setLoadingLists(false);
    }
  }, [loadConversations, loadMentors]);

  const loadConversationMessages = useCallback(async (nextConversationId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', nextConversationId)
      .is('thread_id', null)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      throw new Error(error.message);
    }

    const nextMessages: Message[] = ((data || []) as Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      created_at: string;
    }>).map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: new Date(message.created_at),
    }));

    setMessages(nextMessages);
    setConversationId(nextConversationId);
    setUserHasScrolled(false);

    // Load threads for this conversation
    const { data: threadRows, error: threadsError } = await supabase
      .from('threads')
      .select('id, source_message_id, highlighted_text')
      .eq('conversation_id', nextConversationId);

    if (threadsError) {
      console.error('Failed to load threads:', threadsError);
    }

    const nextThreadsMap = new Map<string, ThreadMeta[]>();
    for (const t of threadRows || []) {
      const key = t.source_message_id;
      const existing = nextThreadsMap.get(key) || [];
      existing.push({
        threadId: t.id,
        highlightedText: t.highlighted_text,
        sourceMessageId: t.source_message_id,
      });
      nextThreadsMap.set(key, existing);
    }
    setThreadsMap(nextThreadsMap);
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (!userHasScrolled && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [userHasScrolled]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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

  // Mic controls
  const startMic = useCallback(async () => {
    tts.stop();
    const result = await microphone.start();
    if (result) {
      setMicActive(true);
      void transcription.start(result.stream, result.sessionId);
    }
  }, [microphone, transcription, tts]);

  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopMic = useCallback(() => {
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
    microphone.stop();
    transcription.stop();
    transcription.clearTranscript();
    setMicActive(false);
  }, [microphone, transcription]);

  const toggleMic = useCallback(() => {
    if (micActive) {
      stopMic();
    } else {
      startMic();
    }
  }, [micActive, startMic, stopMic]);

  // Cleanup on unmount - use refs to avoid stale closures
  const microphoneRef = useRef(microphone);
  const transcriptionRef = useRef(transcription);
  microphoneRef.current = microphone;
  transcriptionRef.current = transcription;

  useEffect(() => {
    return () => {
      microphoneRef.current.stop();
      transcriptionRef.current.stop();
    };
  }, []);

  const handleSelectNovus = useCallback(() => {
    tts.stop();
    resetThreadUi();
    setActiveMentor(null);
    setConversationId(null);
    setMessages([]);
    setLastSearchState(null);
    setInput('');
    setThreadsMap(new Map());
    setUserHasScrolled(false);
  }, [resetThreadUi, tts]);

  const handleSelectMentor = useCallback(
    async (mentor: MentorListItem) => {
      tts.stop();
      resetThreadUi();
      setActiveMentor(mentor);
      setInput('');
      setLastSearchState(null);
      setUserHasScrolled(false);

      if (mentor.conversation_id) {
        try {
          await loadConversationMessages(mentor.conversation_id);
        } catch (err) {
          setListError(err instanceof Error ? err.message : 'Failed to load conversation');
        }
      } else {
        setConversationId(null);
        setMessages([]);
        setThreadsMap(new Map());
      }
    },
    [loadConversationMessages, resetThreadUi, tts]
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
    [mentors, loadConversationMessages, resetThreadUi, tts]
  );

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
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
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
          conversationId,
          mentorId: activeMentor?.id ?? undefined,
          searchEnabled,
        }),
      });

      const data = (await response.json()) as ChatResponse;

      if (!response.ok || data.error) {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Something went wrong. ${data.error || ''}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        return;
      }

      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
      }

      setLastSearchState(data.search ?? null);

      const responseText =
        data.message?.trim() || 'Something went wrong. The assistant returned an empty response.';
      const assistantMessage: Message = {
        id: data.assistantMessageId || (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      };

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

      if (ttsEnabled && responseText && !responseText.startsWith('Something went wrong')) {
        tts.speak(responseText);
      }
    } catch {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, there was an error processing your message.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [
    activeMentor?.id,
    conversationId,
    isLoading,
    refreshSidebarData,
    searchEnabled,
    ttsEnabled,
    tts,
    transcription.clearTranscript,
  ]);

  // Interrupt TTS when the user starts speaking
  useEffect(() => {
    if (micActive && (tts.isPlaying || tts.isLoading) && (transcription.interimTranscript || transcription.finalTranscript)) {
      tts.stop();
    }
  }, [micActive, tts, transcription.interimTranscript, transcription.finalTranscript]);

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

  // Learning mode: text selection handler
  const handlePointerUp = useCallback(() => {
    if (!learningMode) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

    const selectedText = selection.toString().trim();
    if (selectedText.length < 2 || selectedText.length > 500) return;

    const range = selection.getRangeAt(0);
    const messageEl = (range.startContainer as HTMLElement).closest?.('[data-message-id]')
      || (range.startContainer.parentElement as HTMLElement)?.closest?.('[data-message-id]');

    if (!messageEl) return;

    // Guard against cross-message selections
    const endMessageEl = (range.endContainer as HTMLElement).closest?.('[data-message-id]')
      || (range.endContainer.parentElement as HTMLElement)?.closest?.('[data-message-id]');
    if (!endMessageEl || endMessageEl !== messageEl) return;

    const messageId = messageEl.getAttribute('data-message-id');
    const messageRole = messageEl.getAttribute('data-message-role');

    if (!messageId || messageRole !== 'assistant') return;

    const rect = range.getBoundingClientRect();
    setPopoverState({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      selectedText,
      sourceMessageId: messageId,
    });
  }, [learningMode]);

  const handleThreadCreated = useCallback((threadId: string, sourceMessageId: string, highlightedText: string) => {
    setThreadsMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(sourceMessageId) || [];
      existing.push({ threadId, highlightedText, sourceMessageId });
      next.set(sourceMessageId, existing);
      return next;
    });
  }, []);

  const handleGraduateToThread = useCallback((threadId: string, sourceMessageId: string, highlightedText: string, pendingMessage?: string) => {
    setActiveThread({ id: threadId, highlightedText, sourceMessageId });
    setPendingThreadMessage(pendingMessage || null);
    setThreadPanelOpen(true);
    setPopoverState(null);
  }, []);

  const handleThreadClick = useCallback((thread: ThreadMeta) => {
    setActiveThread({ id: thread.threadId, highlightedText: thread.highlightedText, sourceMessageId: thread.sourceMessageId });
    setThreadPanelOpen(true);
  }, []);

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

  const hasTranscript = transcription.finalTranscript.length > 0 || transcription.interimTranscript.length > 0;
  const activeName = activeMentor?.name || 'Novus';
  const searchModeHelper = searchEnabled
    ? 'Always grounds replies with current web results'
    : 'Lets the model decide when live search is needed';
  const lastSearchSuccessMessage =
    lastSearchState?.attempted && lastSearchState.status === 'success'
      ? `Last reply grounded with ${lastSearchState.resultCount} live ${
          lastSearchState.resultCount === 1 ? 'source' : 'sources'
        }`
      : null;

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
            onOpenSidePanel={() => setSidePanelOpen(true)}
            onBrowseMentors={() => router.push('/mentors')}
          />
        </div>

        {/* Conversation area — scrollbar sits at the right edge of main */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="relative min-h-0 flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,0,0,0.08) transparent' }}
        >
          <div className="mx-auto max-w-2xl px-6 pb-4">

          {(loadingLists || listError) && (
            <div className="mb-4 rounded-lg bg-surface px-4 py-2 text-xs text-muted shadow-sm">
              {loadingLists ? 'Loading chats and mentors...' : listError}
            </div>
          )}
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[50vh] flex-col items-center justify-center px-4">
                <div className="text-center">
                  <h1 className="font-heading text-3xl text-foreground sm:text-4xl">
                    {activeMentor ? `Talk to ${activeMentor.name}` : "What's on your mind?"}
                  </h1>
                  <p className="mt-4 max-w-md text-md font-medium leading-relaxed text-muted">
                    {activeMentor ? activeMentor.tagline : "I'm Listening"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-8">
                {messages.map((message) => (
                  <div key={message.id} className="py-4" data-message-id={message.id} data-message-role={message.role} onPointerUp={message.role === 'assistant' ? handlePointerUp : undefined}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-medium tracking-wider text-muted">
                        {message.role === 'user' ? 'You' : activeName}
                      </span>
                      <span className="text-xs text-muted/60">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="mt-2 text-base leading-relaxed text-foreground [&_p]:mb-4 [&_p:last-child]:mb-0 [&_ul]:mb-4 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:mb-4 [&_ol]:ml-5 [&_ol]:list-decimal [&_li]:mb-1 [&_code]:rounded [&_code]:bg-stone-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_code]:text-stone-700 dark:[&_code]:bg-stone-800 dark:[&_code]:text-stone-300 [&_pre]:my-4 [&_pre]:rounded-lg [&_pre]:bg-stone-100 [&_pre]:p-4 dark:[&_pre]:bg-stone-800">
                      <MarkdownWithThreads
                        content={message.content}
                        threads={threadsMap.get(message.id) || []}
                        onThreadClick={handleThreadClick}
                      />
                    </div>
                  </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="py-4">
                    <span className="text-xs font-medium tracking-wider text-muted">{activeName}</span>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: '0ms' }} />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: '150ms' }} />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted/40" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="mx-auto w-full max-w-2xl px-6">
          <div className="shrink-0 pb-6 pt-2">
          {/* Live transcript preview */}
          {hasTranscript && !isLoading && (
            <div className="mb-3 rounded-lg bg-surface px-4 py-2 text-sm text-muted shadow-sm">
              <span className="text-xs font-medium tracking-wider text-muted/60">Listening</span>
              <p className="mt-1">
                {transcription.finalTranscript}
                {transcription.interimTranscript && (
                  <span className="text-muted/50"> {transcription.interimTranscript}</span>
                )}
                <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-muted/50" />
              </p>
            </div>
          )}

          {/* Voice waveform line - always visible */}
          <div className="relative mx-auto mb-1 h-0.5 max-w-[90%] overflow-hidden rounded-full">
            <svg
              viewBox="0 0 240 4"
              className="absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
            >
              <polyline
                ref={visualization.lineRef}
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                points="0,2 240,2"
                className={`transition-colors duration-300 ${
                  micActive ? 'text-muted' : 'text-muted/30'
                }`}
              />
              <polyline
                ref={visualization.glowRef}
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                points="0,2 240,2"
                className={`transition-opacity duration-300 ${
                  micActive ? 'text-muted/40 opacity-50' : 'opacity-0'
                }`}
                style={{ filter: 'blur(2px)' }}
              />
            </svg>
            {/* Shimmer loader when processing */}
            {!micActive && isLoading && (
              <div
                className="absolute inset-0 animate-shimmer bg-gradient-to-r from-stone-200 via-stone-300 to-stone-200 dark:from-stone-700 dark:via-stone-500 dark:to-stone-700"
                style={{ backgroundSize: '200% 100%' }}
              />
            )}
          </div>

          {/* Input area */}
          <form onSubmit={handleSubmit} className="relative">
            <div className="flex items-end gap-0 rounded-xl bg-surface px-4 py-2 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
              {/* Mic toggle - subtle, integrated */}
              <button
                type="button"
                onClick={toggleMic}
                disabled={isLoading}
                className={`mr-3 flex-shrink-0 rounded-lg p-2 transition-colors ${
                  micActive
                    ? 'text-foreground'
                    : 'text-muted/50 hover:text-muted'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </button>

              {/* Text input */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={micActive ? 'Listening...' : `Message ${activeName}...`}
                disabled={isLoading}
                rows={1}
                className="w-full min-w-0 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-foreground placeholder-muted/50 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                style={{ maxHeight: '200px' }}
              />

              {/* Send button */}
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="ml-2 flex-shrink-0 rounded-lg bg-foreground p-2 text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-20"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 px-1">
              <button
                type="button"
                aria-pressed={searchEnabled}
                onClick={() => setSearchEnabled((prev) => !prev)}
                disabled={isLoading}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  searchEnabled
                    ? 'border-transparent bg-foreground text-background shadow-[0_14px_28px_-20px_rgba(15,23,42,0.9)]'
                    : 'border-black/[0.08] bg-surface text-muted hover:border-black/[0.12] hover:text-foreground dark:border-white/[0.08] dark:hover:border-white/[0.14]'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full ${
                    searchEnabled
                      ? 'bg-background/15 text-background'
                      : 'bg-black/[0.04] text-muted dark:bg-white/[0.06]'
                  }`}
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </span>
                <span>Live search</span>
                <span className={`text-[11px] ${searchEnabled ? 'text-background/70' : 'text-muted/70'}`}>
                  {searchEnabled ? 'Always on' : 'Auto'}
                </span>
              </button>

              <span className="hidden text-[11px] text-muted/60 sm:inline">
                {searchModeHelper}
              </span>
            </div>

            {lastSearchState?.warning && (
              <div className="mt-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                {lastSearchState.warning}
              </div>
            )}

            {!lastSearchState?.warning && lastSearchSuccessMessage && (
              <div className="mt-2 px-1 text-[11px] text-muted/70">
                {lastSearchSuccessMessage}
              </div>
            )}
          </form>

          {/* Status line */}
          <div className="mt-2 flex items-center justify-between px-4 text-xs text-muted/60">
            <div className="flex items-center gap-3">
              {micActive && (
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  <span>
                    {transcription.status === 'connected' ? 'Listening' : transcription.status === 'connecting' ? 'Connecting...' : 'Ready'}
                  </span>
                </span>
              )}
              {tts.isLoading && <span>Generating voice...</span>}
              {tts.isPlaying && <span>Speaking...</span>}
            </div>
            <span className="hidden sm:inline">
              Enter to send
            </span>
          </div>

          {/* Mic errors */}
          {microphone.status === 'blocked' && (
            <p className="mt-2 text-center text-xs text-muted">
              Microphone permission denied. Check browser settings.
            </p>
          )}
          {microphone.status === 'error' && microphone.errorMessage && (
            <p className="mt-2 text-center text-xs text-rose-500">{microphone.errorMessage}</p>
          )}
          </div>
        </div>
      </main>

      <SidePanel
        isOpen={sidePanelOpen}
        onClose={() => setSidePanelOpen(false)}
        conversations={conversations}
        activeConversationId={conversationId}
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
          setConversationId(null);
          setMessages([]);
          setThreadsMap(new Map());
          setLastSearchState(null);
          setUserHasScrolled(false);
          void refreshSidebarData();
        }}
      />

      <TextSelectionPopover
        popoverState={popoverState}
        conversationId={conversationId}
        onDismiss={() => setPopoverState(null)}
        onThreadCreated={handleThreadCreated}
        onGraduateToThread={handleGraduateToThread}
      />
      <ThreadPanel
        isOpen={threadPanelOpen}
        thread={activeThread}
        conversationId={conversationId}
        pendingMessage={pendingThreadMessage}
        onPendingMessageConsumed={() => setPendingThreadMessage(null)}
        onClose={() => {
          setThreadPanelOpen(false);
          setActiveThread(null);
          setPendingThreadMessage(null);
        }}
      />

    </div>
  );
}
