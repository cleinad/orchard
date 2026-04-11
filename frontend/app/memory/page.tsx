'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ThemePicker from '@/app/components/ThemePicker';
import HomeBackground from '@/app/home/components/HomeBackground';
import MemoryEntryComponent from '@/app/home/components/MemoryEntry';
import { useMemory } from '@/app/home/components/useMemory';

export default function MemoryPage() {
  const router = useRouter();
  const { entries, loading, load, updateEntry, deleteEntry } = useMemory();

  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'mentor'>('all');
  const [stabilityFilter, setStabilityFilter] = useState<'all' | 'stable' | 'episodic'>(
    'all'
  );
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    void load({ scope: 'all', status: 'active' });
  }, [load]);

  const availableTypes = useMemo(() => {
    return Array.from(new Set(entries.map((entry) => entry.type))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [entries]);

  const filtered = useMemo(() => {
    return entries
      .filter((entry) => {
        if (scopeFilter !== 'all' && entry.owner_type !== scopeFilter) return false;
        if (stabilityFilter !== 'all' && entry.stability !== stabilityFilter) return false;
        if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
  }, [entries, scopeFilter, stabilityFilter, typeFilter]);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <HomeBackground />

      <div className="relative mx-auto max-w-3xl px-6">
        <header className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/home')}
              aria-label="Back to chat"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:text-foreground"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                />
              </svg>
            </button>
            <h1 className="font-heading text-2xl text-foreground">Memories</h1>
          </div>
          <ThemePicker />
        </header>

        <div className="mb-4 rounded-xl border border-stone-200/70 bg-white/70 p-3 backdrop-blur-sm dark:border-stone-800/60 dark:bg-[#171716]/70">
          <div className="mb-2 flex flex-wrap gap-1">
            <FilterChip
              active={scopeFilter === 'all'}
              label="All"
              onClick={() => setScopeFilter('all')}
            />
            <FilterChip
              active={scopeFilter === 'global'}
              label="Global"
              onClick={() => setScopeFilter('global')}
            />
            <FilterChip
              active={scopeFilter === 'mentor'}
              label="Mentor"
              onClick={() => setScopeFilter('mentor')}
            />
            <FilterChip
              active={stabilityFilter === 'stable'}
              label="Stable"
              onClick={() =>
                setStabilityFilter(stabilityFilter === 'stable' ? 'all' : 'stable')
              }
            />
            <FilterChip
              active={stabilityFilter === 'episodic'}
              label="Episodic"
              onClick={() =>
                setStabilityFilter(stabilityFilter === 'episodic' ? 'all' : 'episodic')
              }
            />
          </div>

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="w-full rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
          >
            <option value="all">All Types</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted/20 border-t-muted" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-muted">No memories match the current filters.</p>
          </div>
        ) : (
          <div className="pb-12">
            {filtered.map((entry) => (
              <MemoryEntryComponent
                key={entry.id}
                entry={entry}
                onUpdate={updateEntry}
                onDelete={deleteEntry}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide transition ${
        active
          ? 'bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900'
          : 'bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700'
      }`}
    >
      {label}
    </button>
  );
}
