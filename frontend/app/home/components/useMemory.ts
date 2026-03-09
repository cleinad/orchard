import { useState, useCallback } from 'react';
import type {
  MemoryItem,
  MemoryItemUpdateInput,
  MemoryScope,
  MemoryStatus,
} from '@/lib/memory-items';

interface LoadOptions {
  scope?: MemoryScope;
  status?: MemoryStatus;
}

interface MemoryItemsResponse {
  items: MemoryItem[];
}

export function useMemory() {
  const [entries, setEntries] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (options: LoadOptions = {}) => {
    const scope = options.scope ?? 'all';
    const status = options.status ?? 'active';

    setLoading(true);
    try {
      const response = await fetch(
        `/api/memory/items?scope=${encodeURIComponent(scope)}&status=${encodeURIComponent(status)}`,
        {
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load memory items');
      }

      const data = (await response.json()) as MemoryItemsResponse;
      setEntries(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      console.error('Failed to load memories:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateEntry = useCallback(
    async (entry: MemoryItem, updated: MemoryItemUpdateInput) => {
      const previous = entries;

      setEntries((current) =>
        current.map((candidate) => {
          if (candidate.id !== entry.id) return candidate;
          return {
            ...candidate,
            ...updated,
            text: updated.text ?? candidate.text,
            type: updated.type ?? candidate.type,
            stability: updated.stability ?? candidate.stability,
            sensitivity: updated.sensitivity ?? candidate.sensitivity,
            status: updated.status ?? candidate.status,
            salience: updated.salience ?? candidate.salience,
            confidence: updated.confidence ?? candidate.confidence,
          } as MemoryItem;
        })
      );

      try {
        const response = await fetch(`/api/memory/items/${entry.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        });

        if (!response.ok) {
          throw new Error('Failed to update memory item');
        }

        const payload = (await response.json()) as { item?: MemoryItem };
        if (payload.item) {
          setEntries((current) =>
            current.map((candidate) =>
              candidate.id === payload.item!.id ? payload.item! : candidate
            )
          );
        }
      } catch (error) {
        console.error('Failed to update memory:', error);
        setEntries(previous);
      }
    },
    [entries]
  );

  const deleteEntry = useCallback(
    async (entry: MemoryItem) => {
      const previous = entries;
      setEntries((current) => current.filter((candidate) => candidate.id !== entry.id));

      try {
        const response = await fetch(`/api/memory/items/${entry.id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error('Failed to delete memory item');
        }
      } catch (error) {
        console.error('Failed to delete memory:', error);
        setEntries(previous);
      }
    },
    [entries]
  );

  return { entries, loading, load, updateEntry, deleteEntry };
}
