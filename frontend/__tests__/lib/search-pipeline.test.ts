import { describe, expect, it, vi } from 'vitest';
import { runSearchPipeline } from '@/lib/search/pipeline';
import type { SearchTelemetry } from '@/lib/search/telemetry';
import type { SearchProviderResult, SearchRoute } from '@/lib/search/types';

function makeProviderResult(
  provider: SearchProviderResult['provider'],
  overrides: Partial<SearchProviderResult> = {}
): SearchProviderResult {
  return {
    provider,
    status: 'success',
    results: [],
    error: null,
    ...overrides,
  };
}

function makeCandidate(
  overrides: Partial<SearchProviderResult['results'][number]> = {}
): SearchProviderResult['results'][number] {
  return {
    title: 'Example title',
    url: 'https://example.com/article',
    domain: 'example.com',
    snippet: 'Example snippet',
    provider: 'brave',
    sourceType: 'news',
    publishedAt: '2026-04-17T00:00:00.000Z',
    authorityScoreHint: 0,
    freshnessScoreHint: 0,
    ...overrides,
  };
}

describe('search pipeline', () => {
  it('retrieves providers in parallel and preserves both provider families for research routes', async () => {
    const braveSearch = vi.fn(async () =>
      makeProviderResult('brave', {
        results: [makeCandidate({ url: 'https://openai.com/pricing', domain: 'openai.com', sourceType: 'official', authorityScoreHint: 3 })],
      })
    );
    const exaSearch = vi.fn(async () =>
      makeProviderResult('exa', {
        results: [makeCandidate({ provider: 'exa', url: 'https://arxiv.org/abs/1234', domain: 'arxiv.org', sourceType: 'research', authorityScoreHint: 3 })],
      })
    );

    const result = await runSearchPipeline(
      'What does the evidence say about creatine and cognition?',
      { braveSearch, exaSearch }
    );

    expect(braveSearch).toHaveBeenCalledTimes(1);
    expect(exaSearch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('success');
    expect(result.providers).toEqual(['brave', 'exa']);
    expect(result.results).toHaveLength(2);
  });

  it('emits telemetry for route selection, provider completion, and pipeline completion', async () => {
    const telemetry: SearchTelemetry = {
      logRequestStarted: vi.fn(),
      logRouteSelected: vi.fn(),
      logProviderFinished: vi.fn(),
      logPipelineCompleted: vi.fn(),
      logPipelineFailed: vi.fn(),
    };

    const result = await runSearchPipeline('official OpenAI docs pricing', {
      telemetry,
      braveSearch: async () =>
        makeProviderResult('brave', {
          results: [
            makeCandidate({
              url: 'https://platform.openai.com/docs/pricing',
              domain: 'platform.openai.com',
              sourceType: 'docs',
              authorityScoreHint: 3,
            }),
          ],
          metrics: {
            attempted: true,
            httpStatus: 200,
            requestedResultCount: 12,
          },
        }),
      exaSearch: async () =>
        makeProviderResult('exa', {
          results: [
            makeCandidate({
              provider: 'exa',
              url: 'https://openai.com/pricing',
              domain: 'openai.com',
              sourceType: 'official',
              authorityScoreHint: 3,
            }),
          ],
          metrics: {
            attempted: true,
            httpStatus: 200,
            requestedResultCount: 8,
          },
        }),
    });

    expect(result.status).toBe('success');
    expect(telemetry.logRouteSelected).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: 'official_priority',
        providers: ['brave', 'exa'],
      })
    );
    expect(telemetry.logProviderFinished).toHaveBeenCalledTimes(2);
    expect(telemetry.logPipelineCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: 'official_priority',
        status: 'success',
        plannedProviderCount: 2,
        outboundRequestCount: 2,
        visibleCount: 2,
      })
    );
  });

  it('returns partial when one provider fails but the other provides usable evidence', async () => {
    const result = await runSearchPipeline('official OpenAI docs pricing', {
      braveSearch: async () =>
        makeProviderResult('brave', {
          results: [makeCandidate({ url: 'https://platform.openai.com/docs/pricing', domain: 'platform.openai.com', sourceType: 'docs', authorityScoreHint: 3 })],
        }),
      exaSearch: async () =>
        makeProviderResult('exa', {
          status: 'timeout',
          results: [],
          error: 'timeout',
        }),
    });

    expect(result.status).toBe('partial');
    expect(result.results[0]).toMatchObject({
      domain: 'platform.openai.com',
      sourceType: 'docs',
    });
  });

  it('deduplicates repeated URLs across providers', async () => {
    const result = await runSearchPipeline('latest product changes', {
      braveSearch: async () =>
        makeProviderResult('brave', {
          results: [makeCandidate({ url: 'https://example.com/post?utm_source=test' })],
        }),
      exaSearch: async () =>
        makeProviderResult('exa', {
          results: [makeCandidate({ provider: 'exa', url: 'https://example.com/post' })],
        }),
    });

    expect(result.results).toHaveLength(1);
  });

  it('ranks official sources above random blogs', async () => {
    const result = await runSearchPipeline('latest OpenAI pricing changes', {
      braveSearch: async () =>
        makeProviderResult('brave', {
          results: [
            makeCandidate({
              title: 'Random blog summary',
              url: 'https://randomblog.example/openai-pricing',
              domain: 'randomblog.example',
              sourceType: 'news',
              authorityScoreHint: 0,
            }),
            makeCandidate({
              title: 'OpenAI pricing',
              url: 'https://openai.com/api/pricing',
              domain: 'openai.com',
              sourceType: 'official',
              authorityScoreHint: 3,
            }),
          ],
        }),
    });

    expect(result.results[0]).toMatchObject({
      domain: 'openai.com',
      sourceType: 'official',
    });
  });

  it('prefers research sources over forums for evidence-heavy questions', async () => {
    const result = await runSearchPipeline(
      'What does the evidence say about creatine and cognition?',
      {
        braveSearch: async () =>
          makeProviderResult('brave', {
            results: [
              makeCandidate({
                title: 'Forum thread',
                url: 'https://reddit.com/r/nootropics/comments/abc',
                domain: 'reddit.com',
                sourceType: 'forum',
                authorityScoreHint: -2,
              }),
            ],
          }),
        exaSearch: async () =>
          makeProviderResult('exa', {
            results: [
              makeCandidate({
                provider: 'exa',
                title: 'Meta analysis on creatine',
                url: 'https://pubmed.ncbi.nlm.nih.gov/123456',
                domain: 'pubmed.ncbi.nlm.nih.gov',
                sourceType: 'research',
                authorityScoreHint: 3,
              }),
            ],
          }),
      }
    );

    expect(result.results[0]).toMatchObject({
      domain: 'pubmed.ncbi.nlm.nih.gov',
      sourceType: 'research',
    });
  });

  it('re-searches once when the first result set is off-topic', async () => {
    const braveSearch = vi.fn(async (route: SearchRoute) => {
      if (braveSearch.mock.calls.length === 1) {
        return makeProviderResult('brave', {
          results: [
            makeCandidate({
              title: 'What About Now Lyrics',
              url: 'https://genius.com/example/what-about-now-lyrics',
              domain: 'genius.com',
              snippet: 'Lyrics for the song What About Now.',
              sourceType: 'news',
            }),
            makeCandidate({
              title: 'What About Now official video',
              url: 'https://youtube.com/watch?v=123',
              domain: 'youtube.com',
              snippet: 'Music video and album stream.',
              sourceType: 'video',
            }),
          ],
        });
      }

      expect(route.query).toContain('Iran war');
      expect(route.query).toContain('-lyrics');

      return makeProviderResult('brave', {
        results: [
          makeCandidate({
            title: 'Iran war ceasefire talks continue',
            url: 'https://example.com/iran-war-ceasefire',
            domain: 'example.com',
            snippet: 'Latest current status on Iran war ceasefire negotiations.',
            sourceType: 'news',
          }),
        ],
      });
    });

    const result = await runSearchPipeline('latest Iran war ceasefire current status', {
      braveSearch,
    });

    expect(braveSearch).toHaveBeenCalledTimes(2);
    expect(result.query).toContain('-lyrics');
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      title: 'Iran war ceasefire talks continue',
    });
  });

  it('does not retry when visible results are relevant', async () => {
    const braveSearch = vi.fn(async () =>
      makeProviderResult('brave', {
        results: [
          makeCandidate({
            title: 'Iran war ceasefire talks continue',
            url: 'https://example.com/iran-war-ceasefire',
            domain: 'example.com',
            snippet: 'Latest current status on Iran war ceasefire negotiations.',
            sourceType: 'news',
          }),
        ],
      })
    );

    const result = await runSearchPipeline('latest Iran war ceasefire current status', {
      braveSearch,
    });

    expect(braveSearch).toHaveBeenCalledTimes(1);
    expect(result.query).toBe('latest Iran war ceasefire current status');
    expect(result.results[0]).toMatchObject({
      title: 'Iran war ceasefire talks continue',
    });
  });

  it('does not repair literal standalone queries without freshness intent', async () => {
    const braveSearch = vi.fn(async () =>
      makeProviderResult('brave', {
        results: [
          makeCandidate({
            title: 'What About Now lyrics',
            url: 'https://genius.com/example/what-about-now-lyrics',
            domain: 'genius.com',
            snippet: 'Lyrics for the song What About Now.',
            sourceType: 'news',
          }),
        ],
      })
    );

    const result = await runSearchPipeline('What About Now', {
      braveSearch,
    });

    expect(braveSearch).toHaveBeenCalledTimes(1);
    expect(result.query).toBe('What About Now');
    expect(result.results[0]).toMatchObject({
      title: 'What About Now lyrics',
    });
  });

  it('does not retry low-overlap results without an off-topic entertainment signal', async () => {
    const braveSearch = vi.fn(async () =>
      makeProviderResult('brave', {
        results: [
          makeCandidate({
            title: 'Ceasefire talks resume after regional escalation',
            url: 'https://example.com/regional-ceasefire',
            domain: 'example.com',
            snippet: 'Diplomats met Tuesday after the latest military escalation.',
            sourceType: 'news',
          }),
        ],
      })
    );

    const result = await runSearchPipeline('latest Iran war current status', {
      braveSearch,
    });

    expect(braveSearch).toHaveBeenCalledTimes(1);
    expect(result.query).toBe('latest Iran war current status');
    expect(result.results[0]).toMatchObject({
      title: 'Ceasefire talks resume after regional escalation',
    });
  });
});
