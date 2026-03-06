"use client";

import { Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ThemeToggle from '@/app/components/ThemeToggle';
import HomeBackground from '@/app/home/components/HomeBackground';
import { useTTS } from '@/app/home/components/useTTS';
import { useMicrophone } from '@/app/home/components/useMicrophone';
import { useAudioVisualization } from '@/app/home/components/useAudioVisualization';
import { useTranscription } from '@/app/home/components/useTranscription';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/lib/supabase';
import type { MentorListItem } from '@/lib/mentors/types';
import { type ConversationListItem } from '@/app/home/components/ConversationsPanel';
import SidePanel from '@/app/home/components/SidePanel';
import MentorDetailPanel from '@/app/home/components/MentorDetailPanel';
import CreateMentorPanel from '@/app/home/components/CreateMentorPanel';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ConversationRow {
  id: string;
  title: string | null;
  mentor_id: string | null;
  updated_at: string;
  created_at: string;
}

function MicDodecahedron({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className="h-6 w-6">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-colors duration-300 ${active ? 'text-stone-700 dark:text-stone-200' : 'text-stone-400 dark:text-stone-500'}`}
      >
        <polygon points="60,8 108,38 90,102 30,102 12,38" />
        <polygon points="60,24 92,44 80,88 40,88 28,44" />
        <line x1="60" y1="8" x2="60" y2="24" />
        <line x1="108" y1="38" x2="92" y2="44" />
        <line x1="90" y1="102" x2="80" y2="88" />
        <line x1="30" y1="102" x2="40" y2="88" />
        <line x1="12" y1="38" x2="28" y2="44" />
      </g>
    </svg>
  );
}

/**
 * Home page - A cozy, integrated voice + text conversation interface
 */
export default function HomePage() {
  return (
    <Suspense>
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
    setActiveMentor(null);
    setConversationId(null);
    setMessages([]);
    setInput('');
    setUserHasScrolled(false);
  }, [tts]);

  const handleSelectMentor = useCallback(
    async (mentor: MentorListItem) => {
      tts.stop();
      setActiveMentor(mentor);
      setInput('');
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
      }
    },
    [loadConversationMessages, tts]
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
      setInput('');
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
    [mentors, loadConversationMessages, tts]
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
    setUserHasScrolled(false);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          conversationId,
          mentorId: activeMentor?.id ?? undefined,
        }),
      });

      const data = await response.json();

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

      const responseText = data.message || 'No response received.';
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

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
  const activeAccent = activeMentor?.accent_color || '#64748B';

  return (
    <div className="relative h-screen overflow-hidden bg-background text-foreground">
      <HomeBackground />

      <main className="relative mx-auto flex h-screen w-full max-w-2xl flex-col px-6">
        {/* Header */}
        <header className="flex h-16 items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidePanelOpen(true)}
              aria-label="Open conversations"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:text-foreground"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
            </button>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-widest text-muted">
                Talking With
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: activeAccent }}
                />
                <span className="truncate font-heading text-xl text-foreground">
                  {activeName}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/mentors')}
              aria-label="Browse mentors"
              title="Browse mentors"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:text-foreground"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </button>
            <ThemeToggle />
          </div>
        </header>

        {(loadingLists || listError) && (
          <div className="mb-4 rounded-lg bg-surface px-4 py-2 text-xs text-muted shadow-sm">
            {loadingLists ? 'Loading chats and mentors...' : listError}
          </div>
        )}

        {/* Conversation area */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="conversation-scroll flex-1 overflow-y-auto pb-4 pr-4"
        >
          {messages.length === 0 ? (
            <div className="flex h-full min-h-[50vh] flex-col items-center justify-center px-4">
              <div className="text-center">
                <h1 className="font-heading text-3xl text-stone-800 dark:text-stone-100 sm:text-4xl">
                  {activeMentor ? `Talk to ${activeMentor.name}` : "What's on your mind?"}
                </h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                  {activeMentor
                    ? activeMentor.tagline
                    : "I'm here to help you think through problems, capture ideas, and stay on top of what matters. Speak or type — I'm listening."}
                </p>
              </div>
            </div>
          ) : (
            <div className="py-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="py-4"
                >
                  <div className="mb-2 text-xs font-medium text-stone-400 dark:text-stone-500">
                    {message.role === 'user' ? 'You' : activeName}
                  </div>
                  <div className="text-[15px] leading-relaxed text-stone-800 dark:text-stone-100 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:mb-3 [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:mb-3 [&_ol]:ml-4 [&_ol]:list-decimal [&_li]:mb-1 [&_code]:rounded [&_code]:bg-stone-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:text-stone-700 dark:[&_code]:bg-stone-800 dark:[&_code]:text-stone-300 [&_pre]:my-3 [&_pre]:rounded-lg [&_pre]:bg-stone-100 [&_pre]:p-4 dark:[&_pre]:bg-stone-800">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="py-4">
                  <div className="mb-2 text-xs font-medium text-stone-400 dark:text-stone-500">
                    {activeName}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-stone-300 dark:bg-stone-600" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-stone-300 dark:bg-stone-600" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-stone-300 dark:bg-stone-600" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="sticky bottom-0 pb-6 pt-2">
          {/* Live transcript preview */}
          {hasTranscript && !isLoading && (
            <div className="mb-3 rounded-2xl bg-white/60 px-4 py-2 text-sm text-stone-600 backdrop-blur-md dark:bg-[#1a1a1a]/80 dark:text-neutral-300">
              <span className="text-[10px] font-medium uppercase tracking-widest text-stone-400 dark:text-neutral-500">Listening</span>
              <p className="mt-1">
                {transcription.finalTranscript}
                {transcription.interimTranscript && (
                  <span className="text-stone-400 dark:text-neutral-500"> {transcription.interimTranscript}</span>
                )}
                <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-stone-400 dark:bg-neutral-500" />
              </p>
            </div>
          )}

          {/* Voice waveform — floats above the input bar */}
          <div className={`relative mx-auto mb-1.5 h-1 max-w-[80%] overflow-hidden rounded-full transition-opacity duration-500 ${micActive || isLoading ? 'opacity-100' : 'opacity-0'}`}>
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
                className={`text-stone-400 transition-opacity duration-300 dark:text-neutral-400 ${micActive ? 'opacity-100' : 'opacity-0'}`}
              />
              <polyline
                ref={visualization.glowRef}
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                points="0,2 240,2"
                className={`text-stone-300 transition-opacity duration-300 dark:text-neutral-500 ${micActive ? 'opacity-50' : 'opacity-0'}`}
                style={{ filter: 'blur(2px)' }}
              />
            </svg>
            {/* Shimmer loader */}
            {!micActive && isLoading && (
              <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-stone-200 via-stone-300 to-stone-200 dark:from-neutral-700 dark:via-neutral-500 dark:to-neutral-700"
                style={{ backgroundSize: '200% 100%' }}
              />
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            {/* Mic button — floating circle, detached from the main capsule */}
            <button
              type="button"
              onClick={toggleMic}
              disabled={isLoading}
              className={`input-glass-orb flex-shrink-0 rounded-full p-3 transition-all duration-200 ${
                micActive
                  ? 'bg-white shadow-md dark:bg-[#2a2a2a]'
                  : 'bg-white/80 hover:bg-white dark:bg-[#1e1e1e] dark:hover:bg-[#262626]'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <MicDodecahedron active={micActive} />
            </button>

            {/* Main input capsule */}
            <div className="input-glass-capsule relative flex min-w-0 flex-1 items-end gap-2 rounded-[24px] bg-white/80 py-2 pl-5 pr-2 backdrop-blur-xl transition-all duration-200 dark:bg-[#1a1a1a]/90">
              {/* Top rim highlight */}
              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-black/[0.06] to-transparent dark:via-white/[0.07]" />

              {/* Text input */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={micActive ? 'Listening...' : `Message ${activeName}...`}
                disabled={isLoading}
                rows={1}
                className="w-full min-w-0 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-stone-700 placeholder-stone-400 outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-100 dark:placeholder-neutral-500"
                style={{ maxHeight: '200px' }}
              />

              {/* Send button */}
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="flex-shrink-0 rounded-full bg-stone-900 p-2.5 text-white transition-all hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-20 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
            </div>
          </form>

          {/* Status line — floating below */}
          <div className="mt-2 flex items-center justify-between px-16 text-[11px] text-stone-400 dark:text-neutral-500">
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
              Enter to send · Shift+Enter for new line
            </span>
          </div>

          {/* Mic errors */}
          {microphone.status === 'blocked' && (
            <p className="mt-2 text-center text-xs text-stone-500 dark:text-neutral-400">
              Microphone permission denied. Check browser settings.
            </p>
          )}
          {microphone.status === 'error' && microphone.errorMessage && (
            <p className="mt-2 text-center text-xs text-rose-500">{microphone.errorMessage}</p>
          )}
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
          setActiveMentor(mentor);
          setConversationId(null);
          setMessages([]);
          setUserHasScrolled(false);
          void refreshSidebarData();
        }}
      />

      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .animate-shimmer {
          animation: shimmer 2s linear infinite;
        }

        .input-glass-capsule {
          box-shadow:
            0 0 0 1px rgba(0,0,0,0.04),
            0 2px 8px rgba(0,0,0,0.04),
            0 8px 32px rgba(0,0,0,0.03),
            inset 0 1px 0 rgba(255,255,255,0.6);
        }

        :global(.dark) .input-glass-capsule {
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.08),
            inset 0 1px 0 rgba(255,255,255,0.05),
            inset 0 -1px 0 rgba(255,255,255,0.02),
            0 2px 12px rgba(0,0,0,0.3),
            0 8px 40px rgba(0,0,0,0.2);
        }

        .input-glass-orb {
          box-shadow:
            0 0 0 1px rgba(0,0,0,0.04),
            0 2px 8px rgba(0,0,0,0.05),
            inset 0 1px 0 rgba(255,255,255,0.5);
        }

        :global(.dark) .input-glass-orb {
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.08),
            inset 0 1px 0 rgba(255,255,255,0.06),
            0 2px 12px rgba(0,0,0,0.3);
        }

        /* Conversation scroll area */
        .conversation-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(0,0,0,0.12) transparent;
        }

        :global(.dark) .conversation-scroll {
          scrollbar-color: rgba(255,255,255,0.1) transparent;
        }

        .conversation-scroll::-webkit-scrollbar {
          width: 4px;
        }

        .conversation-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .conversation-scroll::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.12);
          border-radius: 4px;
        }

        .conversation-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(0,0,0,0.2);
        }

        :global(.dark) .conversation-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
        }

        :global(.dark) .conversation-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.18);
        }

        /* Subtle scrollbar for textarea */
        .input-glass-capsule textarea {
          scrollbar-width: thin;
          scrollbar-color: rgba(0,0,0,0.15) transparent;
        }

        :global(.dark) .input-glass-capsule textarea {
          scrollbar-color: rgba(255,255,255,0.15) transparent;
        }

        .input-glass-capsule textarea::-webkit-scrollbar {
          width: 4px;
        }

        .input-glass-capsule textarea::-webkit-scrollbar-track {
          background: transparent;
        }

        .input-glass-capsule textarea::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.12);
          border-radius: 4px;
        }

        .input-glass-capsule textarea::-webkit-scrollbar-thumb:hover {
          background: rgba(0,0,0,0.2);
        }

        :global(.dark) .input-glass-capsule textarea::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.12);
        }

        :global(.dark) .input-glass-capsule textarea::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </div>
  );
}
