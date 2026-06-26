export const MEMORY_OWNER_TYPES = ['global', 'mentor', 'workspace'] as const;
export type MemoryOwnerType = (typeof MEMORY_OWNER_TYPES)[number];

export const MEMORY_STABILITIES = ['stable', 'episodic'] as const;
export type MemoryStability = (typeof MEMORY_STABILITIES)[number];

export const MEMORY_SENSITIVITIES = ['normal', 'private', 'sensitive'] as const;
export type MemorySensitivity = (typeof MEMORY_SENSITIVITIES)[number];

export const MEMORY_STATUSES = ['active', 'superseded', 'deleted'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export type MemoryActor = 'default' | 'mentor' | 'workspace';

export interface MemoryItem {
  id: string;
  user_id: string;
  owner_type: MemoryOwnerType;
  owner_id: string | null;
  type: string;
  text: string;
  normalized_text: string;
  confidence: number;
  salience: number;
  stability: MemoryStability;
  sensitivity: MemorySensitivity;
  status: MemoryStatus;
  source_conversation_id: string | null;
  source_message_id: string | null;
  source_role: 'user' | 'assistant' | null;
  created_at: string;
  updated_at: string;
}

export interface LoadMemoryContextV2Options {
  actor: MemoryActor;
  mentorId?: string | null;
  workspaceId?: string | null;
  query?: string;
  tokenBudget?: number;
  maxItems?: number;
}

export interface MemoryItemUpdateInput {
  text?: string;
  type?: string;
  stability?: MemoryStability;
  sensitivity?: MemorySensitivity;
  status?: MemoryStatus;
  salience?: number;
  confidence?: number;
}

export type MemoryScope = 'all' | 'global' | `mentor:${string}` | `workspace:${string}`;

export function normalizeMemoryText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clampSalience(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  return Math.min(1, Math.max(0, Number(value.toFixed(3))));
}

export function estimateTokenCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.33);
}

export function lexicalOverlapScore(query: string, text: string): number {
  const queryTokens = tokenizeForSimilarity(query);
  const textTokens = tokenizeForSimilarity(text);

  if (queryTokens.size === 0 || textTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) overlap += 1;
  }

  return overlap / queryTokens.size;
}

export function jaccardSimilarity(a: string, b: string): number {
  const aTokens = tokenizeForSimilarity(a);
  const bTokens = tokenizeForSimilarity(b);

  if (aTokens.size === 0 && bTokens.size === 0) return 1;
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }

  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

export function parseMemoryScope(scope: string | null | undefined): MemoryScope {
  if (!scope || scope === 'all') return 'all';
  if (scope === 'global') return 'global';
  if (scope.startsWith('mentor:') && scope.length > 'mentor:'.length) {
    return scope as MemoryScope;
  }
  if (scope.startsWith('workspace:') && scope.length > 'workspace:'.length) {
    return scope as MemoryScope;
  }
  return 'all';
}

export function parseMentorScope(scope: MemoryScope): string | null {
  if (!scope.startsWith('mentor:')) return null;
  return scope.replace(/^mentor:/, '') || null;
}

export function parseWorkspaceScope(scope: MemoryScope): string | null {
  if (!scope.startsWith('workspace:')) return null;
  return scope.replace(/^workspace:/, '') || null;
}

function tokenizeForSimilarity(value: string): Set<string> {
  const normalized = normalizeMemoryText(value);
  if (!normalized) return new Set<string>();

  const tokens = normalized
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

  return new Set(tokens);
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'we',
  'with',
  'you',
  'your',
]);
