"use client";

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatPanelProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  conversationId: string | null;
  setConversationId: React.Dispatch<React.SetStateAction<string | null>>;
}

export default function ChatPanel({
  messages,
  setMessages,
  input,
  setInput,
  isLoading,
  setIsLoading,
  conversationId,
  setConversationId,
}: ChatPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [userHasScrolled, setUserHasScrolled] = useState(false);

  // Scroll container to bottom (not the page)
  const scrollToBottom = () => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  // Only auto-scroll if user hasn't manually scrolled up
  useEffect(() => {
    if (!userHasScrolled) {
      scrollToBottom();
    }
  }, [messages, userHasScrolled]);

  // Detect if user scrolls up manually
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;

    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    setUserHasScrolled(!isAtBottom);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    // When user sends a message, reset scroll state and scroll to bottom
    setUserHasScrolled(false);
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          conversationId,
        }),
      });

      const data = await response.json();

      // Check for API errors
      if (!response.ok || data.error) {
        const errorContent = data.error || `Request failed with status ${response.status}`;
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Error: ${errorContent}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        return;
      }

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      // Ensure we have a valid message response
      if (!data.message) {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Error: No response message received from the server.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        return;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
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
  };

  const handleClearChat = () => {
    setMessages([]);
    setConversationId(null);
    setUserHasScrolled(false);
  };

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/50 px-4 py-2.5 dark:border-slate-800/50">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Novus
          </span>
        </div>
        <button
          onClick={handleClearChat}
          className="text-[11px] font-medium text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
        >
          Clear
        </button>
      </div>

      {/* Messages Display */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-80 overflow-y-auto font-mono"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4">
            <div className="text-xs text-slate-300 dark:text-slate-600">
              &gt; awaiting input_
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100/50 dark:divide-slate-800/30">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`px-4 py-3 transition-colors ${
                  message.role === 'assistant'
                    ? 'bg-slate-50/50 dark:bg-slate-900/30'
                    : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider ${
                      message.role === 'user'
                        ? 'text-slate-400 dark:text-slate-500'
                        : 'text-emerald-500/80 dark:text-emerald-400/70'
                    }`}
                  >
                    {message.role === 'user' ? 'you' : 'ai'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="prose prose-sm max-w-none break-words text-[13px] leading-relaxed text-slate-700 dark:prose-invert dark:text-slate-200 [&_*]:my-0 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic [&_code]:rounded [&_code]:bg-slate-200 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[11px] [&_code]:font-mono dark:[&_code]:bg-slate-800 [&_pre]:my-2 [&_pre]:rounded [&_pre]:bg-slate-100 [&_pre]:p-3 dark:[&_pre]:bg-slate-800 [&_ul]:my-2 [&_ul]:list-inside [&_ol]:my-2 [&_ol]:list-inside [&_li]:ml-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:italic dark:[&_blockquote]:border-slate-700 [&_a]:text-blue-600 [&_a]:underline dark:[&_a]:text-blue-400">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                    <p className="mt-2 text-[10px] tabular-nums text-slate-300 dark:text-slate-600">
                      {message.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="bg-slate-50/50 px-4 py-3 dark:bg-slate-900/30">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-emerald-500/80 dark:text-emerald-400/70">
                    ai
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1 w-1 animate-pulse rounded-full bg-slate-400 dark:bg-slate-500" />
                    <span className="h-1 w-1 animate-pulse rounded-full bg-slate-400 [animation-delay:150ms] dark:bg-slate-500" />
                    <span className="h-1 w-1 animate-pulse rounded-full bg-slate-400 [animation-delay:300ms] dark:bg-slate-500" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Integrated Input */}
      <form onSubmit={handleSendMessage} className="border-t border-slate-200/50 dark:border-slate-800/50">
        <div className="flex items-center">
          <span className="pl-4 text-[11px] font-medium text-slate-300 dark:text-slate-600">
            &gt;
          </span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1 bg-transparent px-2 py-3 font-mono text-[13px] text-slate-700 placeholder-slate-300 outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-200 dark:placeholder-slate-600"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="mr-2 rounded-lg px-3 py-1.5 text-[11px] font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            Enter
          </button>
        </div>
      </form>
    </div>
  );
}
