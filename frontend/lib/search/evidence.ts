import type { SearchSource } from '@/lib/search-citations';
import type { SearchActionPlan, SearchPipelineOutput } from '@/lib/search/types';

function compact(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export function sourcesFromSearchOutput(output: SearchPipelineOutput): SearchSource[] {
  const seen = new Set<string>();
  const sources: SearchSource[] = [];

  for (const result of output.results) {
    const normalizedUrl = result.url.trim();
    if (!normalizedUrl || seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    sources.push({
      id: sources.length + 1,
      title: compact(result.title, 180),
      url: normalizedUrl,
      domain: result.domain,
      snippet: compact(result.snippet, 220),
      provider: result.provider,
      sourceType: result.sourceType,
      publishedAt: result.publishedAt,
    });
  }

  return sources;
}

export function sourceMatchesPlan(source: SearchSource, plan: SearchActionPlan) {
  const text = `${source.title} ${source.snippet} ${source.domain}`.toLowerCase();
  return plan.topicEntities.some(
    (entity) => entity.length >= 3 && text.includes(entity.toLowerCase())
  );
}
