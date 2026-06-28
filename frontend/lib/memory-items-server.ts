import { openai } from '@ai-sdk/openai';
import { cosineSimilarity, embed, embedMany } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  estimateTokenCount,
  lexicalOverlapScore,
  type LoadMemoryContextV2Options,
  type MemoryActor,
  type MemoryItem,
} from './memory-items';

const EMBEDDING_MODEL = openai.embedding('text-embedding-3-small');

const DEFAULT_TOKEN_BUDGET = 1000;
const DEFAULT_MAX_ITEMS = 28;
const MAX_SELECT_ITEMS = 600;
const MIN_RELEVANT_SEMANTIC_SCORE = 0.68;
const MIN_RELEVANT_LEXICAL_SCORE = 0.25;

const CORE_PROFILE_TYPES = new Set([
  'profile',
  'identity',
  'goal',
  'constraint',
]);

type ScoredItem = {
  item: MemoryItem;
  score: number;
};

interface SemanticMatchRow {
  memory_item_id: string;
  similarity: number;
}

interface EmbeddingUpsertInput {
  memoryItemId: string;
  text: string;
}

export async function loadMemoryContextV2(
  supabase: SupabaseClient,
  userId: string,
  options: LoadMemoryContextV2Options
): Promise<string> {
  const activeItems = await loadActiveMemoryItems(supabase, userId);
  if (activeItems.length === 0) return '';

  const actor = options.actor;
  const mentorId = options.mentorId ?? null;
  const workspaceId = options.workspaceId ?? null;

  const globalItems = activeItems.filter((item) => item.owner_type === 'global');
  const mentorItems = mentorId
    ? activeItems.filter(
        (item) => item.owner_type === 'mentor' && item.owner_id === mentorId
      )
    : [];
  const workspaceItems = workspaceId
    ? activeItems.filter(
        (item) => item.owner_type === 'workspace' && item.owner_id === workspaceId
      )
    : [];

  const retrievalPool =
    actor === 'mentor'
      ? mentorItems
      : actor === 'workspace'
        ? [...globalItems, ...workspaceItems]
        : globalItems;
  const episodicPool = retrievalPool.filter((item) => item.stability === 'episodic');

  const semanticScoreMap = await buildSemanticScoreMap(
    supabase,
    userId,
    retrievalPool,
    options.query || ''
  );

  const coreItems = selectCoreProfileItems(actor, retrievalPool, globalItems);
  const selectedIds = new Set(coreItems.map((entry) => entry.item.id));

  const relevantItems = selectRelevantItems(
    retrievalPool,
    options.query || '',
    semanticScoreMap,
    selectedIds,
    actor
  );
  for (const entry of relevantItems) {
    selectedIds.add(entry.item.id);
  }

  const episodicItems = selectRecentEpisodicItems(
    episodicPool,
    options.query || '',
    semanticScoreMap,
    selectedIds
  );

  const tokenBudget = clamp(options.tokenBudget ?? DEFAULT_TOKEN_BUDGET, 800, 1200);
  const maxItems = clamp(options.maxItems ?? DEFAULT_MAX_ITEMS, 20, 35);

  const trimmed = trimToBudget(
    actor,
    coreItems,
    relevantItems,
    episodicItems,
    tokenBudget,
    maxItems
  );

  return renderMemoryContext(actor, trimmed.core, trimmed.relevant, trimmed.episodic);
}

export async function upsertMemoryItemEmbeddings(
  supabase: SupabaseClient,
  userId: string,
  inputs: EmbeddingUpsertInput[]
): Promise<number> {
  if (!process.env.OPENAI_API_KEY || inputs.length === 0) return 0;

  try {
    const texts = inputs.map((input) => clampEmbeddingText(input.text));
    const { embeddings } = await embedMany({
      model: EMBEDDING_MODEL,
      values: texts,
    });

    if (embeddings.length !== inputs.length) return 0;

    const payload = inputs.map((input, idx) => ({
      memory_item_id: input.memoryItemId,
      user_id: userId,
      embedding: embeddings[idx],
    }));

    const { error } = await supabase
      .from('memory_item_embeddings')
      .upsert(payload, { onConflict: 'memory_item_id' });

    if (error) {
      console.error('[Memory V2] Failed to upsert embeddings:', error.message);
      return 0;
    }

    return payload.length;
  } catch (error) {
    console.error('[Memory V2] Embedding generation failed:', error);
    return 0;
  }
}

export async function deleteMemoryItemEmbedding(
  supabase: SupabaseClient,
  userId: string,
  memoryItemId: string
): Promise<void> {
  const { error } = await supabase
    .from('memory_item_embeddings')
    .delete()
    .eq('user_id', userId)
    .eq('memory_item_id', memoryItemId);

  if (error) {
    console.error('[Memory V2] Failed to delete embedding:', error.message);
  }
}

async function loadActiveMemoryItems(
  supabase: SupabaseClient,
  userId: string
): Promise<MemoryItem[]> {
  const { data, error } = await supabase
    .from('memory_items')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(MAX_SELECT_ITEMS);

  if (error) {
    console.error('[Memory V2] Failed to load memory items:', error.message);
    return [];
  }

  return (data || []) as MemoryItem[];
}

async function buildSemanticScoreMap(
  supabase: SupabaseClient,
  userId: string,
  pool: MemoryItem[],
  query: string
): Promise<Map<string, number>> {
  const cleanQuery = query.trim();
  if (!cleanQuery || pool.length === 0 || !process.env.OPENAI_API_KEY) {
    return new Map<string, number>();
  }

  const queryEmbedding = await embedQuery(cleanQuery);
  if (!queryEmbedding) return new Map<string, number>();

  const idSet = new Set(pool.map((item) => item.id));

  const rpcScores = await loadSemanticScoresViaRpc(supabase, userId, queryEmbedding, idSet);
  if (rpcScores.size > 0) return rpcScores;

  return loadSemanticScoresViaRows(supabase, userId, queryEmbedding, idSet);
}

async function embedQuery(query: string): Promise<number[] | null> {
  try {
    const { embedding } = await embed({
      model: EMBEDDING_MODEL,
      value: clampEmbeddingText(query),
    });

    return embedding as number[];
  } catch (error) {
    console.error('[Memory V2] Query embedding failed:', error);
    return null;
  }
}

async function loadSemanticScoresViaRpc(
  supabase: SupabaseClient,
  userId: string,
  queryEmbedding: number[],
  poolIds: Set<string>
): Promise<Map<string, number>> {
  try {
    const { data, error } = await supabase.rpc('match_memory_items', {
      p_user_id: userId,
      p_query_embedding: queryEmbedding,
      p_match_count: 80,
    });

    if (error || !Array.isArray(data)) return new Map<string, number>();

    const scores = new Map<string, number>();
    for (const row of data as SemanticMatchRow[]) {
      if (!poolIds.has(row.memory_item_id)) continue;
      scores.set(row.memory_item_id, clamp(row.similarity || 0, 0, 1));
    }

    return scores;
  } catch {
    return new Map<string, number>();
  }
}

async function loadSemanticScoresViaRows(
  supabase: SupabaseClient,
  userId: string,
  queryEmbedding: number[],
  poolIds: Set<string>
): Promise<Map<string, number>> {
  const ids = Array.from(poolIds);
  const scores = new Map<string, number>();

  for (const chunk of chunkArray(ids, 150)) {
    const { data, error } = await supabase
      .from('memory_item_embeddings')
      .select('memory_item_id, embedding')
      .eq('user_id', userId)
      .in('memory_item_id', chunk);

    if (error || !data) continue;

    for (const row of data as Array<{ memory_item_id: string; embedding: unknown }>) {
      const vector = parseEmbeddingVector(row.embedding);
      if (!vector || vector.length === 0) continue;
      const similarity = clamp(cosineSimilarity(queryEmbedding, vector), -1, 1);
      scores.set(row.memory_item_id, (similarity + 1) / 2);
    }
  }

  return scores;
}

function selectCoreProfileItems(
  actor: MemoryActor,
  retrievalPool: MemoryItem[],
  globalItems: MemoryItem[]
): ScoredItem[] {
  const pool =
    actor === 'mentor'
      ? globalItems.filter((item) => item.stability === 'stable')
      : retrievalPool.filter((item) => item.stability === 'stable');

  const scored = pool
    .filter((item) => CORE_PROFILE_TYPES.has(item.type.trim().toLowerCase()))
    .map((item) => {
      const salience = item.salience / 100;
      const confidence = item.confidence;
      const recency = recencyScore(item.updated_at);
      const ownerBonus = item.owner_type === 'global' ? 0.08 : 0;

      return {
        item,
        score: salience * 0.52 + confidence * 0.2 + recency * 0.16 + ownerBonus,
      };
    })
    .sort((a, b) => b.score - a.score);

  const maxCore = actor === 'mentor' ? 6 : actor === 'workspace' ? 9 : 9;
  return scored.slice(0, maxCore);
}

function selectRelevantItems(
  pool: MemoryItem[],
  query: string,
  semanticScoreMap: Map<string, number>,
  selectedIds: Set<string>,
  actor: MemoryActor
): ScoredItem[] {
  const cleanQuery = query.trim();

  const scored = pool
    .filter((item) => !selectedIds.has(item.id))
    .map((item) => {
      const semantic = semanticScoreMap.get(item.id) ?? 0;
      const lexical = cleanQuery ? lexicalOverlapScore(cleanQuery, item.text) : 0;
      const salience = item.salience / 100;
      const recency = recencyScore(item.updated_at);
      const confidence = item.confidence;

      const score =
        semantic * 0.5 + lexical * 0.2 + salience * 0.15 + recency * 0.07 + confidence * 0.08;

      return { item, score, semantic, lexical };
    })
    .filter((entry) => isMemoryRelevant(entry.semantic, entry.lexical))
    .sort((a, b) => b.score - a.score);

  const maxRelevant = actor === 'mentor' ? 12 : 16;
  return scored.slice(0, maxRelevant);
}

function selectRecentEpisodicItems(
  episodicPool: MemoryItem[],
  query: string,
  semanticScoreMap: Map<string, number>,
  selectedIds: Set<string>
): ScoredItem[] {
  const cleanQuery = query.trim();

  const scored = episodicPool
    .filter((item) => !selectedIds.has(item.id))
    .map((item) => {
      const recency = recencyScore(item.updated_at);
      const salience = item.salience / 100;
      const confidence = item.confidence;
      const semantic = semanticScoreMap.get(item.id) ?? 0;
      const lexical = cleanQuery ? lexicalOverlapScore(cleanQuery, item.text) : 0;
      return {
        item,
        score: salience * 0.4 + recency * 0.4 + confidence * 0.2,
        semantic,
        lexical,
      };
    })
    .filter((entry) => isMemoryRelevant(entry.semantic, entry.lexical))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 8);
}

function isMemoryRelevant(semantic: number, lexical: number): boolean {
  return semantic >= MIN_RELEVANT_SEMANTIC_SCORE || lexical >= MIN_RELEVANT_LEXICAL_SCORE;
}

function trimToBudget(
  actor: MemoryActor,
  core: ScoredItem[],
  relevant: ScoredItem[],
  episodic: ScoredItem[],
  tokenBudget: number,
  maxItems: number
): { core: ScoredItem[]; relevant: ScoredItem[]; episodic: ScoredItem[] } {
  const trimmedCore = [...core];
  const trimmedRelevant = [...relevant];
  const trimmedEpisodic = [...episodic];

  const minCore = Math.min(actor === 'mentor' ? 2 : 3, trimmedCore.length);

  while (true) {
    const totalItems =
      trimmedCore.length + trimmedRelevant.length + trimmedEpisodic.length;
    const rendered = renderMemoryContext(actor, trimmedCore, trimmedRelevant, trimmedEpisodic);
    const tokenCount = estimateTokenCount(rendered);

    if (totalItems <= maxItems && tokenCount <= tokenBudget) {
      return {
        core: trimmedCore,
        relevant: trimmedRelevant,
        episodic: trimmedEpisodic,
      };
    }

    if (trimmedEpisodic.length > 0) {
      trimmedEpisodic.pop();
      continue;
    }

    if (trimmedRelevant.length > 0) {
      trimmedRelevant.pop();
      continue;
    }

    if (trimmedCore.length > minCore) {
      trimmedCore.pop();
      continue;
    }

    return {
      core: trimmedCore,
      relevant: trimmedRelevant,
      episodic: trimmedEpisodic,
    };
  }
}

function renderMemoryContext(
  actor: MemoryActor,
  core: ScoredItem[],
  relevant: ScoredItem[],
  episodic: ScoredItem[]
): string {
  const sections: string[] = [];

  if (core.length > 0) {
    const title = actor === 'mentor' ? '## Global Profile' : '## Core Profile';
    sections.push(`${title}\n${core.map((entry) => formatMemoryLine(entry.item)).join('\n')}`);
  }

  if (relevant.length > 0) {
    sections.push(
      `## Relevant Recall\n${relevant
        .map((entry) => formatMemoryLine(entry.item))
        .join('\n')}`
    );
  }

  if (episodic.length > 0) {
    sections.push(
      `## Recent Episodic\n${episodic
        .map((entry) => formatMemoryLine(entry.item))
        .join('\n')}`
    );
  }

  return sections.join('\n\n');
}

function formatMemoryLine(item: MemoryItem): string {
  const scopeLabel =
    item.owner_type === 'global'
      ? 'global'
      : item.owner_type === 'workspace'
        ? 'workspace'
        : 'mentor';
  const typeLabel = item.type.trim() || 'memory';
  return `- [${scopeLabel}/${typeLabel}] ${item.text}`;
}

function recencyScore(timestamp: string): number {
  const value = new Date(timestamp).getTime();
  if (!Number.isFinite(value)) return 0.5;
  const ageDays = Math.max(0, (Date.now() - value) / (1000 * 60 * 60 * 24));
  return Math.exp(-ageDays / 45);
}

function parseEmbeddingVector(input: unknown): number[] | null {
  if (Array.isArray(input)) {
    const values = input.filter((value): value is number => typeof value === 'number');
    return values.length > 0 ? values : null;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const values = parsed.filter((value): value is number => typeof value === 'number');
        return values.length > 0 ? values : null;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function clampEmbeddingText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 6000) return trimmed;
  return trimmed.slice(0, 6000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
