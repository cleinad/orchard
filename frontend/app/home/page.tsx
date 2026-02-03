"use client";

import { useState } from 'react';
import ThemeToggle from '@/app/components/ThemeToggle';
import HomeBackground from '@/app/home/components/HomeBackground';
import MicVisualizer from '@/app/home/components/MicVisualizer';
import ChatPanel, { Message } from '@/app/home/components/ChatPanel';

/**
 * Home page - protected by proxy.ts middleware
 * Only authenticated users can access this page (proxy redirects unauthenticated users to /login)
 */
export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);


  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fbfaf7] text-slate-950 dark:bg-[#060606] dark:text-slate-100">
      <HomeBackground />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Novus</p>
            <h1 className="font-heading text-2xl text-slate-950 dark:text-white">
              Voice session
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-800/80">
              End session
            </button>
          </div>
        </header>

        {/* Talking Area */}
        <section className="mt-10">
          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-heading text-sm text-slate-500 dark:text-slate-400">
                Talking area
              </span>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-500">
                Listening
              </span>
            </div>
            <div className="mt-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              "Capture my thoughts from today's customer calls and propose next
              actions."
            </div>
            <MicVisualizer />
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full border border-slate-200/80 px-3 py-1 dark:border-slate-800">
                Hold to talk
              </span>
              <span className="rounded-full border border-slate-200/80 px-3 py-1 dark:border-slate-800">
                Auto transcript
              </span>
              <span className="rounded-full border border-slate-200/80 px-3 py-1 dark:border-slate-800">
                Commit gating
              </span>
            </div>
          </div>
        </section>

        {/* Chat Interface */}
        <section className="mt-8">
          <ChatPanel
            messages={messages}
            setMessages={setMessages}
            input={input}
            setInput={setInput}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            conversationId={conversationId}
            setConversationId={setConversationId}
          />
        </section>

        <footer className="mt-auto flex flex-col items-start justify-between gap-3 border-t border-slate-200/60 pt-6 text-xs text-slate-400 dark:border-slate-800 sm:flex-row sm:items-center">
          <span>© 2026 Novus</span>
          <span>Voice-first control panel</span>
        </footer>
      </main>
    </div>
  );
}


