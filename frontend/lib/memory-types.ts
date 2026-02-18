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

export const CATEGORY_HEADINGS: Record<MemoryCategory, string> = {
  meta: 'About the User',
  interests: 'Interests',
  projects: 'Projects',
  work: 'Work',
  beliefs: 'Beliefs',
  dislikes: 'Dislikes',
  people: 'People',
};

export interface MemoryFile {
  id: string;
  user_id: string;
  file_path: string;
  category: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface LongTermEntry {
  topic: string;
  details: string;
  date: string;
}

export interface DailyEntry {
  text: string;
}

export interface MemoryEntry {
  type: 'long-term' | 'daily';
  fileId: string;
  entryIndex: number;
  category?: MemoryCategory;
  date?: string; // for daily: the date from file_path
  longTerm?: LongTermEntry;
  daily?: DailyEntry;
}

export function dailyFilePath(date: Date): string {
  const iso = date.toISOString().split('T')[0];
  return `daily/${iso}.md`;
}
