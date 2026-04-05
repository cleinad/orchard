import { describe, expect, it } from 'vitest';
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL_ID,
  getChatModelOption,
  isChatModelId,
} from '@/lib/chat-models';

describe('chat model catalog', () => {
  it('contains the curated MVP model options', () => {
    expect(
      CHAT_MODEL_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
        provider: option.provider,
      }))
    ).toEqual([
      { id: 'gpt-5.4', label: 'GPT 5.4', provider: 'openai' },
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', provider: 'anthropic' },
      {
        id: 'gemini-3-flash-preview',
        label: 'Gemini 3',
        provider: 'google',
      },
    ]);
    expect(DEFAULT_CHAT_MODEL_ID).toBe('gemini-3-flash-preview');
  });

  it('recognizes valid chat model ids', () => {
    expect(isChatModelId('gpt-5.4')).toBe(true);
    expect(isChatModelId('claude-sonnet-4-6')).toBe(true);
    expect(isChatModelId('gemini-3-flash-preview')).toBe(true);
    expect(isChatModelId('gpt-4o')).toBe(false);
  });

  it('returns null for unknown model ids', () => {
    expect(getChatModelOption('gpt-5.4')?.label).toBe('GPT 5.4');
    expect(getChatModelOption('missing-model')).toBeNull();
    expect(getChatModelOption(null)).toBeNull();
  });
});
