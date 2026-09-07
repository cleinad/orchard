import type { PersistedSearchMetadata, SearchSource } from '@/lib/search-citations';
import { hasUsableSearchSources, stripCitationMarkers } from '@/lib/search-citations';
import { normalizeMathMarkdown } from '@/lib/markdown-normalization';

export const ASSISTANT_COPY_FORMATS = [
  'plain',
  'markdown',
  'plain-sources',
  'markdown-sources',
] as const;

export type AssistantCopyFormat = (typeof ASSISTANT_COPY_FORMATS)[number];

export const DEFAULT_ASSISTANT_COPY_FORMAT: AssistantCopyFormat = 'plain';
export const ASSISTANT_COPY_FORMAT_STORAGE_KEY = 'novus.assistantCopyFormat';

export const ASSISTANT_COPY_FORMAT_LABELS: Record<AssistantCopyFormat, string> = {
  plain: 'Plain text',
  markdown: 'Markdown',
  'plain-sources': 'Plain text + sources',
  'markdown-sources': 'Markdown + sources',
};

export function isAssistantCopyFormat(value: unknown): value is AssistantCopyFormat {
  return (
    typeof value === 'string'
    && ASSISTANT_COPY_FORMATS.includes(value as AssistantCopyFormat)
  );
}

function getSources(searchMetadata: PersistedSearchMetadata | null | undefined): SearchSource[] {
  if (!searchMetadata || !hasUsableSearchSources(searchMetadata)) {
    return [];
  }

  return searchMetadata.sources;
}

function escapeReferenceTitle(title: string) {
  return title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatPlainSources(sources: SearchSource[]) {
  if (sources.length === 0) return '';

  return [
    'Sources:',
    ...sources.map((source) => `${source.id}. ${source.title} - ${source.url}`),
  ].join('\n');
}

function formatMarkdownSources(sources: SearchSource[]) {
  if (sources.length === 0) return '';

  return [
    'Sources:',
    ...sources.map((source) => (
      `[${source.id}]: ${source.url} "${escapeReferenceTitle(source.title)}"`
    )),
  ].join('\n');
}

function withSources(body: string, sourcesText: string) {
  return [body.trim(), sourcesText].filter(Boolean).join('\n\n');
}

export function formatAssistantMarkdownForCopy(
  content: string,
  searchMetadata: PersistedSearchMetadata | null | undefined,
  format: AssistantCopyFormat
) {
  const sources = getSources(searchMetadata);
  const body =
    format === 'markdown' || format === 'markdown-sources'
      ? normalizeMathMarkdown(content)
      : content;

  if (format === 'markdown-sources') {
    return withSources(body, formatMarkdownSources(sources));
  }

  return stripCitationMarkers(body, searchMetadata).trim();
}

export function appendPlainSourcesForCopy(
  body: string,
  searchMetadata: PersistedSearchMetadata | null | undefined
) {
  return withSources(body, formatPlainSources(getSources(searchMetadata)));
}
