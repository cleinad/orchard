'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useMemory } from './useMemory';
import MemoryEntryComponent from './MemoryEntry';

type ScopeFilter = 'all' | 'global' | 'mentor';
type StabilityFilter = 'all' | 'stable' | 'episodic';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function MemoryPanel({ isOpen, onClose }: Props) {
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [stabilityFilter, setStabilityFilter] = useState<StabilityFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { entries, loading, load, updateEntry, deleteEntry } = useMemory();

  useEffect(() => {
    if (isOpen) {
      void load({ scope: 'all', status: 'active' });
    }
  }, [isOpen, load]);

  const handleEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleEscape]);

  const availableTypes = useMemo(() => {
    return Array.from(new Set(entries.map((entry) => entry.type))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (scopeFilter !== 'all' && entry.owner_type !== scopeFilter) return false;
      if (stabilityFilter !== 'all' && entry.stability !== stabilityFilter) return false;
      if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
      return true;
    });
  }, [entries, scopeFilter, stabilityFilter, typeFilter]);

  const hasEntries = filtered.length > 0;

  return (
    <div
      className={`fixed inset-0 z-50 transition-all duration-300 ${
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      <div
        className={`absolute inset-0 bg-foreground/[0.06] backdrop-blur-sm transition-opacity duration-300 dark:bg-black/40 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <div
        className={`absolute right-0 top-0 h-full w-[420px] max-w-[90vw] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div
          className="flex h-full flex-col backdrop-blur-2xl"
          style={{
            background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
            borderLeft: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
            <div>
              <h2 className="text-sm font-medium text-foreground">
                Memory
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Item-based memory view
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted transition hover:bg-foreground/[0.04] hover:text-foreground"
              aria-label="Close"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="border-b border-border-subtle px-4 py-3">
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
              className="w-full rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs text-muted outline-none focus:border-foreground/[0.14]"
            >
              <option value="all">All Types</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground/[0.12] border-t-foreground/60" />
              </div>
            ) : !hasEntries ? (
              <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
                <p className="text-sm text-muted">
                  No memories match the current filters.
                </p>
              </div>
            ) : (
              <div className="pb-8">
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
      className={`rounded-full px-2 py-0.5 text-[10px] tracking-wide transition ${
        active
          ? 'bg-foreground text-background'
          : 'bg-foreground/[0.05] text-muted hover:bg-foreground/[0.08] hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}
