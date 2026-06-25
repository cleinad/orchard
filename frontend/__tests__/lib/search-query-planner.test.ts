import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerateObject = vi.hoisted(() => vi.fn());

vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

import {
  decideSearchNecessity,
  planSearchAction,
  planSearchQuery,
} from '@/lib/search/query-planner';

function searchPlannerInput({
  latestMessage,
  recentMessages = [],
}: {
  latestMessage: string;
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}) {
  return {
    latestMessage,
    recentMessages,
    currentTime: '2026-06-19 10:00 (America/Vancouver)',
    currentDateLabel: '2026-06-19',
    searchMode: 'auto' as const,
  };
}

describe('search query planner', () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
  });

  it('keeps standalone literal searches unchanged', () => {
    const plan = planSearchQuery({
      latestMessage: 'What About Now',
      recentMessages: [],
      currentDate: new Date('2026-06-16T12:00:00.000Z'),
    });

    expect(plan).toEqual({
      query: 'What About Now',
      reason: 'standalone',
      topic: null,
    });
  });

  it('rewrites short follow-ups using the recent user topic', () => {
    const plan = planSearchQuery({
      latestMessage: 'what about now?',
      recentMessages: [
        {
          role: 'user',
          content: 'what is happening in Iran? did the war end?',
        },
        {
          role: 'assistant',
          content: 'I do not have live search enabled for that.',
        },
      ],
      currentDate: new Date('2026-06-16T12:00:00.000Z'),
    });

    expect(plan.reason).toBe('contextual_followup');
    expect(plan.query).toContain('Iran war');
    expect(plan.query).toContain('ceasefire');
    expect(plan.query).not.toBe('what about now?');
  });

  it('uses current date when resolving today follow-ups', () => {
    const plan = planSearchQuery({
      latestMessage: 'what happened today?',
      recentMessages: [
        {
          role: 'user',
          content: 'Can you track the OpenAI model release?',
        },
      ],
      currentDate: new Date('2026-06-16T12:00:00.000Z'),
    });

    expect(plan).toMatchObject({
      reason: 'contextual_followup',
      topic: 'track OpenAI model release',
    });
    expect(plan.query).toBe('today 2026-06-16 track OpenAI model release latest updates');
  });

  it('uses a caller-provided local date label for today follow-ups', () => {
    const plan = planSearchQuery({
      latestMessage: 'what happened today?',
      recentMessages: [
        {
          role: 'user',
          content: 'Can you track the OpenAI model release?',
        },
      ],
      currentDate: new Date('2026-06-17T01:00:00.000Z'),
      currentDateLabel: '2026-06-16',
    });

    expect(plan.query).toBe('today 2026-06-16 track OpenAI model release latest updates');
  });

  it('does not rewrite a follow-up when no substantive topic exists', () => {
    const plan = planSearchQuery({
      latestMessage: 'any update?',
      recentMessages: [{ role: 'user', content: 'hi' }],
      currentDate: new Date('2026-06-16T12:00:00.000Z'),
    });

    expect(plan).toEqual({
      query: 'any update?',
      reason: 'standalone',
      topic: null,
    });
  });

  it('uses the model planner for standalone search-enabled requests', async () => {
    const modelPlanner = vi.fn(async () => ({
      resolvedIntent: 'Search OpenAI API pricing.',
      queries: ['official OpenAI API pricing'],
      topicEntities: ['OpenAI', 'API', 'pricing'],
      sourceStrategy: 'official' as const,
      freshnessNeeded: false,
      reusePriorSources: false,
    }));

    const plan = await planSearchAction(
      {
        latestMessage: 'official OpenAI API pricing',
        recentMessages: [],
        currentTime: '2026-06-19 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-19',
        searchMode: 'required',
      },
      {
        modelPlanner,
        plannerModelId: 'qwen/qwen-2.5-7b-instruct',
      }
    );

    expect(modelPlanner).toHaveBeenCalledTimes(1);
    expect(plan).toMatchObject({
      plannerSource: 'model',
      queries: ['official OpenAI API pricing'],
      sourceStrategy: 'official',
    });
  });

  it('uses the model planner for literal entertainment searches', async () => {
    const modelPlanner = vi.fn(async () => ({
      resolvedIntent: 'Find What About Now lyrics.',
      queries: ['What About Now lyrics'],
      topicEntities: ['What About Now'],
      sourceStrategy: 'mixed' as const,
      freshnessNeeded: false,
      reusePriorSources: false,
    }));

    const plan = await planSearchAction(
      {
        latestMessage: 'What About Now lyrics',
        recentMessages: [],
        currentTime: '2026-06-19 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-19',
        searchMode: 'required',
      },
      {
        modelPlanner,
        plannerModelId: 'qwen/qwen-2.5-7b-instruct',
      }
    );

    expect(modelPlanner).toHaveBeenCalledTimes(1);
    expect(plan).toMatchObject({
      plannerSource: 'model',
      queries: ['What About Now lyrics'],
    });
  });

  it('logs and returns model-planned queries for contextual follow-ups', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };
    const modelPlanner = vi.fn(async () => ({
      resolvedIntent: 'Find whether the World Cup 2026 schedule has changed.',
      queries: ['World Cup 2026 schedule changes latest', 'FIFA World Cup 2026 schedule update'],
      topicEntities: ['World', 'Cup', '2026'],
      sourceStrategy: 'official' as const,
      freshnessNeeded: true,
      reusePriorSources: true,
    }));

    const plan = await planSearchAction(
      {
        latestMessage: 'can it change?',
        recentMessages: [
          {
            role: 'user',
            content: 'Tell me about the World Cup 2026 schedule.',
          },
        ],
        currentTime: '2026-06-19 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-19',
        searchMode: 'required',
      },
      {
        modelPlanner,
        plannerModelId: 'qwen/qwen-2.5-7b-instruct',
        logger,
      }
    );

    expect(modelPlanner).toHaveBeenCalledTimes(1);
    expect(plan).toMatchObject({
      plannerSource: 'model',
      plannerModelId: 'qwen/qwen-2.5-7b-instruct',
      queries: ['World Cup 2026 schedule changes latest', 'FIFA World Cup 2026 schedule update'],
    });
    expect(logger.info).toHaveBeenCalledWith(
      '[search]',
      expect.objectContaining({
        event: 'search.planner_model_started',
        plannerModelId: 'qwen/qwen-2.5-7b-instruct',
      })
    );
    expect(logger.info).toHaveBeenCalledWith(
      '[search]',
      expect.objectContaining({
        event: 'search.planner_model_completed',
        plannerModelId: 'qwen/qwen-2.5-7b-instruct',
        resolvedIntent: 'Find whether the World Cup 2026 schedule has changed.',
        queries: ['World Cup 2026 schedule changes latest', 'FIFA World Cup 2026 schedule update'],
      })
    );
  });

  it('uses the model planner for evaluative follow-ups', async () => {
    const modelPlanner = vi.fn(async () => ({
      resolvedIntent: 'Evaluate whether the World Cup 2026 schedule changes are good.',
      queries: ['World Cup 2026 schedule changes analysis latest'],
      topicEntities: ['World Cup', '2026', 'schedule'],
      sourceStrategy: 'mixed' as const,
      freshnessNeeded: true,
      reusePriorSources: true,
    }));

    const plan = await planSearchAction(
      {
        latestMessage: 'is this good?',
        recentMessages: [
          {
            role: 'assistant',
            content: 'Recent sources describe World Cup 2026 schedule changes.',
            searchMetadata: {
              version: 2,
              mode: 'required',
              profile: 'fresh_web',
              status: 'success',
              query: 'World Cup 2026 schedule changes',
              providers: ['brave'],
              sources: [
                {
                  id: 1,
                  title: 'World Cup schedule changes',
                  url: 'https://example.com/world-cup',
                  domain: 'example.com',
                  snippet: 'FIFA announced World Cup 2026 schedule updates.',
                  provider: 'brave',
                  sourceType: 'news',
                  publishedAt: '2026-06-19T00:00:00.000Z',
                },
              ],
            },
          },
        ],
        currentTime: '2026-06-19 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-19',
        searchMode: 'required',
      },
      {
        modelPlanner,
        plannerModelId: 'qwen/qwen-2.5-7b-instruct',
      }
    );

    expect(modelPlanner).toHaveBeenCalledTimes(1);
    expect(plan).toMatchObject({
      plannerSource: 'model',
      reusePriorSources: true,
      queries: ['World Cup 2026 schedule changes analysis latest'],
    });
  });

  it('logs fallback when a search-enabled request has no configured planner model', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };

    const plan = await planSearchAction(
      {
        latestMessage: 'official OpenAI API pricing',
        recentMessages: [],
        currentTime: '2026-06-19 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-19',
        searchMode: 'required',
      },
      {
        model: null,
        plannerModelId: 'qwen/qwen-2.5-7b-instruct',
        logger,
      }
    );

    expect(plan).toMatchObject({
      plannerSource: 'fallback',
      plannerModelId: 'qwen/qwen-2.5-7b-instruct',
      queries: ['official OpenAI API pricing'],
    });
    expect(logger.warn).toHaveBeenCalledWith(
      '[search]',
      expect.objectContaining({
        event: 'search.planner_model_fallback',
        plannerModelId: 'qwen/qwen-2.5-7b-instruct',
        reason: 'planner_model_not_configured',
      })
    );
  });

  it('falls back when the planner returns unusable vague queries', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };
    const modelPlanner = vi.fn(async () => ({
      resolvedIntent: 'Resolve the follow-up.',
      queries: ['what about now?'],
      topicEntities: [],
      sourceStrategy: 'mixed' as const,
      freshnessNeeded: false,
      reusePriorSources: false,
    }));

    const plan = await planSearchAction(
      {
        latestMessage: 'what about now?',
        recentMessages: [
          {
            role: 'user',
            content: 'Tell me about the World Cup 2026 schedule.',
          },
        ],
        currentTime: '2026-06-19 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-19',
        searchMode: 'required',
      },
      {
        modelPlanner,
        plannerModelId: 'qwen/qwen-2.5-7b-instruct',
        logger,
      }
    );

    expect(plan).toMatchObject({
      plannerSource: 'fallback',
      plannerModelId: 'qwen/qwen-2.5-7b-instruct',
    });
    expect(plan.queries[0]).toContain('World Cup 2026');
    expect(logger.warn).toHaveBeenCalledWith(
      '[search]',
      expect.objectContaining({
        event: 'search.planner_model_fallback',
        plannerModelId: 'qwen/qwen-2.5-7b-instruct',
        reason: 'planner_model_unusable_output',
      })
    );
  });

  it('asks whether online sources would materially improve the answer and includes recent context', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        shouldSearch: true,
        reason: 'Online sources improve coverage and attribution for a broad factual ranking.',
        confidence: 0.84,
        freshnessRisk: 'low',
      },
    });

    const decision = await decideSearchNecessity(
      searchPlannerInput({
        latestMessage:
          'tell me the smartest military moves in chinese history, ie plays by generals to win impossible odds',
        recentMessages: [
          {
            role: 'assistant',
            content: 'We were discussing examples from Chinese military history.',
          },
        ],
      }),
      {
        model: 'mock-model' as never,
        plannerModelId: 'qwen2.5-3b-instruct',
        provider: 'qwen',
      }
    );

    const prompt = mockGenerateObject.mock.calls[0]?.[0]?.prompt as string;

    expect(decision.shouldSearch).toBe(true);
    expect(decision.provider).toBe('qwen');
    expect(decision.providerModelId).toBe('qwen2.5-3b-instruct');
    expect(prompt).toContain('Would online sources materially improve the answer');
    expect(prompt).toContain('Latest message: tell me the smartest military moves');
    expect(prompt).toContain('We were discussing examples from Chinese military history');
    expect(prompt).toContain('broad factual lists, rankings');
    expect(prompt).toContain('more examples or more results');
    expect(prompt).toContain('formatting or rewriting content already present');
  });

  it('falls back from qwen to openrouter for auto search decisions', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };

    mockGenerateObject
      .mockRejectedValueOnce(new Error('qwen unavailable'))
      .mockResolvedValueOnce({
        object: {
          shouldSearch: true,
          reason: 'OpenRouter fallback says sources improve the answer.',
          confidence: 0.81,
          freshnessRisk: 'low',
        },
      });

    const decision = await decideSearchNecessity(
      searchPlannerInput({ latestMessage: 'give me the top semiconductor equipment companies' }),
      {
        model: 'qwen-model' as never,
        plannerModelId: 'qwen2.5-3b-instruct',
        provider: 'qwen',
        fallbackModel: 'openrouter-model' as never,
        fallbackPlannerModelId: 'Qwen/Qwen2.5-3B-Instruct',
        fallbackProvider: 'openrouter',
        logger,
      }
    );

    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    expect(decision).toMatchObject({
      shouldSearch: true,
      provider: 'openrouter',
      providerModelId: 'Qwen/Qwen2.5-3B-Instruct',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      '[search]',
      expect.objectContaining({
        event: 'search.decision_model_fallback_started',
        provider: 'qwen',
        fallbackProvider: 'openrouter',
        reason: 'qwen unavailable',
      })
    );
    expect(logger.info).toHaveBeenCalledWith(
      '[search]',
      expect.objectContaining({
        event: 'search.decision_model_completed',
        provider: 'openrouter',
        fallbackFromProvider: 'qwen',
        shouldSearch: true,
      })
    );
  });

  it.each([
    {
      label: 'broad historical ranking where coverage matters',
      latestMessage:
        'tell me the smartest military moves in chinese history, ie plays by generals to win impossible odds',
      recentMessages: [],
      shouldSearch: true,
      reason: 'Online sources improve coverage for a broad historical ranking.',
      freshnessRisk: 'low' as const,
    },
    {
      label: 'explicit search follow-up with prior topic',
      latestMessage: 'can you search and give me more results? format it more coherently too.',
      recentMessages: [
        {
          role: 'user' as const,
          content:
            'tell me the smartest military moves in chinese history, ie plays by generals to win impossible odds',
        },
      ],
      shouldSearch: true,
      reason: 'The user explicitly asked to search and wants more results.',
      freshnessRisk: 'low' as const,
    },
    {
      label: 'option selection that continues a searched scope',
      latestMessage:
        "do A), don't give me a list just a series of well formatted examples",
      recentMessages: [
        {
          role: 'assistant' as const,
          content:
            'Send A for top 15 smartest battlefield maneuvers in Chinese history, B for impossible-odds wins, or C for deception plays.',
        },
      ],
      shouldSearch: true,
      reason: 'The follow-up selects a broad factual search scope from recent context.',
      freshnessRisk: 'low' as const,
    },
    {
      label: 'creative brainstorming',
      latestMessage: 'help me brainstorm names for my note-taking app',
      recentMessages: [],
      shouldSearch: false,
      reason: 'Creative brainstorming does not need online sources.',
      freshnessRisk: 'none' as const,
    },
    {
      label: 'formatting existing text',
      latestMessage: 'make this paragraph clearer and format it as bullets',
      recentMessages: [
        {
          role: 'user' as const,
          content:
            'The product helps teams remember decisions and reduces repeated explanations.',
        },
      ],
      shouldSearch: false,
      reason: 'This is formatting and rewriting content already present.',
      freshnessRisk: 'none' as const,
    },
  ])(
    'returns the model decision for auto search: $label',
    async ({ latestMessage, recentMessages, shouldSearch, reason, freshnessRisk }) => {
      mockGenerateObject.mockResolvedValue({
        object: {
          shouldSearch,
          reason,
          confidence: shouldSearch ? 0.82 : 0.78,
          freshnessRisk,
        },
      });

      const decision = await decideSearchNecessity(
        searchPlannerInput({ latestMessage, recentMessages }),
        {
          model: 'mock-model' as never,
          plannerModelId: 'qwen/qwen-2.5-7b-instruct',
        }
      );

      expect(decision).toMatchObject({
        shouldSearch,
        reason,
        freshnessRisk,
      });
    }
  );
});
