import { describe, expect, it } from 'vitest';
import {
  appendPlainSourcesForCopy,
  formatAssistantMarkdownForCopy,
} from '@/app/home/components/messageCopy';
import { createPersistedSearchMetadataV2 } from '@/lib/search-citations';
import productionArrayFixture from '@/test-fixtures/markdown/malformed-production-array.json';

describe('assistant message copy formatting', () => {
  const searchMetadata = createPersistedSearchMetadataV2({
    status: 'success',
    profile: 'fresh_web',
    query: 'copy sources',
    providers: ['brave'],
    results: [
      {
        title: 'First Source',
        url: 'https://example.com/one',
        domain: 'example.com',
        snippet: 'First snippet',
        provider: 'brave',
        sourceType: 'other',
        publishedAt: null,
      },
      {
        title: 'Second "Quoted" Source',
        url: 'https://example.com/two',
        domain: 'example.com',
        snippet: 'Second snippet',
        provider: 'brave',
        sourceType: 'other',
        publishedAt: null,
      },
    ],
  });

  it('copies markdown without citation markers by default', () => {
    expect(
      formatAssistantMarkdownForCopy('Use the answer [1][2].', searchMetadata, 'markdown')
    ).toBe('Use the answer.');
  });

  it('normalizes the exact malformed production array for markdown copies', () => {
    expect(
      formatAssistantMarkdownForCopy(
        productionArrayFixture.malformedMarkdown,
        null,
        'markdown'
      )
    ).toBe(productionArrayFixture.normalizedMarkdown);
  });

  it('preserves literal math inside a multi-backtick code span', () => {
    const content = 'Literal ``$$\\begin{array}{l}x\\end{array}$$`` stays code.';

    expect(formatAssistantMarkdownForCopy(content, null, 'markdown')).toBe(content);
    expect(formatAssistantMarkdownForCopy(content, null, 'markdown-sources')).toBe(content);
  });

  it('copies markdown with inline citations and all source references', () => {
    expect(
      formatAssistantMarkdownForCopy('Use the answer [1].', searchMetadata, 'markdown-sources')
    ).toBe([
      'Use the answer [1].',
      '',
      'Sources:',
      '[1]: https://example.com/one "First Source"',
      '[2]: https://example.com/two "Second \\"Quoted\\" Source"',
    ].join('\n'));
  });

  it('normalizes markdown before appending source references', () => {
    expect(
      formatAssistantMarkdownForCopy(
        productionArrayFixture.malformedMarkdown,
        searchMetadata,
        'markdown-sources'
      )
    ).toBe([
      productionArrayFixture.normalizedMarkdown,
      '',
      'Sources:',
      '[1]: https://example.com/one "First Source"',
      '[2]: https://example.com/two "Second \\"Quoted\\" Source"',
    ].join('\n'));
  });

  it('appends every source to plain text copies with sources', () => {
    expect(appendPlainSourcesForCopy('Use the answer [1].', searchMetadata)).toBe([
      'Use the answer [1].',
      '',
      'Sources:',
      '1. First Source - https://example.com/one',
      '2. Second "Quoted" Source - https://example.com/two',
    ].join('\n'));
  });
});
