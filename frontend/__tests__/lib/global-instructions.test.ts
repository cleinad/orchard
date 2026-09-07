import { describe, expect, it } from 'vitest';
import {
  MAX_GLOBAL_INSTRUCTIONS_CHARS,
  appendGlobalInstructions,
  sanitizeGlobalInstructions,
} from '@/lib/global-instructions';

describe('global instructions', () => {
  it('normalizes line endings while preserving paragraphs', () => {
    expect(
      sanitizeGlobalInstructions('  Use examples.\r\n\r\nPrefer TypeScript.  ')
    ).toBe('Use examples.\n\nPrefer TypeScript.');
  });

  it('returns an empty value for missing or whitespace-only input', () => {
    expect(sanitizeGlobalInstructions(undefined)).toBe('');
    expect(sanitizeGlobalInstructions(' \n ')).toBe('');
  });

  it('defensively limits instructions to the stored maximum', () => {
    expect(
      sanitizeGlobalInstructions('a'.repeat(MAX_GLOBAL_INSTRUCTIONS_CHARS + 10))
    ).toHaveLength(MAX_GLOBAL_INSTRUCTIONS_CHARS);
  });

  it('appends non-empty instructions in a delimited prompt block', () => {
    const prompt = appendGlobalInstructions(
      'Base application prompt.',
      'Use examples from biology.'
    );

    expect(prompt).toContain('Base application prompt.');
    expect(prompt).toContain('<global_instructions>');
    expect(prompt).toContain('Use examples from biology.');
    expect(prompt).toContain('</global_instructions>');
  });

  it('leaves the prompt unchanged when no instructions are set', () => {
    expect(appendGlobalInstructions('Base application prompt.', '   ')).toBe(
      'Base application prompt.'
    );
  });
});
