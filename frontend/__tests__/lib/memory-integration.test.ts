import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSupabase, type MutationTracker } from '../helpers/mock-supabase';
import type { MemoryItem } from '@/lib/memory-items';

// ── Mocks ────────────────────────────────────────────────────

// Mock generateObject — replaces the LLM call
const mockGenerateObject = vi.fn();
const mockEmbed = vi.fn();
const mockEmbedMany = vi.fn();
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateObject: (...args: unknown[]) => mockGenerateObject(...args),
    embed: (...args: unknown[]) => mockEmbed(...args),
    embedMany: (...args: unknown[]) => mockEmbedMany(...args),
  };
});

// Mock the embedding model import
vi.mock('@ai-sdk/openai', () => ({
  openai: { embedding: () => 'mock-embedding-model' },
}));

// Mock the memory model import
vi.mock('@/lib/models', () => ({
  MEMORY_MODEL: 'mock-model',
}));

// Set OPENAI_API_KEY so embedding paths don't short-circuit
vi.stubEnv('OPENAI_API_KEY', 'test-key');

beforeEach(() => {
  vi.clearAllMocks();
  mockEmbed.mockResolvedValue({ embedding: [1, 0] });
  mockEmbedMany.mockImplementation(async (input: { values: unknown[] }) => ({
    embeddings: input.values.map(() => [1, 0]),
  }));
});

// ── Helpers ──────────────────────────────────────────────────

function makeMemoryItem(overrides: Partial<MemoryItem> & { id: string }): MemoryItem {
  return {
    user_id: 'user-1',
    owner_type: 'global',
    owner_id: null,
    type: 'general',
    text: 'some text',
    normalized_text: 'some text',
    confidence: 0.8,
    salience: 50,
    stability: 'stable',
    sensitivity: 'normal',
    status: 'active',
    source_conversation_id: null,
    source_message_id: null,
    source_role: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeCandidate(overrides: Record<string, unknown> = {}) {
  return {
    type: 'profile',
    text: 'User is a CS student at Stanford',
    stability: 'stable',
    sensitivity: 'normal',
    salience: 85,
    confidence: 0.9,
    action: 'insert',
    ...overrides,
  };
}

const dummyMessages = [{ role: 'user', content: 'Hello' }];
const dummyResponse = 'Hi there!';

// ── Write Path Tests ─────────────────────────────────────────

describe('processMemoryV2 — write path', () => {
  let tracker: MutationTracker;

  function setup(existingItems: MemoryItem[], returnOnMutate?: Record<string, unknown>[]) {
    const mock = createMockSupabase({
      tables: {
        memory_items: {
          rows: existingItems,
          returnOnMutate: (returnOnMutate ?? []).map((r) => r as Record<string, unknown>),
        },
        memory_item_embeddings: { rows: [] },
      },
    });
    const client = mock.client as any;
    tracker = mock.tracker;
    return client;
  }

  it('inserts a novel fact into the database', async () => {
    const candidate = makeCandidate();
    mockGenerateObject.mockResolvedValueOnce({
      object: { candidates: [candidate] },
    });

    const insertedRow = { id: 'new-1', ...candidate, user_id: 'user-1', status: 'active' };
    const client = setup([], [insertedRow]);

    const { processMemoryV2 } = await import('@/lib/memory-agent');
    await processMemoryV2(client, 'user-1', dummyMessages, dummyResponse);

    const inserts = tracker.inserts('memory_items');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args).toMatchObject({
      user_id: 'user-1',
      text: 'User is a CS student at Stanford',
      type: 'profile',
      status: 'active',
      owner_type: 'global',
      salience: 85,
      confidence: 0.9,
    });
  });

  it('inserts multiple novel facts', async () => {
    const candidates = [
      makeCandidate({ text: 'User is a CS student', type: 'profile' }),
      makeCandidate({ text: 'User prefers dark mode', type: 'preference' }),
      makeCandidate({ text: 'Working on a capstone project', type: 'project' }),
    ];
    mockGenerateObject.mockResolvedValueOnce({
      object: { candidates },
    });

    const client = setup([], candidates.map((c, i) => ({ id: `new-${i}`, ...c, user_id: 'user-1', status: 'active' })));

    const { processMemoryV2 } = await import('@/lib/memory-agent');
    await processMemoryV2(client, 'user-1', dummyMessages, dummyResponse);

    expect(tracker.inserts('memory_items')).toHaveLength(3);
  });

  it('merges exact duplicate instead of inserting', async () => {
    const candidate = makeCandidate({
      text: 'User is a CS student',
      type: 'profile',
      salience: 70,
      confidence: 0.8,
    });
    mockGenerateObject.mockResolvedValueOnce({
      object: { candidates: [candidate] },
    });

    const existing = makeMemoryItem({
      id: 'existing-1',
      type: 'profile',
      text: 'User is a CS student',
      normalized_text: 'user cs student',
      salience: 60,
      confidence: 0.85,
    });

    const mergedRow = { ...existing, salience: 70, confidence: 0.85 };
    const client = setup([existing], [mergedRow]);

    const { processMemoryV2 } = await import('@/lib/memory-agent');
    await processMemoryV2(client, 'user-1', dummyMessages, dummyResponse);

    expect(tracker.inserts('memory_items')).toHaveLength(0);

    const updates = tracker.updates('memory_items');
    expect(updates).toHaveLength(1);
    // Salience should be max(60, 70) = 70, confidence max(0.85, 0.8) = 0.85
    expect(updates[0].args).toMatchObject({
      salience: 70,
      confidence: 0.85,
    });
  });

  it('merges near-duplicate (jaccard >= 0.86) instead of inserting', async () => {
    // Candidate: "User studies computer science at Stanford" → normalized: "user studies computer science at stanford"
    // Existing normalized: "user studies computer science stanford" (no "at")
    // Normalized texts differ (not exact match), but after stop word removal tokens are identical → jaccard = 1.0
    const candidate = makeCandidate({
      text: 'User studies computer science at Stanford',
      type: 'profile',
      action: 'insert',
    });
    mockGenerateObject.mockResolvedValueOnce({
      object: { candidates: [candidate] },
    });

    const existing = makeMemoryItem({
      id: 'existing-2',
      type: 'profile',
      text: 'User studies computer science Stanford',
      normalized_text: 'user studies computer science stanford',
    });

    const client = setup([existing], [{ ...existing, text: candidate.text }]);

    const { processMemoryV2 } = await import('@/lib/memory-agent');
    await processMemoryV2(client, 'user-1', dummyMessages, dummyResponse);

    expect(tracker.inserts('memory_items')).toHaveLength(0);
    expect(tracker.updates('memory_items')).toHaveLength(1);
  });

  it('does not merge identical text across different types', async () => {
    const candidate = makeCandidate({
      text: 'User loves chess',
      type: 'project',
    });
    mockGenerateObject.mockResolvedValueOnce({
      object: { candidates: [candidate] },
    });

    const existing = makeMemoryItem({
      id: 'existing-different-type',
      type: 'preference',
      text: 'User loves chess',
      normalized_text: 'user loves chess',
    });

    const client = setup([existing], [
      { id: 'inserted-different-type', ...candidate, user_id: 'user-1', status: 'active' },
    ]);

    const { processMemoryV2 } = await import('@/lib/memory-agent');
    await processMemoryV2(client, 'user-1', dummyMessages, dummyResponse);

    expect(tracker.inserts('memory_items')).toHaveLength(1);
    expect(tracker.updates('memory_items')).toHaveLength(0);
  });

  it('supersedes old entry and inserts new one on action=update with moderate similarity', async () => {
    const candidate = makeCandidate({
      text: 'User switched from Python to Rust for their main project',
      type: 'project',
      action: 'update',
    });
    mockGenerateObject.mockResolvedValueOnce({
      object: { candidates: [candidate] },
    });

    const existing = makeMemoryItem({
      id: 'existing-3',
      type: 'project',
      text: 'User uses Python for their main project',
      normalized_text: 'user uses python main project',
    });

    // First returnOnMutate is for the supersede update, second is for the insert
    const client = setup([existing], [
      { ...existing, status: 'superseded' },
      { id: 'new-superseded', ...candidate, user_id: 'user-1', status: 'active' },
    ]);

    const { processMemoryV2 } = await import('@/lib/memory-agent');
    await processMemoryV2(client, 'user-1', dummyMessages, dummyResponse);

    // Should have 2 updates: one to supersede, one... wait.
    // Actually: supersede is an update (status=superseded), then insert for the new row
    const updates = tracker.updates('memory_items');
    const inserts = tracker.inserts('memory_items');

    // The supersede call sets status: 'superseded'
    const supersedeCall = updates.find(
      (u) => (u.args as Record<string, unknown>)?.status === 'superseded'
    );
    expect(supersedeCall).toBeDefined();

    // New item inserted
    expect(inserts.length).toBeGreaterThanOrEqual(1);
    expect(inserts[0].args).toMatchObject({
      text: 'User switched from Python to Rust for their main project',
      status: 'active',
    });
  });

  it('inserts without superseding when action=update has low similarity', async () => {
    const candidate = makeCandidate({
      text: 'User adopted a dog named Pixel',
      type: 'project',
      action: 'update',
    });
    mockGenerateObject.mockResolvedValueOnce({
      object: { candidates: [candidate] },
    });

    const existing = makeMemoryItem({
      id: 'existing-low-similarity',
      type: 'project',
      text: 'User uses Python for backend APIs',
      normalized_text: 'user uses python backend apis',
    });

    const client = setup([existing], [
      { id: 'new-low-similarity', ...candidate, user_id: 'user-1', status: 'active' },
    ]);

    const { processMemoryV2 } = await import('@/lib/memory-agent');
    await processMemoryV2(client, 'user-1', dummyMessages, dummyResponse);

    expect(tracker.inserts('memory_items')).toHaveLength(1);
    const supersedeCall = tracker
      .updates('memory_items')
      .find((record) => (record.args as Record<string, unknown>)?.status === 'superseded');
    expect(supersedeCall).toBeUndefined();
  });

  it('skips candidates with action=ignore', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        candidates: [makeCandidate({ action: 'ignore', text: 'some noisy thing' })],
      },
    });

    const client = setup([]);

    const { processMemoryV2 } = await import('@/lib/memory-agent');
    await processMemoryV2(client, 'user-1', dummyMessages, dummyResponse);

    expect(tracker.inserts('memory_items')).toHaveLength(0);
    expect(tracker.updates('memory_items')).toHaveLength(0);
  });

  it('rejects candidates with too-short text', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        candidates: [makeCandidate({ text: 'Hi', type: 'general' })],
      },
    });

    const client = setup([]);

    const { processMemoryV2 } = await import('@/lib/memory-agent');
    await processMemoryV2(client, 'user-1', dummyMessages, dummyResponse);

    expect(tracker.inserts('memory_items')).toHaveLength(0);
    expect(tracker.updates('memory_items')).toHaveLength(0);
  });

  it('handles a mixed batch correctly', async () => {
    const existingItem = makeMemoryItem({
      id: 'dup-1',
      type: 'preference',
      text: 'User prefers dark mode',
      normalized_text: 'user prefers dark mode',
      salience: 50,
      confidence: 0.7,
    });

    const candidates = [
      makeCandidate({ text: 'User is studying machine learning', type: 'profile' }),
      makeCandidate({ text: 'User works at a startup', type: 'project' }),
      makeCandidate({ text: 'User prefers dark mode', type: 'preference' }), // exact dup
      makeCandidate({ action: 'ignore', text: 'said hello' }),
      makeCandidate({ text: 'Hi', type: 'general' }), // too short
    ];

    mockGenerateObject.mockResolvedValueOnce({
      object: { candidates },
    });

    const client = setup(
      [existingItem],
      [
        // merge return for the exact dup
        { ...existingItem, salience: 85 },
        // insert returns for the 2 novel facts
        { id: 'new-1', text: candidates[0].text, user_id: 'user-1', status: 'active' },
        { id: 'new-2', text: candidates[1].text, user_id: 'user-1', status: 'active' },
      ]
    );

    const { processMemoryV2 } = await import('@/lib/memory-agent');
    await processMemoryV2(client, 'user-1', dummyMessages, dummyResponse);

    expect(tracker.inserts('memory_items')).toHaveLength(2);
    expect(tracker.updates('memory_items')).toHaveLength(1); // the merge
  });

  it('keeps inserted rows even when embedding generation fails', async () => {
    const candidate = makeCandidate({
      text: 'User is preparing for finals',
      type: 'project',
    });
    mockGenerateObject.mockResolvedValueOnce({
      object: { candidates: [candidate] },
    });
    mockEmbedMany.mockRejectedValueOnce(new Error('embedding unavailable'));

    const client = setup([], [
      { id: 'inserted-embedding-failure', ...candidate, user_id: 'user-1', status: 'active' },
    ]);

    const { processMemoryV2 } = await import('@/lib/memory-agent');
    await processMemoryV2(client, 'user-1', dummyMessages, dummyResponse);

    expect(tracker.inserts('memory_items')).toHaveLength(1);
    expect(tracker.upserts('memory_item_embeddings')).toHaveLength(0);
  });

  it('writes mentor-scoped entries when mentorId is provided', async () => {
    const candidate = makeCandidate({
      text: 'Student prefers visual explanations',
      type: 'preference',
    });

    mockGenerateObject.mockResolvedValueOnce({
      object: { candidates: [candidate] },
    });

    const insertedRow = {
      id: 'mentor-new-1',
      ...candidate,
      user_id: 'user-1',
      status: 'active',
      owner_type: 'mentor',
      owner_id: 'mentor-abc',
    };
    const client = setup([], [insertedRow]);

    const { processMemoryV2 } = await import('@/lib/memory-agent');
    await processMemoryV2(client, 'user-1', dummyMessages, dummyResponse, {
      mentorId: 'mentor-abc',
    });

    const inserts = tracker.inserts('memory_items');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args).toMatchObject({
      owner_type: 'mentor',
      owner_id: 'mentor-abc',
    });
  });
});

// ── Read Path Tests ──────────────────────────────────────────

describe('loadMemoryContextV2 — read path', () => {
  it('returns empty string when no active items exist', async () => {
    const { client } = createMockSupabase({
      tables: { memory_items: { rows: [] } },
    });

    const { loadMemoryContextV2 } = await import('@/lib/memory-items-server');
    const result = await loadMemoryContextV2(client as any, 'user-1', {
      actor: 'default',
    });

    expect(result).toBe('');
  });

  it('includes Core Profile section with stable high-salience items', async () => {
    const items: MemoryItem[] = [
      makeMemoryItem({ id: '1', type: 'profile', text: 'User is an engineer', salience: 95, stability: 'stable' }),
      makeMemoryItem({ id: '2', type: 'goal', text: 'Wants to learn Rust', salience: 90, stability: 'stable' }),
      makeMemoryItem({ id: '3', type: 'preference', text: 'Prefers concise answers', salience: 85, stability: 'stable' }),
      makeMemoryItem({ id: '4', type: 'hobby', text: 'Enjoys hiking', salience: 30, stability: 'stable' }),
      makeMemoryItem({ id: '5', type: 'event', text: 'Had a meeting yesterday', salience: 60, stability: 'episodic' }),
    ];

    const { client } = createMockSupabase({
      tables: {
        memory_items: { rows: items },
        memory_item_embeddings: { rows: [] },
      },
    });

    const { loadMemoryContextV2 } = await import('@/lib/memory-items-server');
    const result = await loadMemoryContextV2(client as any, 'user-1', {
      actor: 'default',
    });

    expect(result).toContain('## Core Profile');
    expect(result).toContain('User is an engineer');
    expect(result).toContain('Wants to learn Rust');
  });

  it('trims to budget, dropping episodic items first', async () => {
    // Create many items that will exceed the default 1000 token budget
    const stableItems = Array.from({ length: 10 }, (_, i) =>
      makeMemoryItem({
        id: `stable-${i}`,
        type: 'profile',
        text: `Important stable fact number ${i} with extra detail to consume tokens in the budget`,
        salience: 90 - i,
        stability: 'stable',
      })
    );

    const episodicItems = Array.from({ length: 20 }, (_, i) =>
      makeMemoryItem({
        id: `episodic-${i}`,
        type: 'event',
        text: `Episodic event number ${i} with extra detail to consume tokens in the budget calculation`,
        salience: 60,
        stability: 'episodic',
        updated_at: new Date(Date.now() - i * 3600000).toISOString(),
      })
    );

    const { client } = createMockSupabase({
      tables: {
        memory_items: { rows: [...stableItems, ...episodicItems] },
        memory_item_embeddings: { rows: [] },
      },
    });

    const { loadMemoryContextV2 } = await import('@/lib/memory-items-server');
    const result = await loadMemoryContextV2(client as any, 'user-1', {
      actor: 'default',
    });

    // Core profile should have at least 3 items (default minimum)
    const coreSection = result.split('## Relevant Recall')[0] || result;
    const coreLines = coreSection.split('\n').filter((l) => l.startsWith('- ['));
    expect(coreLines.length).toBeGreaterThanOrEqual(3);

    // Total output should fit within budget (estimateTokenCount uses words * 1.33)
    const { estimateTokenCount } = await import('@/lib/memory-items');
    expect(estimateTokenCount(result)).toBeLessThanOrEqual(1200); // max clamped budget
  });

  it('uses Global Profile header and scopes correctly for mentor actor', async () => {
    const items: MemoryItem[] = [
      makeMemoryItem({ id: 'g1', type: 'profile', text: 'Global profile fact', owner_type: 'global', stability: 'stable', salience: 90 }),
      makeMemoryItem({ id: 'm1', type: 'preference', text: 'Mentor-specific preference', owner_type: 'mentor', owner_id: 'mentor-xyz', stability: 'stable', salience: 80 }),
      makeMemoryItem({ id: 'm2', type: 'event', text: 'Mentor event', owner_type: 'mentor', owner_id: 'mentor-xyz', stability: 'episodic', salience: 70 }),
      makeMemoryItem({ id: 'other-1', type: 'preference', text: 'Other mentor pref', owner_type: 'mentor', owner_id: 'mentor-other', stability: 'stable', salience: 80 }),
    ];

    const { client } = createMockSupabase({
      tables: {
        memory_items: { rows: items },
        memory_item_embeddings: { rows: [] },
      },
    });

    const { loadMemoryContextV2 } = await import('@/lib/memory-items-server');
    const result = await loadMemoryContextV2(client as any, 'user-1', {
      actor: 'mentor',
      mentorId: 'mentor-xyz',
    });

    expect(result).toContain('## Global Profile');
    expect(result).not.toContain('## Core Profile');
    expect(result).not.toContain('Other mentor pref');
  });

  it('uses RPC semantic matches when available for relevant recall ranking', async () => {
    const matched = makeMemoryItem({
      id: 'rpc-1',
      type: 'event',
      text: 'Semantic RPC winner',
      stability: 'episodic',
      salience: 40,
      confidence: 0.7,
      updated_at: '2026-03-01T00:00:00.000Z',
    });
    const other = makeMemoryItem({
      id: 'rpc-2',
      type: 'event',
      text: 'Lower semantic score item',
      stability: 'episodic',
      salience: 40,
      confidence: 0.7,
      updated_at: '2026-03-01T00:00:00.000Z',
    });

    const { client, tracker } = createMockSupabase({
      tables: {
        memory_items: { rows: [matched, other] },
        memory_item_embeddings: { rows: [] },
      },
      rpcResults: {
        match_memory_items: {
          data: [
            { memory_item_id: 'rpc-1', similarity: 0.98 },
            { memory_item_id: 'rpc-2', similarity: 0.12 },
          ],
          error: null,
        },
      },
    });

    const { loadMemoryContextV2 } = await import('@/lib/memory-items-server');
    const result = await loadMemoryContextV2(client as any, 'user-1', {
      actor: 'default',
      query: 'query with no direct lexical overlap',
    });

    expect(tracker.rpcs).toHaveLength(1);
    expect(result).toContain('## Relevant Recall');
    expect(result.indexOf('Semantic RPC winner')).toBeLessThan(
      result.indexOf('Lower semantic score item')
    );
  });

  it('falls back to row embeddings when RPC semantic retrieval returns empty', async () => {
    const matched = makeMemoryItem({
      id: 'rows-empty-1',
      type: 'event',
      text: 'Embedding row fallback winner',
      stability: 'episodic',
      salience: 40,
      confidence: 0.7,
      updated_at: '2026-03-01T00:00:00.000Z',
    });
    const other = makeMemoryItem({
      id: 'rows-empty-2',
      type: 'event',
      text: 'Embedding row fallback loser',
      stability: 'episodic',
      salience: 40,
      confidence: 0.7,
      updated_at: '2026-03-01T00:00:00.000Z',
    });

    const { client, tracker } = createMockSupabase({
      tables: {
        memory_items: { rows: [matched, other] },
        memory_item_embeddings: {
          rows: [
            { memory_item_id: 'rows-empty-1', embedding: '[1, 0]' },
            { memory_item_id: 'rows-empty-2', embedding: '[0, 1]' },
          ],
        },
      },
      rpcResults: {
        match_memory_items: {
          data: [],
          error: null,
        },
      },
    });

    const { loadMemoryContextV2 } = await import('@/lib/memory-items-server');
    const result = await loadMemoryContextV2(client as any, 'user-1', {
      actor: 'default',
      query: 'query with no direct lexical overlap',
    });

    expect(tracker.rpcs).toHaveLength(1);
    expect(tracker.selects('memory_item_embeddings')).toHaveLength(1);
    expect(result.indexOf('Embedding row fallback winner')).toBeLessThan(
      result.indexOf('Embedding row fallback loser')
    );
  });

  it('falls back to row embeddings when RPC semantic retrieval errors', async () => {
    const matched = makeMemoryItem({
      id: 'rows-error-1',
      type: 'event',
      text: 'Embedding fallback after RPC error',
      stability: 'episodic',
      salience: 40,
      confidence: 0.7,
      updated_at: '2026-03-01T00:00:00.000Z',
    });
    const other = makeMemoryItem({
      id: 'rows-error-2',
      type: 'event',
      text: 'Other fallback candidate',
      stability: 'episodic',
      salience: 40,
      confidence: 0.7,
      updated_at: '2026-03-01T00:00:00.000Z',
    });

    const { client, tracker } = createMockSupabase({
      tables: {
        memory_items: { rows: [matched, other] },
        memory_item_embeddings: {
          rows: [
            { memory_item_id: 'rows-error-1', embedding: [1, 0] },
            { memory_item_id: 'rows-error-2', embedding: [0, 1] },
          ],
        },
      },
      rpcResults: {
        match_memory_items: {
          data: null,
          error: { message: 'rpc failed' },
        },
      },
    });

    const { loadMemoryContextV2 } = await import('@/lib/memory-items-server');
    const result = await loadMemoryContextV2(client as any, 'user-1', {
      actor: 'default',
      query: 'query with no direct lexical overlap',
    });

    expect(tracker.rpcs).toHaveLength(1);
    expect(tracker.selects('memory_item_embeddings')).toHaveLength(1);
    expect(result.indexOf('Embedding fallback after RPC error')).toBeLessThan(
      result.indexOf('Other fallback candidate')
    );
  });
});
