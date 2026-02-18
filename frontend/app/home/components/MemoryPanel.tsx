'use client';

import { useEffect, useCallback } from 'react';
import { useMemory } from './useMemory';
import MemoryEntryComponent from './MemoryEntry';
import { MEMORY_CATEGORIES, CATEGORY_HEADINGS, type MemoryCategory } from '@/lib/memory-types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function MemoryPanel({ isOpen, onClose }: Props) {
  const { entries, loading, load, updateEntry, deleteEntry } = useMemory();

  useEffect(() => {
    if (isOpen) {
      load();
    }
  }, [isOpen, load]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleEscape]);

  // Group entries
  const longTermByCategory = MEMORY_CATEGORIES.map((cat) => ({
    category: cat,
    heading: CATEGORY_HEADINGS[cat as MemoryCategory],
    entries: entries.filter((e) => e.type === 'long-term' && e.category === cat),
  })).filter((group) => group.entries.length > 0);

  const dailyByDate = entries
    .filter((e) => e.type === 'daily')
    .reduce(
      (acc, entry) => {
        const date = entry.date || 'Unknown';
        if (!acc[date]) acc[date] = [];
        acc[date].push(entry);
        return acc;
      },
      {} as Record<string, typeof entries>
    );

  const dailyDates = Object.keys(dailyByDate).sort((a, b) => b.localeCompare(a));

  const hasEntries = entries.length > 0;

  return (
    <div
      className={`fixed inset-0 z-50 transition-all duration-300 ${
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 dark:bg-black/40 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`absolute right-0 top-0 h-full w-[420px] max-w-[90vw] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col border-l border-stone-200/50 bg-white/90 backdrop-blur-2xl dark:border-stone-800/50 dark:bg-[#111111]/95">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4 dark:border-stone-800/50">
            <div>
              <h2 className="text-sm font-medium text-stone-800 dark:text-stone-100">
                Memory
              </h2>
              <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">
                What Novus knows about you
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
              aria-label="Close"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500 dark:border-stone-700 dark:border-t-stone-400" />
              </div>
            ) : !hasEntries ? (
              <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
                <div className="mb-3 rounded-full bg-stone-100 p-3 dark:bg-stone-800">
                  <svg className="h-5 w-5 text-stone-400 dark:text-stone-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                  </svg>
                </div>
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  No memories yet
                </p>
                <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                  Novus will remember things as you chat
                </p>
              </div>
            ) : (
              <div className="pb-8">
                {/* Long-term categories */}
                {longTermByCategory.map((group) => (
                  <div key={group.category}>
                    <div className="sticky top-0 z-10 bg-white/90 px-4 py-2.5 backdrop-blur-sm dark:bg-[#111111]/95">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
                        {group.heading}
                      </h3>
                    </div>
                    {group.entries.map((entry) => (
                      <MemoryEntryComponent
                        key={`${entry.fileId}-${entry.entryIndex}`}
                        entry={entry}
                        onUpdate={updateEntry}
                        onDelete={deleteEntry}
                      />
                    ))}
                  </div>
                ))}

                {/* Daily notes */}
                {dailyDates.length > 0 && (
                  <div>
                    <div className="sticky top-0 z-10 bg-white/90 px-4 py-2.5 backdrop-blur-sm dark:bg-[#111111]/95">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
                        Recent Notes
                      </h3>
                    </div>
                    {dailyDates.map((date) => (
                      <div key={date}>
                        <div className="px-4 py-1.5">
                          <span className="text-[11px] text-stone-400 dark:text-stone-500">
                            {formatDate(date)}
                          </span>
                        </div>
                        {dailyByDate[date].map((entry) => (
                          <MemoryEntryComponent
                            key={`${entry.fileId}-${entry.entryIndex}`}
                            entry={entry}
                            onUpdate={updateEntry}
                            onDelete={deleteEntry}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - date.getTime();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
