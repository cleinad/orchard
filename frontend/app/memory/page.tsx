'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ThemeToggle from '@/app/components/ThemeToggle';
import HomeBackground from '@/app/home/components/HomeBackground';
import MemoryEntryComponent from '@/app/home/components/MemoryEntry';
import { useMemory } from '@/app/home/components/useMemory';
import { MEMORY_CATEGORIES, CATEGORY_HEADINGS, type MemoryCategory } from '@/lib/memory-types';

function formatMemoryDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - date.getTime();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function MemoryPage() {
  const router = useRouter();
  const { entries, loading, load, updateEntry, deleteEntry } = useMemory();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      load();
    }
    void init();
  }, [router, load]);

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

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <HomeBackground />

      <div className="relative mx-auto max-w-3xl px-6">
        {/* Header */}
        <header className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/home')}
              aria-label="Back to chat"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:text-foreground"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <h1 className="font-heading text-2xl text-foreground">
              Memories
            </h1>
          </div>
          <ThemeToggle />
        </header>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted/20 border-t-muted" />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-muted">
              No memories yet. Novus will remember things as you chat.
            </p>
          </div>
        ) : (
          <div className="pb-12">
            {/* Long-term memories by category */}
            {longTermByCategory.map((group) => (
              <div key={group.category} className="mb-8">
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
                  {group.heading}
                </h2>
                <div className="space-y-1">
                  {group.entries.map((entry) => (
                    <MemoryEntryComponent
                      key={`${entry.fileId}-${entry.entryIndex}`}
                      entry={entry}
                      onUpdate={updateEntry}
                      onDelete={deleteEntry}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Daily notes by date */}
            {dailyDates.length > 0 && (
              <div className="mb-8">
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
                  Recent Notes
                </h2>
                {dailyDates.map((date) => (
                  <div key={date} className="mb-4">
                    <p className="mb-2 text-xs text-muted/70">
                      {formatMemoryDate(date)}
                    </p>
                    <div className="space-y-1">
                      {dailyByDate[date].map((entry) => (
                        <MemoryEntryComponent
                          key={`${entry.fileId}-${entry.entryIndex}`}
                          entry={entry}
                          onUpdate={updateEntry}
                          onDelete={deleteEntry}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
