import { describe, expect, it } from 'vitest';
import {
  createPersistedSearchMetadata,
  createPersistedSearchMetadataV2,
  hasUsableSearchSources,
  parsePersistedSearchMetadata,
  splitTextWithCitations,
  stripCitationMarkers,
  stripInvalidCitationMarkers,
} from '@/lib/search-citations';

describe('search citations helpers', () => {
  const legacySearchMetadata = createPersistedSearchMetadata('required', {
    status: 'success',
    query: 'release notes',
    results: [
      {
        title: 'Example Title',
        url: 'https://www.example.com/article',
        snippet: 'Example snippet',
      },
      {
        title: 'Second Title',
        url: 'https://example.com/two',
        snippet: 'Second snippet',
      },
    ],
  });
  const searchMetadata = createPersistedSearchMetadataV2({
    status: 'partial',
    profile: 'official_priority',
    query: 'release notes',
    providers: ['brave', 'exa'],
    results: [
      {
        title: 'Example Title',
        url: 'https://www.example.com/article',
        domain: 'example.com',
        snippet: 'Example snippet',
        provider: 'brave',
        sourceType: 'official',
        publishedAt: '2026-04-17T00:00:00.000Z',
      },
      {
        title: 'Second Title',
        url: 'https://example.com/two',
        domain: 'example.com',
        snippet: 'Second snippet',
        provider: 'exa',
        sourceType: 'docs',
        publishedAt: null,
      },
    ],
  });

  it('normalizes legacy persisted search metadata with stable source ids and domains', () => {
    expect(legacySearchMetadata).toMatchObject({
      version: 1,
      mode: 'required',
      status: 'success',
      query: 'release notes',
      sources: [
        expect.objectContaining({
          id: 1,
          title: 'Example Title',
          domain: 'example.com',
          provider: null,
          sourceType: null,
        }),
        expect.objectContaining({
          id: 2,
          title: 'Second Title',
          domain: 'example.com',
          provider: null,
          sourceType: null,
        }),
      ],
    });
  });

  it('normalizes v2 search metadata with provider and profile details', () => {
    expect(searchMetadata).toMatchObject({
      version: 2,
      mode: 'required',
      profile: 'official_priority',
      status: 'partial',
      query: 'release notes',
      providers: ['brave', 'exa'],
      sources: [
        expect.objectContaining({
          id: 1,
          title: 'Example Title',
          domain: 'example.com',
          provider: 'brave',
          sourceType: 'official',
        }),
        expect.objectContaining({
          id: 2,
          title: 'Second Title',
          domain: 'example.com',
          provider: 'exa',
          sourceType: 'docs',
        }),
      ],
    });
  });

  it('preserves persisted search activity and source origin', () => {
    const metadata = createPersistedSearchMetadataV2({
      status: 'success',
      profile: 'fresh_web',
      query: 'latest Iran ceasefire current status',
      queries: ['latest Iran ceasefire current status'],
      resolvedIntent: 'Find the current status of Iran ceasefire talks.',
      topicEntities: ['Iran', 'ceasefire'],
      activity: {
        collapsedLabel: 'Search completed',
        events: [
          {
            type: 'search_started',
            query: 'latest Iran ceasefire current status',
            attempt: 1,
          },
          {
            type: 'search_completed',
            sourceCount: 2,
            collapsedLabel: 'Search completed',
          },
        ],
      },
      providers: ['brave'],
      results: [
        {
          title: 'Prior source',
          url: 'https://example.com/prior',
          domain: 'example.com',
          snippet: 'Prior source snippet',
          provider: 'brave',
          sourceType: 'news',
          publishedAt: null,
          origin: 'prior',
        },
      ],
    });

    expect(parsePersistedSearchMetadata(metadata)).toMatchObject({
      version: 2,
      activity: {
        collapsedLabel: 'Search completed',
        events: [
          expect.objectContaining({
            type: 'search_started',
            query: 'latest Iran ceasefire current status',
          }),
          expect.objectContaining({
            type: 'search_completed',
            sourceCount: 2,
          }),
        ],
      },
      sources: [
        expect.objectContaining({
          origin: 'prior',
        }),
      ],
    });
  });

  it('parses valid persisted search metadata and rejects malformed values', () => {
    expect(parsePersistedSearchMetadata(legacySearchMetadata)).toEqual(legacySearchMetadata);
    expect(parsePersistedSearchMetadata(searchMetadata)).toEqual(searchMetadata);
    expect(parsePersistedSearchMetadata({ version: 2 })).toBeNull();
    expect(
      parsePersistedSearchMetadata({
        ...searchMetadata,
        sources: [{ ...searchMetadata.sources[0], provider: 'invalid' }],
      })
    ).toBeNull();
  });

  it('splits valid citation markers into separate compact parts', () => {
    expect(
      splitTextWithCitations('A cited sentence [1] [2].', new Set([1, 2]))
    ).toEqual([
      { type: 'text', text: 'A cited sentence ' },
      { type: 'citation', text: '[1]', sourceId: 1 },
      { type: 'text', text: ' ' },
      { type: 'citation', text: '[2]', sourceId: 2 },
      { type: 'text', text: '.' },
    ]);
  });

  it('splits adjacent valid citation markers into separate compact parts', () => {
    expect(
      splitTextWithCitations('A cited sentence [1][2].', new Set([1, 2]))
    ).toEqual([
      { type: 'text', text: 'A cited sentence ' },
      { type: 'citation', text: '[1]', sourceId: 1 },
      { type: 'citation', text: '[2]', sourceId: 2 },
      { type: 'text', text: '.' },
    ]);
  });

  it('does not treat numeric brackets inside words as citations', () => {
    expect(
      splitTextWithCitations('Use array[1] as the second item.', new Set([1]))
    ).toEqual([{ type: 'text', text: 'Use array[1] as the second item.' }]);
    expect(
      splitTextWithCitations('Use array[1][2] as the nested item.', new Set([1, 2]))
    ).toEqual([{ type: 'text', text: 'Use array[1][2] as the nested item.' }]);
    expect(
      stripCitationMarkers('Use array[1][2] as the nested item.', searchMetadata)
    ).toBe('Use array[1][2] as the nested item.');
    expect(
      stripInvalidCitationMarkers('Use array[1][7] as the nested item.', searchMetadata)
    ).toBe('Use array[1][7] as the nested item.');
  });

  it('strips valid citation markers for context reuse', () => {
    expect(
      stripCitationMarkers('A cited sentence [1] [2].', searchMetadata)
    ).toBe('A cited sentence.');
    expect(
      stripCitationMarkers('A cited sentence [1][2].', searchMetadata)
    ).toBe('A cited sentence.');
  });

  it('strips invalid citation markers while preserving valid ones', () => {
    expect(
      stripInvalidCitationMarkers('A cited sentence [1] [7].', searchMetadata)
    ).toBe('A cited sentence [1].');
    expect(
      stripInvalidCitationMarkers('A cited sentence [1][7].', searchMetadata)
    ).toBe('A cited sentence [1].');
  });

  it('treats partial search metadata with sources as usable grounding', () => {
    expect(hasUsableSearchSources(searchMetadata)).toBe(true);
    expect(hasUsableSearchSources(legacySearchMetadata)).toBe(true);
    expect(
      hasUsableSearchSources({
        ...searchMetadata,
        status: 'no_results',
      })
    ).toBe(false);
  });
});
