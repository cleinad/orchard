import { describe, expect, it } from 'vitest';
import {
  createPersistedSearchMetadata,
  parsePersistedSearchMetadata,
  splitTextWithCitations,
  stripCitationMarkers,
  stripInvalidCitationMarkers,
} from '@/lib/search-citations';

describe('search citations helpers', () => {
  const searchMetadata = createPersistedSearchMetadata('required', {
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

  it('normalizes persisted search metadata with stable source ids and domains', () => {
    expect(searchMetadata).toMatchObject({
      version: 1,
      mode: 'required',
      status: 'success',
      query: 'release notes',
      sources: [
        expect.objectContaining({
          id: 1,
          title: 'Example Title',
          domain: 'example.com',
        }),
        expect.objectContaining({
          id: 2,
          title: 'Second Title',
          domain: 'example.com',
        }),
      ],
    });
  });

  it('parses valid persisted search metadata and rejects malformed values', () => {
    expect(parsePersistedSearchMetadata(searchMetadata)).toEqual(searchMetadata);
    expect(parsePersistedSearchMetadata({ version: 2 })).toBeNull();
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

  it('strips valid citation markers for context reuse', () => {
    expect(
      stripCitationMarkers('A cited sentence [1] [2].', searchMetadata)
    ).toBe('A cited sentence.');
  });

  it('strips invalid citation markers while preserving valid ones', () => {
    expect(
      stripInvalidCitationMarkers('A cited sentence [1] [7].', searchMetadata)
    ).toBe('A cited sentence [1].');
  });
});
