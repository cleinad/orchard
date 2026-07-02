import { describe, expect, it, vi } from 'vitest';
import { runConversationalSearch } from '@/lib/search/orchestrator';
import type { SearchPipelineOutput } from '@/lib/search/types';

function searchOutput(query: string, results: SearchPipelineOutput['results']): SearchPipelineOutput {
  return {
    status: results.length > 0 ? 'success' : 'no_results',
    profile: 'fresh_web',
    query,
    providers: ['brave'],
    results,
  };
}

describe('conversational search orchestrator', () => {
  it('does not search when search mode is off', async () => {
    const planner = vi.fn();
    const decider = vi.fn();
    const searchPipeline = vi.fn();
    const activityWriter = vi.fn();
    const run = await runConversationalSearch(
      {
        latestMessage: 'help me think this through',
        messages: [],
        currentTime: '2026-06-17 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-17',
        searchMode: 'off',
      },
      { planner, decider, searchPipeline, activityWriter }
    );

    expect(run).toMatchObject({
      action: 'not_attempted',
      metadata: null,
      collapsedActivityLabel: 'Search is off for this reply',
      skippedReason: 'mode_off',
    });
    expect(planner).not.toHaveBeenCalled();
    expect(decider).not.toHaveBeenCalled();
    expect(searchPipeline).not.toHaveBeenCalled();
    expect(activityWriter).not.toHaveBeenCalled();
  });

  it('passes planner model id to the planner for required runs and skips auto decision', async () => {
    const decider = vi.fn();
    const planner = vi.fn(async () => ({
      resolvedIntent: 'Search OpenAI pricing.',
      queries: ['OpenAI pricing'],
      topicEntities: ['OpenAI', 'pricing'],
      sourceStrategy: 'official' as const,
      freshnessNeeded: false,
      reusePriorSources: false,
      plannerSource: 'model' as const,
      plannerModelId: 'qwen/qwen-2.5-7b-instruct',
    }));
    const searchPipeline = vi.fn(async (query: string) =>
      searchOutput(query, [
        {
          title: 'OpenAI pricing',
          url: 'https://openai.com/pricing',
          domain: 'openai.com',
          snippet: 'OpenAI pricing information.',
          provider: 'brave',
          sourceType: 'official',
          publishedAt: null,
          origin: 'fresh',
        },
      ])
    );

    await runConversationalSearch(
      {
        latestMessage: 'OpenAI pricing',
        messages: [],
        currentTime: '2026-06-17 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-17',
        searchMode: 'required',
      },
      {
        decider,
        planner,
        plannerModelId: 'qwen/qwen-2.5-7b-instruct',
        plannerProvider: 'openrouter',
        searchPipeline,
      }
    );

    expect(planner).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        plannerModelId: 'qwen/qwen-2.5-7b-instruct',
        plannerProvider: 'openrouter',
      })
    );
    expect(decider).not.toHaveBeenCalled();
  });

  it('records an auto decision and skips search when search is unnecessary', async () => {
    const planner = vi.fn();
    const searchPipeline = vi.fn();
    const activityWriter = vi.fn();
    const decision = {
      shouldSearch: false,
      reason: 'Stable brainstorming request.',
      confidence: 0.91,
      freshnessRisk: 'none' as const,
    };

    const run = await runConversationalSearch(
      {
        latestMessage: 'help me brainstorm names',
        messages: [],
        currentTime: '2026-06-17 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-17',
        searchMode: 'auto',
      },
      {
        modelDecision: vi.fn(async () => decision),
        planner,
        searchPipeline,
        activityWriter,
      }
    );

    expect(run).toMatchObject({
      action: 'not_attempted',
      metadata: null,
      decision,
      skippedReason: 'auto_decision',
      collapsedActivityLabel: 'Search skipped by auto mode',
    });
    expect(planner).not.toHaveBeenCalled();
    expect(searchPipeline).not.toHaveBeenCalled();
    expect(activityWriter).not.toHaveBeenCalled();
  });

  it('records an auto decision and runs planned search when search is needed', async () => {
    const activityWriter = vi.fn();
    const decision = {
      shouldSearch: true,
      reason: 'The user asks for latest information.',
      confidence: 0.88,
      freshnessRisk: 'high' as const,
    };
    const planner = vi.fn(async () => ({
      resolvedIntent: 'Find latest OpenAI updates.',
      queries: ['latest OpenAI updates'],
      topicEntities: ['OpenAI'],
      sourceStrategy: 'news' as const,
      freshnessNeeded: true,
      reusePriorSources: false,
      plannerSource: 'model' as const,
    }));
    const searchPipeline = vi.fn(async (query: string) =>
      searchOutput(query, [
        {
          title: 'OpenAI update',
          url: 'https://example.com/openai',
          domain: 'example.com',
          snippet: 'Latest OpenAI update.',
          provider: 'brave',
          sourceType: 'news',
          publishedAt: '2026-06-17T00:00:00.000Z',
          origin: 'fresh',
        },
      ])
    );

    const run = await runConversationalSearch(
      {
        latestMessage: 'what are the latest OpenAI updates?',
        messages: [],
        currentTime: '2026-06-17 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-17',
        searchMode: 'auto',
      },
      {
        modelDecision: vi.fn(async () => decision),
        planner,
        searchPipeline,
        activityWriter,
      }
    );

    expect(planner).toHaveBeenCalledTimes(1);
    expect(searchPipeline).toHaveBeenCalledWith('latest OpenAI updates');
    expect(run).toMatchObject({
      action: 'searched',
      decision,
      skippedReason: null,
    });
    expect(activityWriter).toHaveBeenCalledWith(
      expect.objectContaining({
        collapsedLabel: 'Searching latest OpenAI updates',
        events: expect.not.arrayContaining([
          expect.objectContaining({ type: 'planning_started' }),
          expect.objectContaining({ type: 'search_decision_started' }),
          expect.objectContaining({ type: 'search_decision_completed' }),
          expect.objectContaining({ type: 'plan_selected' }),
          expect.objectContaining({ type: 'prior_sources_checked' }),
          expect.objectContaining({ type: 'relevance_checked' }),
        ]),
      })
    );
    expect(activityWriter).toHaveBeenLastCalledWith(
      expect.objectContaining({
        collapsedLabel: 'Search completed',
        events: expect.not.arrayContaining([
          expect.objectContaining({ type: 'planning_started' }),
          expect.objectContaining({ type: 'search_decision_started' }),
          expect.objectContaining({ type: 'search_decision_completed' }),
          expect.objectContaining({ type: 'plan_selected' }),
          expect.objectContaining({ type: 'prior_sources_checked' }),
          expect.objectContaining({ type: 'relevance_checked' }),
        ]),
      })
    );
    expect(run.metadata).toMatchObject({
      activity: expect.objectContaining({
        events: expect.not.arrayContaining([
          expect.objectContaining({ type: 'planning_started' }),
          expect.objectContaining({ type: 'search_decision_started' }),
          expect.objectContaining({ type: 'search_decision_completed' }),
          expect.objectContaining({ type: 'plan_selected' }),
          expect.objectContaining({ type: 'prior_sources_checked' }),
          expect.objectContaining({ type: 'relevance_checked' }),
        ]),
      }),
    });
  });

  it('keeps auto decision hidden but exposes search activity when results fail', async () => {
    const activityWriter = vi.fn();
    const decision = {
      shouldSearch: true,
      reason: 'The user asks for factual coverage.',
      confidence: 0.82,
      freshnessRisk: 'low' as const,
    };
    const planner = vi.fn(async () => ({
      resolvedIntent: 'Find sources on an obscure topic.',
      queries: ['obscure topic sources'],
      topicEntities: ['obscure topic'],
      sourceStrategy: 'mixed' as const,
      freshnessNeeded: false,
      reusePriorSources: false,
      plannerSource: 'model' as const,
    }));
    const searchPipeline = vi.fn(async (query: string) => searchOutput(query, []));

    const run = await runConversationalSearch(
      {
        latestMessage: 'give me sourced examples for an obscure topic',
        messages: [],
        currentTime: '2026-06-17 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-17',
        searchMode: 'auto',
      },
      {
        modelDecision: vi.fn(async () => decision),
        planner,
        searchPipeline,
        activityWriter,
      }
    );

    expect(run).toMatchObject({
      action: 'failed',
      decision,
      skippedReason: null,
    });
    expect(activityWriter).toHaveBeenCalledWith(
      expect.objectContaining({
        collapsedLabel: 'Searching obscure topic sources',
        events: expect.not.arrayContaining([
          expect.objectContaining({ type: 'planning_started' }),
          expect.objectContaining({ type: 'search_decision_started' }),
          expect.objectContaining({ type: 'search_decision_completed' }),
          expect.objectContaining({ type: 'plan_selected' }),
          expect.objectContaining({ type: 'prior_sources_checked' }),
          expect.objectContaining({ type: 'relevance_checked' }),
        ]),
      })
    );
    expect(activityWriter).toHaveBeenLastCalledWith(
      expect.objectContaining({
        collapsedLabel: 'Search completed',
        events: expect.not.arrayContaining([
          expect.objectContaining({ type: 'planning_started' }),
          expect.objectContaining({ type: 'search_decision_started' }),
          expect.objectContaining({ type: 'search_decision_completed' }),
          expect.objectContaining({ type: 'plan_selected' }),
          expect.objectContaining({ type: 'prior_sources_checked' }),
          expect.objectContaining({ type: 'relevance_checked' }),
        ]),
      })
    );
    expect(run.metadata).toMatchObject({
      status: 'no_results',
      sources: [],
      activity: expect.objectContaining({
        collapsedLabel: 'Search completed',
      }),
    });
  });

  it('keeps required search failures visible in activity metadata', async () => {
    const activityWriter = vi.fn();
    const planner = vi.fn(async () => ({
      resolvedIntent: 'Find OpenAI updates.',
      queries: ['OpenAI updates'],
      topicEntities: ['OpenAI'],
      sourceStrategy: 'news' as const,
      freshnessNeeded: true,
      reusePriorSources: false,
      plannerSource: 'model' as const,
    }));
    const searchPipeline = vi.fn(async (query: string) => searchOutput(query, []));

    const run = await runConversationalSearch(
      {
        latestMessage: 'search OpenAI updates',
        messages: [],
        currentTime: '2026-06-17 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-17',
        searchMode: 'required',
      },
      {
        planner,
        searchPipeline,
        activityWriter,
      }
    );

    expect(run.action).toBe('failed');
    expect(activityWriter).toHaveBeenCalledWith(
      expect.objectContaining({
        collapsedLabel: 'Searching OpenAI updates',
      })
    );
    expect(activityWriter).toHaveBeenLastCalledWith(
      expect.objectContaining({
        collapsedLabel: 'Search completed',
        events: expect.not.arrayContaining([
          expect.objectContaining({ type: 'planning_started' }),
          expect.objectContaining({ type: 'plan_selected' }),
          expect.objectContaining({ type: 'prior_sources_checked' }),
          expect.objectContaining({ type: 'relevance_checked' }),
        ]),
      })
    );
    expect(run.metadata).toMatchObject({
      status: 'no_results',
      activity: expect.objectContaining({
        collapsedLabel: 'Search completed',
      }),
    });
  });

  it('reuses relevant prior sources but still runs fresh search', async () => {
    const searchPipeline = vi.fn(async (query: string) =>
      searchOutput(query, [
        {
          title: 'Iran ceasefire talks continue',
          url: 'https://example.com/fresh-iran',
          domain: 'example.com',
          snippet: 'Fresh reporting on Iran ceasefire implications and regional talks.',
          provider: 'brave',
          sourceType: 'news',
          publishedAt: '2026-06-17T00:00:00.000Z',
          origin: 'fresh',
        },
      ])
    );

    const run = await runConversationalSearch(
      {
        latestMessage: 'is this good?',
        messages: [
          {
            role: 'assistant',
            content: 'Recent reports describe an Iran ceasefire proposal and diplomatic talks.',
            searchMetadata: {
              version: 2,
              mode: 'required',
              profile: 'fresh_web',
              status: 'success',
              query: 'latest Iran ceasefire current status',
              providers: ['brave'],
              sources: [
                {
                  id: 1,
                  title: 'Iran ceasefire talks continue',
                  url: 'https://example.com/prior-iran',
                  domain: 'example.com',
                  snippet: 'Current status on Iran ceasefire talks.',
                  provider: 'brave',
                  sourceType: 'news',
                  publishedAt: '2026-06-16T00:00:00.000Z',
                },
              ],
            },
          },
        ],
        currentTime: '2026-06-17 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-17',
        searchMode: 'required',
      },
      { searchPipeline }
    );

    expect(searchPipeline).toHaveBeenCalledTimes(2);
    expect(run.action).toBe('searched');
    expect(run.metadata).toMatchObject({
      resolvedIntent: expect.stringContaining('beneficial'),
      activity: {
        collapsedLabel: 'Search completed',
      },
      sources: expect.arrayContaining([
        expect.objectContaining({ url: 'https://example.com/prior-iran', origin: 'prior' }),
        expect.objectContaining({ url: 'https://example.com/fresh-iran', origin: 'fresh' }),
      ]),
    });
  });

  it('repairs once when first results are clearly off topic', async () => {
    const searchPipeline = vi
      .fn()
      .mockResolvedValueOnce(
        searchOutput('latest Iran ceasefire current status', [
          {
            title: 'What About Now lyrics',
            url: 'https://lyrics.com/song',
            domain: 'lyrics.com',
            snippet: 'Lyrics and music video.',
            provider: 'brave',
            sourceType: 'other',
            publishedAt: null,
            origin: 'fresh',
          },
        ])
      )
      .mockResolvedValueOnce(
        searchOutput('repair', [
          {
            title: 'Iran ceasefire talks continue',
            url: 'https://example.com/iran',
            domain: 'example.com',
            snippet: 'Latest Iran ceasefire status.',
            provider: 'brave',
            sourceType: 'news',
            publishedAt: '2026-06-17T00:00:00.000Z',
            origin: 'fresh',
          },
        ])
      );

    const run = await runConversationalSearch(
      {
        latestMessage: 'what about now?',
        messages: [
          {
            role: 'assistant',
            content: 'Recent reports describe an Iran ceasefire proposal and diplomatic talks.',
          },
        ],
        currentTime: '2026-06-17 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-17',
        searchMode: 'required',
      },
      { searchPipeline }
    );

    expect(searchPipeline).toHaveBeenCalledTimes(2);
    expect(run.attempts).toHaveLength(2);
    expect(run.action).toBe('searched');
  });

  it('does not expose rejected sources as usable grounding after repair fails', async () => {
    const searchPipeline = vi
      .fn()
      .mockResolvedValueOnce(
        searchOutput('latest Iran ceasefire current status', [
          {
            title: 'What About Now lyrics',
            url: 'https://lyrics.com/song',
            domain: 'lyrics.com',
            snippet: 'Lyrics and music video.',
            provider: 'brave',
            sourceType: 'other',
            publishedAt: null,
            origin: 'fresh',
          },
        ])
      )
      .mockResolvedValueOnce(
        searchOutput('repair', [
          {
            title: 'Music video roundup',
            url: 'https://video.example.com/music',
            domain: 'video.example.com',
            snippet: 'Song, album, and official video coverage.',
            provider: 'brave',
            sourceType: 'video',
            publishedAt: null,
            origin: 'fresh',
          },
        ])
      );

    const run = await runConversationalSearch(
      {
        latestMessage: 'what about now?',
        messages: [
          {
            role: 'assistant',
            content: 'Recent reports describe an Iran ceasefire proposal and diplomatic talks.',
          },
        ],
        currentTime: '2026-06-17 10:00 (America/Vancouver)',
        currentDateLabel: '2026-06-17',
        searchMode: 'required',
      },
      { searchPipeline }
    );

    expect(searchPipeline).toHaveBeenCalledTimes(2);
    expect(run.action).toBe('failed');
    expect(run.metadata).toMatchObject({
      status: 'no_results',
      sources: [],
      queries: expect.arrayContaining([expect.stringContaining('Iran')]),
      resolvedIntent: expect.stringContaining('Iran'),
      topicEntities: expect.arrayContaining(['Iran']),
      activity: expect.objectContaining({
        collapsedLabel: 'Search completed',
      }),
    });
  });
});
