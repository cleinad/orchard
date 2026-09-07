import { describe, expect, it } from 'vitest';
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL_ID,
  getChatModelOption,
  isChatModelEffortLevel,
  isChatModelId,
} from '@/lib/chat-models';

describe('chat model catalog', () => {
  it('contains the expanded curated model options', () => {
    expect(
      CHAT_MODEL_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
        provider: option.provider,
      }))
    ).toEqual([
      { id: 'auto', label: 'Auto', provider: 'auto' },
      { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', provider: 'openai' },
      { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', provider: 'openai' },
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', provider: 'openai' },
      {
        id: 'gemini-3.1-pro-preview',
        label: 'Gemini 3.1 Pro',
        provider: 'google',
      },
      {
        id: 'claude-sonnet-5',
        label: 'Claude Sonnet 5',
        provider: 'anthropic',
      },
      {
        id: 'claude-opus-5',
        label: 'Claude Opus 5',
        provider: 'anthropic',
      },
      {
        id: 'gemini-3.6-flash',
        label: 'Gemini 3.6 Flash',
        provider: 'google',
      },
      {
        id: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        provider: 'deepseek',
      },
    ]);
    expect(DEFAULT_CHAT_MODEL_ID).toBe('auto');
  });

  it('recognizes valid chat model ids and effort levels', () => {
    expect(isChatModelId('auto')).toBe(true);
    expect(isChatModelId('gpt-5.6-sol')).toBe(true);
    expect(isChatModelId('deepseek-v4-pro')).toBe(true);
    expect(isChatModelId('gpt-5.5')).toBe(false);
    expect(isChatModelId('deepseek-v4-flash')).toBe(false);
    expect(isChatModelId('gpt-4o')).toBe(false);

    expect(isChatModelEffortLevel('minimal')).toBe(true);
    expect(isChatModelEffortLevel('xhigh')).toBe(true);
    expect(isChatModelEffortLevel('max')).toBe(true);
    expect(isChatModelEffortLevel('extreme')).toBe(false);
  });

  it('returns null for unknown model ids', () => {
    expect(getChatModelOption('gpt-5.6-sol')?.label).toBe('GPT-5.6 Sol');
    expect(getChatModelOption('missing-model')).toBeNull();
    expect(getChatModelOption(null)).toBeNull();
  });

  it('stores provider-specific effort capabilities only on supported models', () => {
    expect(getChatModelOption('claude-sonnet-5')?.effort?.levels).toEqual([
      'low',
      'medium',
      'high',
      'max',
    ]);
    expect(getChatModelOption('claude-opus-5')?.effort?.levels).toEqual([
      'low',
      'medium',
      'high',
      'max',
    ]);
    expect(getChatModelOption('gemini-3.1-pro-preview')?.effort?.levels).toEqual([
      'low',
      'medium',
      'high',
    ]);
    expect(getChatModelOption('gemini-3.6-flash')?.effort?.levels).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
    ]);
  });
});
