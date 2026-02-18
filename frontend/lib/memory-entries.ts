import type { MemoryFile, LongTermEntry, DailyEntry } from './memory-types';

/**
 * Parse a long-term memory file into individual entries.
 * Format: `- topic | details | YYYY-MM-DD`
 */
export function parseLongTermFile(file: MemoryFile): LongTermEntry[] {
  if (!file.content?.trim()) return [];

  return file.content
    .split('\n')
    .filter((line) => line.trim().startsWith('-'))
    .map((line) => {
      const content = line.replace(/^-\s*/, '').trim();
      const parts = content.split('|').map((p) => p.trim());
      return {
        topic: parts[0] || '',
        details: parts[1] || '',
        date: parts[2] || '',
      };
    })
    .filter((entry) => entry.topic);
}

/**
 * Parse a daily memory file into individual entries.
 * Format: `- bullet text`
 */
export function parseDailyFile(file: MemoryFile): DailyEntry[] {
  if (!file.content?.trim()) return [];

  return file.content
    .split('\n')
    .filter((line) => line.trim().startsWith('-'))
    .map((line) => ({
      text: line.replace(/^-\s*/, '').trim(),
    }))
    .filter((entry) => entry.text);
}

/**
 * Serialize long-term entries back into pipe-delimited content.
 */
export function serializeLongTermEntries(entries: LongTermEntry[]): string {
  return entries
    .map((e) => `- ${e.topic} | ${e.details} | ${e.date}`)
    .join('\n');
}

/**
 * Serialize daily entries back into bullet content.
 */
export function serializeDailyEntries(entries: DailyEntry[]): string {
  return entries.map((e) => `- ${e.text}`).join('\n');
}
