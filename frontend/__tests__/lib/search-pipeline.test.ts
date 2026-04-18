import { describe, expect, it, vi } from 'vitest';
import { runSearchPipeline } from '@/lib/search/pipeline';
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
    const braveSearch = vi.fn(async (_route: SearchRoute) =>
      makeProviderResult('brave', {
        results: [makeCandidate({ url: 'https://openai.com/pricing', domain: 'openai.com', sourceType: 'official', authorityScoreHint: 3 })],
      })
    );
    const exaSearch = vi.fn(async (_route: SearchRoute) =>
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
});
