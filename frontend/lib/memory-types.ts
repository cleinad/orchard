export const MEMORY_CATEGORIES = [
  'meta',
  'interests',
  'projects',
  'work',
  'beliefs',
  'dislikes',
  'people',
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export interface MemoryFile {
  id: string;
  user_id: string;
  file_path: string;
  category: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export function dailyFilePath(date: Date): string {
  const iso = date.toISOString().split('T')[0];
  return `daily/${iso}.md`;
}

export function longTermFilePath(category: MemoryCategory): string {
  return `long-term/${category}.md`;
}
