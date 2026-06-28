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
        badge: option.badge ?? null,
      }))
    ).toEqual([
      { id: 'auto', label: 'Auto', provider: 'auto', badge: null },
      { id: 'gpt-5.5', label: 'GPT-5.5', provider: 'openai', badge: 'Max' },
      { id: 'gpt-5.4', label: 'GPT-5.4', provider: 'openai', badge: null },
      {
        id: 'gemini-3.1-pro-preview',
        label: 'Gemini 3.1 Pro',
        provider: 'google',
        badge: null,
      },
      {
        id: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        provider: 'anthropic',
        badge: null,
      },
      {
        id: 'claude-opus-4-8',
        label: 'Claude Opus 4.8',
        provider: 'anthropic',
        badge: 'Max',
      },
      {
        id: 'gemini-3-flash-preview',
        label: 'Gemini 3 Flash',
        provider: 'google',
        badge: null,
      },
      {
        id: 'deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        provider: 'deepseek',
        badge: null,
      },
      {
        id: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        provider: 'deepseek',
        badge: 'Max',
      },
      {
        id: 'qwen3.7-plus',
        label: 'Qwen 3.7 Plus',
        provider: 'alibaba',
        badge: null,
      },
      {
        id: 'kimi-k2.7-code',
        label: 'Kimi K2.7 Code',
        provider: 'moonshot',
        badge: 'Max',
      },
    ]);
    expect(DEFAULT_CHAT_MODEL_ID).toBe('auto');
  });

  it('recognizes valid chat model ids and effort levels', () => {
    expect(isChatModelId('auto')).toBe(true);
    expect(isChatModelId('gpt-5.5')).toBe(true);
    expect(isChatModelId('deepseek-v4-flash')).toBe(true);
    expect(isChatModelId('gpt-4o')).toBe(false);

    expect(isChatModelEffortLevel('minimal')).toBe(true);
    expect(isChatModelEffortLevel('max')).toBe(true);
    expect(isChatModelEffortLevel('extreme')).toBe(false);
  });

  it('returns null for unknown model ids', () => {
    expect(getChatModelOption('gpt-5.5')?.label).toBe('GPT-5.5');
    expect(getChatModelOption('missing-model')).toBeNull();
    expect(getChatModelOption(null)).toBeNull();
  });

  it('stores provider-specific effort capabilities only on supported models', () => {
    expect(getChatModelOption('gemini-3.1-pro-preview')?.effort?.levels).toEqual([
      'low',
      'medium',
      'high',
    ]);
    expect(getChatModelOption('gemini-3-flash-preview')?.effort?.levels).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
    ]);
    expect(getChatModelOption('kimi-k2.7-code')?.effort).toBeUndefined();
  });
});
