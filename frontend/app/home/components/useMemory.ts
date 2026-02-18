import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { parseLongTermFile, parseDailyFile } from '@/lib/memory-entries';
import {
  MEMORY_CATEGORIES,
  type MemoryFile,
  type MemoryEntry,
  type MemoryCategory,
  type LongTermEntry,
  type DailyEntry,
} from '@/lib/memory-types';

export function useMemory() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load all long-term files
      const { data: longTermFiles } = await supabase
        .from('memory_files')
        .select('*')
        .neq('category', 'daily')
        .neq('content', '');

      // Load last 7 days of daily files
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoffPath = `daily/${sevenDaysAgo.toISOString().split('T')[0]}.md`;

      const { data: dailyFiles } = await supabase
        .from('memory_files')
        .select('*')
        .eq('category', 'daily')
        .gte('file_path', cutoffPath)
        .neq('content', '')
        .order('file_path', { ascending: false });

      const parsed: MemoryEntry[] = [];

      // Parse long-term files in category order
      for (const category of MEMORY_CATEGORIES) {
        const file = longTermFiles?.find((f: MemoryFile) => f.category === category);
        if (!file) continue;
        const fileEntries = parseLongTermFile(file);
        fileEntries.forEach((entry, index) => {
          parsed.push({
            type: 'long-term',
            fileId: file.id,
            entryIndex: index,
            category: category as MemoryCategory,
            longTerm: entry,
          });
        });
      }

      // Parse daily files
      if (dailyFiles) {
        for (const file of dailyFiles as MemoryFile[]) {
          const date = file.file_path.replace('daily/', '').replace('.md', '');
          const fileEntries = parseDailyFile(file);
          fileEntries.forEach((entry, index) => {
            parsed.push({
              type: 'daily',
              fileId: file.id,
              entryIndex: index,
              date,
              daily: entry,
            });
          });
        }
      }

      setEntries(parsed);
    } catch (err) {
      console.error('Failed to load memories:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateEntry = useCallback(
    async (entry: MemoryEntry, updated: LongTermEntry | DailyEntry) => {
      // Optimistic update
      const prev = entries;
      setEntries((curr) =>
        curr.map((e) =>
          e.fileId === entry.fileId && e.entryIndex === entry.entryIndex
            ? {
                ...e,
                longTerm: entry.type === 'long-term' ? (updated as LongTermEntry) : e.longTerm,
                daily: entry.type === 'daily' ? (updated as DailyEntry) : e.daily,
              }
            : e
        )
      );

      try {
        const res = await fetch('/api/memory', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: entry.fileId,
            entryIndex: entry.entryIndex,
            updated,
          }),
        });
        if (!res.ok) throw new Error('Failed to update');
      } catch {
        setEntries(prev); // revert
      }
    },
    [entries]
  );

  const deleteEntry = useCallback(
    async (entry: MemoryEntry) => {
      // Optimistic removal
      const prev = entries;
      setEntries((curr) =>
        curr
          .filter(
            (e) => !(e.fileId === entry.fileId && e.entryIndex === entry.entryIndex)
          )
          // Re-index remaining entries in the same file
          .map((e) => {
            if (e.fileId === entry.fileId && e.entryIndex > entry.entryIndex) {
              return { ...e, entryIndex: e.entryIndex - 1 };
            }
            return e;
          })
      );

      try {
        const res = await fetch('/api/memory', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: entry.fileId,
            entryIndex: entry.entryIndex,
          }),
        });
        if (!res.ok) throw new Error('Failed to delete');
      } catch {
        setEntries(prev); // revert
      }
    },
    [entries]
  );

  return { entries, loading, load, updateEntry, deleteEntry };
}
