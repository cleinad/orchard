import { describe, it, expect } from 'vitest';
import {
  normalizeMemoryText,
  clampSalience,
  clampConfidence,
  estimateTokenCount,
  jaccardSimilarity,
  lexicalOverlapScore,
  parseMemoryScope,
  parseMentorScope,
} from '@/lib/memory-items';

// ── normalizeMemoryText ──────────────────────────────────────

describe('normalizeMemoryText', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeMemoryText('Hello World!')).toBe('hello world');
  });

  it('applies NFKC normalization and strips non-ascii', () => {
    // é (composed) → NFKC → 'é' → regex strips accent → 'caf'
    expect(normalizeMemoryText('café')).toBe('caf');
  });

  it('strips quotes', () => {
    expect(normalizeMemoryText("it's a \"test\"")).toBe('its a test');
  });

  it('collapses whitespace', () => {
    expect(normalizeMemoryText('  foo   bar  ')).toBe('foo bar');
  });

  it('returns empty for empty input', () => {
    expect(normalizeMemoryText('')).toBe('');
  });
});

// ── clampSalience ────────────────────────────────────────────

describe('clampSalience', () => {
  it('passes through in-range value', () => {
    expect(clampSalience(50)).toBe(50);
  });

  it('clamps below zero', () => {
    expect(clampSalience(-10)).toBe(0);
  });

  it('clamps above 100', () => {
    expect(clampSalience(150)).toBe(100);
  });

  it('rounds to nearest integer', () => {
    expect(clampSalience(50.7)).toBe(51);
  });

  it('returns 50 for NaN', () => {
    expect(clampSalience(NaN)).toBe(50);
  });

  it('returns 50 for Infinity', () => {
    expect(clampSalience(Infinity)).toBe(50);
  });
});

// ── clampConfidence ──────────────────────────────────────────

describe('clampConfidence', () => {
  it('passes through in-range value', () => {
    expect(clampConfidence(0.85)).toBe(0.85);
  });

  it('clamps below zero', () => {
    expect(clampConfidence(-0.5)).toBe(0);
  });

  it('clamps above one', () => {
    expect(clampConfidence(1.5)).toBe(1);
  });

  it('caps precision at 3 decimals', () => {
    expect(clampConfidence(0.12345)).toBe(0.123);
  });

  it('returns 0.7 for NaN', () => {
    expect(clampConfidence(NaN)).toBe(0.7);
  });
});

// ── estimateTokenCount ───────────────────────────────────────

describe('estimateTokenCount', () => {
  it('estimates tokens for normal text', () => {
    expect(estimateTokenCount('hello world foo')).toBe(Math.ceil(3 * 1.33));
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokenCount('')).toBe(0);
  });

  it('returns 0 for whitespace-only', () => {
    expect(estimateTokenCount('   ')).toBe(0);
  });
});

// ── jaccardSimilarity ────────────────────────────────────────

describe('jaccardSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 0 for completely disjoint strings', () => {
    expect(jaccardSimilarity('hello world', 'foo bar')).toBe(0);
  });

  it('returns partial overlap score', () => {
    // After normalization and stop word removal:
    // "hello world foo" → {hello, world, foo}
    // "hello world bar" → {hello, world, bar}
    // intersection=2, union=4 → 0.5
    const score = jaccardSimilarity('hello world foo', 'hello world bar');
    expect(score).toBeCloseTo(0.5, 2);
  });

  it('returns 1 when both empty', () => {
    expect(jaccardSimilarity('', '')).toBe(1);
  });

  it('returns 0 when one is empty', () => {
    expect(jaccardSimilarity('hello', '')).toBe(0);
  });
});

// ── lexicalOverlapScore ──────────────────────────────────────

describe('lexicalOverlapScore', () => {
  it('returns 1 when all query tokens found in text', () => {
    // "hello world" → after stop word removal → {hello, world}
    // "hello world extra" → has both
    expect(lexicalOverlapScore('hello world', 'hello world extra')).toBe(1);
  });

  it('returns 0 for no overlap', () => {
    expect(lexicalOverlapScore('hello', 'goodbye')).toBe(0);
  });

  it('returns partial score', () => {
    // "hello world foo" → {hello, world, foo} (3 tokens, "world" kept — not a stop word in this context)
    // Wait — "world" is not in the stop words list, so it stays.
    // "hello bar baz" → {hello, bar, baz}
    // overlap = 1 (hello), query size = 3
    const score = lexicalOverlapScore('hello world foo', 'hello bar baz');
    expect(score).toBeCloseTo(1 / 3, 2);
  });

  it('returns 0 for empty query', () => {
    expect(lexicalOverlapScore('', 'hello')).toBe(0);
  });
});

// ── parseMemoryScope / parseMentorScope ──────────────────────

describe('parseMemoryScope', () => {
  it('returns "all" for null', () => {
    expect(parseMemoryScope(null)).toBe('all');
  });

  it('returns "all" for undefined', () => {
    expect(parseMemoryScope(undefined)).toBe('all');
  });

  it('returns "global" for "global"', () => {
    expect(parseMemoryScope('global')).toBe('global');
  });

  it('returns valid mentor scope', () => {
    expect(parseMemoryScope('mentor:abc-123')).toBe('mentor:abc-123');
  });

  it('returns "all" for bare "mentor:" prefix', () => {
    expect(parseMemoryScope('mentor:')).toBe('all');
  });
});

describe('parseMentorScope', () => {
  it('extracts mentor ID from mentor scope', () => {
    expect(parseMentorScope('mentor:abc')).toBe('abc');
  });

  it('returns null for global scope', () => {
    expect(parseMentorScope('global')).toBeNull();
  });

  it('returns null for "all" scope', () => {
    expect(parseMentorScope('all')).toBeNull();
  });
});
