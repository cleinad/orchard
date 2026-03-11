import { generateObject } from 'ai';
import { z } from 'zod';
import { MEMORY_MODEL } from './models';
import {
  clampConfidence,
  clampSalience,
  jaccardSimilarity,
  normalizeMemoryText,
  type MemoryItem,
  type MemoryOwnerType,
} from './memory-items';
import {
  upsertMemoryItemEmbeddings,
} from './memory-items-server';
import { createSupabaseServiceClient } from './supabase-service';

const MEMORY_V2_AGENT_PROMPT = `You are the Novus memory extraction agent.

Goal: extract atomic memory candidates from a conversation transcript.

Rules:
1. Output only genuinely useful memory candidates.
2. Each candidate must be atomic and standalone.
3. Avoid trivia, conversation mechanics, and one-off politeness.
4. Prefer specific facts, preferences, commitments, constraints, recurring context, and meaningful events.
5. If no candidate is useful, return an empty list.
6. Use action=update when the user refined or corrected a previous idea.
7. Use action=ignore for noisy or uncertain candidates.
8. Return at most 16 candidates.
9. Use salience as a number from 0 to 100.
10. Use confidence as a number from 0 to 1.

Keep text concise (1 sentence).`;

const CandidateSchema = z.object({
  type: z.string(),
  text: z.string(),
  stability: z.enum(['stable', 'episodic']),
  sensitivity: z.enum(['normal', 'private', 'sensitive']),
  salience: z.number(),
  confidence: z.number(),
  action: z.enum(['insert', 'update', 'ignore']),
});

const MemoryExtractionSchema = z.object({
  candidates: z.array(CandidateSchema),
});

interface ConversationMessage {
  role: string;
  content: string;
}

interface ProcessMemoryV2Context {
  conversationId?: string | null;
  mentorId?: string | null;
  sourceMessageId?: string | null;
  sourceRole?: 'user' | 'assistant';
}

interface MergeStats {
  extracted: number;
  inserted: number;
  merged: number;
  superseded: number;
  ignored: number;
  invalid: number;
  embedded: number;
}

const MAX_MEMORY_TYPE_LENGTH = 48;
const MAX_MEMORY_TEXT_LENGTH = 500;

export async function processMemoryV2(
  userId: string,
  conversationMessages: ConversationMessage[],
  latestResponse: string,
  context: ProcessMemoryV2Context = {}
): Promise<void> {
  const supabase = createSupabaseServiceClient();

  const ownerType: MemoryOwnerType = context.mentorId ? 'mentor' : 'global';
  const ownerId = context.mentorId ?? null;

  const fullExchange = [
    ...conversationMessages.slice(-8),
    { role: 'assistant', content: latestResponse },
  ];

  const transcript = fullExchange
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n\n');

  const { object } = await generateObject({
    model: MEMORY_MODEL,
    system: MEMORY_V2_AGENT_PROMPT,
    prompt: `Date: ${new Date().toISOString().slice(0, 10)}\nScope owner_type=${ownerType}${
      ownerId ? ` owner_id=${ownerId}` : ''
    }\n\nConversation transcript:\n${transcript}`,
    schema: MemoryExtractionSchema,
  });

  const candidates = (object.candidates || []).slice(0, 16);

  const stats: MergeStats = {
    extracted: candidates.length,
    inserted: 0,
    merged: 0,
    superseded: 0,
    ignored: 0,
    invalid: 0,
    embedded: 0,
  };

  if (candidates.length === 0) {
    console.log('[Memory V2] no candidates extracted');
    return;
  }

  let scopeQuery = supabase
    .from('memory_items')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('owner_type', ownerType)
    .order('updated_at', { ascending: false })
    .limit(300);

  if (ownerType === 'mentor') {
    scopeQuery = scopeQuery.eq('owner_id', ownerId);
  } else {
    scopeQuery = scopeQuery.is('owner_id', null);
  }

  const { data: existingRows, error: existingError } = await scopeQuery;
  if (existingError) {
    console.error('[Memory V2] failed to load existing scope items:', existingError.message);
    return;
  }

  const activeItems = [...((existingRows || []) as MemoryItem[])];
  const embeddingUpserts = new Map<string, { memoryItemId: string; text: string }>();

  for (const candidate of candidates) {
    const candidateText = sanitizeCandidateText(candidate.text);
    const normalizedCandidateText = normalizeMemoryText(candidateText);
    const sanitizedType = sanitizeType(candidate.type);

    if (candidate.action === 'ignore') {
      stats.ignored += 1;
      continue;
    }

    if (!normalizedCandidateText || candidateText.length < 6) {
      stats.invalid += 1;
      continue;
    }

    const byType = activeItems.filter((item) => item.type === sanitizedType);
    const exactMatch = byType.find(
      (item) => item.normalized_text === normalizedCandidateText
    );

    const baseUpdate = {
      type: sanitizedType,
      text: candidateText,
      normalized_text: normalizedCandidateText,
      stability: candidate.stability,
      sensitivity: candidate.sensitivity,
      salience: clampSalience(candidate.salience),
      confidence: clampConfidence(candidate.confidence),
      source_conversation_id: context.conversationId ?? null,
      source_message_id: context.sourceMessageId ?? null,
      source_role: context.sourceRole ?? 'user',
      owner_type: ownerType,
      owner_id: ownerId,
    };

    if (exactMatch) {
      const mergedPayload = {
        ...baseUpdate,
        text: choosePreferredText(exactMatch.text, baseUpdate.text),
        normalized_text: normalizeMemoryText(
          choosePreferredText(exactMatch.text, baseUpdate.text)
        ),
        salience: Math.max(exactMatch.salience, baseUpdate.salience),
        confidence: Math.max(exactMatch.confidence, baseUpdate.confidence),
      };

      const { data: updatedRow, error: updateError } = await supabase
        .from('memory_items')
        .update(mergedPayload)
        .eq('id', exactMatch.id)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (updateError || !updatedRow) {
        stats.invalid += 1;
        continue;
      }

      replaceActiveItem(activeItems, updatedRow as MemoryItem);
      embeddingUpserts.set(updatedRow.id, {
        memoryItemId: updatedRow.id,
        text: updatedRow.text,
      });
      stats.merged += 1;
      continue;
    }

    const nearDuplicate = findNearDuplicate(byType, normalizedCandidateText);

    if (nearDuplicate && nearDuplicate.score >= 0.86) {
      const mergedPayload = {
        ...baseUpdate,
        text: choosePreferredText(nearDuplicate.item.text, baseUpdate.text),
        normalized_text: normalizeMemoryText(
          choosePreferredText(nearDuplicate.item.text, baseUpdate.text)
        ),
        salience: Math.max(nearDuplicate.item.salience, baseUpdate.salience),
        confidence: Math.max(nearDuplicate.item.confidence, baseUpdate.confidence),
      };

      const { data: mergedRow, error: mergeError } = await supabase
        .from('memory_items')
        .update(mergedPayload)
        .eq('id', nearDuplicate.item.id)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (mergeError || !mergedRow) {
        stats.invalid += 1;
        continue;
      }

      replaceActiveItem(activeItems, mergedRow as MemoryItem);
      embeddingUpserts.set(mergedRow.id, {
        memoryItemId: mergedRow.id,
        text: mergedRow.text,
      });
      stats.merged += 1;
      continue;
    }

    if (candidate.action === 'update' && nearDuplicate && nearDuplicate.score >= 0.45) {
      const { error: supersedeError } = await supabase
        .from('memory_items')
        .update({ status: 'superseded' })
        .eq('id', nearDuplicate.item.id)
        .eq('user_id', userId);

      if (!supersedeError) {
        removeActiveItem(activeItems, nearDuplicate.item.id);
        stats.superseded += 1;
      }
    }

    const { data: insertedRow, error: insertError } = await supabase
      .from('memory_items')
      .insert({
        ...baseUpdate,
        user_id: userId,
        status: 'active',
      })
      .select('*')
      .single();

    if (insertError || !insertedRow) {
      stats.invalid += 1;
      continue;
    }

    activeItems.unshift(insertedRow as MemoryItem);
    embeddingUpserts.set(insertedRow.id, {
      memoryItemId: insertedRow.id,
      text: insertedRow.text,
    });
    stats.inserted += 1;
  }

  stats.embedded = await upsertMemoryItemEmbeddings(
    supabase,
    userId,
    Array.from(embeddingUpserts.values())
  );

  console.log('[Memory V2] merge stats', {
    userId,
    ownerType,
    ownerId,
    ...stats,
  });
}

export async function processMemory(
  userId: string,
  conversationMessages: ConversationMessage[],
  latestResponse: string,
  context: ProcessMemoryV2Context = {}
): Promise<void> {
  await processMemoryV2(userId, conversationMessages, latestResponse, context);
}

function sanitizeType(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return (normalized || 'general').slice(0, MAX_MEMORY_TYPE_LENGTH);
}

function sanitizeCandidateText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MEMORY_TEXT_LENGTH);
}

function choosePreferredText(existingText: string, candidateText: string): string {
  const existing = existingText.trim();
  const next = candidateText.trim();
  if (!existing) return next;
  if (!next) return existing;

  // Prefer the richer sentence while avoiding abrupt replacement with shorter fragments.
  if (next.length >= existing.length * 0.8) return next;
  return existing;
}

function findNearDuplicate(
  rows: MemoryItem[],
  normalizedCandidateText: string
): { item: MemoryItem; score: number } | null {
  let best: { item: MemoryItem; score: number } | null = null;

  for (const row of rows) {
    const score = Math.max(
      jaccardSimilarity(normalizedCandidateText, row.normalized_text),
      containmentScore(normalizedCandidateText, row.normalized_text)
    );

    if (!best || score > best.score) {
      best = { item: row, score };
    }
  }

  return best;
}

function containmentScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const shortest = Math.min(a.length, b.length);
    const longest = Math.max(a.length, b.length);
    return shortest / longest;
  }
  return 0;
}

function replaceActiveItem(items: MemoryItem[], replacement: MemoryItem): void {
  const index = items.findIndex((item) => item.id === replacement.id);
  if (index === -1) {
    items.unshift(replacement);
    return;
  }

  items[index] = replacement;
}

function removeActiveItem(items: MemoryItem[], id: string): void {
  const index = items.findIndex((item) => item.id === id);
  if (index !== -1) {
    items.splice(index, 1);
  }
}
