import type { SearchActionPlan, SearchPipelineOutput } from '@/lib/search/types';

const CREDIBLE_NEWS_DOMAINS = [
  'apnews.com',
  'bbc.com',
  'bbc.co.uk',
  'reuters.com',
  'nytimes.com',
  'wsj.com',
  'washingtonpost.com',
  'theguardian.com',
  'aljazeera.com',
  'npr.org',
  'espn.com',
  'fifa.com',
];

const ENTERTAINMENT_DOMAINS = [
  'azlyrics.com',
  'genius.com',
  'lyrics.com',
  'musixmatch.com',
  'spotify.com',
  'youtube.com',
  'youtu.be',
  'imdb.com',
];

const ENTERTAINMENT_TERMS = [
  'album',
  'artist',
  'chords',
  'karaoke',
  'lyrics',
  'music',
  'song',
  'soundtrack',
  'trailer',
  'video',
];

function normalize(value: string) {
  return value.toLowerCase();
}

function sourceText(source: SearchPipelineOutput['results'][number]) {
  return normalize(`${source.title} ${source.snippet} ${source.domain}`);
}

function containsAny(haystack: string, values: string[]) {
  return values.some((value) => haystack.includes(value.toLowerCase()));
}

function isEntertainmentDrift(source: SearchPipelineOutput['results'][number]) {
  const text = sourceText(source);
  return (
    source.sourceType === 'video'
    || ENTERTAINMENT_DOMAINS.some((domain) => source.domain.endsWith(domain))
    || ENTERTAINMENT_TERMS.some((term) => text.includes(term))
  );
}

export function scoreSearchResult(
  source: SearchPipelineOutput['results'][number],
  plan: SearchActionPlan
) {
  const text = sourceText(source);
  let score = 0;

  for (const entity of plan.topicEntities) {
    if (entity.length >= 3 && text.includes(entity.toLowerCase())) score += 3;
  }

  if (text.includes(plan.resolvedIntent.toLowerCase())) score += 2;
  if (plan.sourceStrategy === 'official' && source.sourceType === 'official') score += 4;
  if (plan.sourceStrategy === 'research' && source.sourceType === 'research') score += 4;
  if (plan.sourceStrategy === 'social' && (source.sourceType === 'social' || source.sourceType === 'forum')) {
    score += 3;
  }
  if (plan.sourceStrategy === 'news' && source.sourceType === 'news') score += 2;
  if (CREDIBLE_NEWS_DOMAINS.some((domain) => source.domain.endsWith(domain))) score += 2;
  if (source.publishedAt && plan.freshnessNeeded) score += 1;
  if (source.origin === 'prior' && plan.reusePriorSources) score += 1;
  if (isEntertainmentDrift(source) && !containsAny(plan.resolvedIntent, ENTERTAINMENT_TERMS)) {
    score -= 5;
  }

  return score;
}

export function assessSearchResults(
  output: SearchPipelineOutput,
  plan: SearchActionPlan
) {
  if (output.results.length === 0) {
    return {
      accepted: false,
      reason: 'No sources were returned.',
      scoredResults: [],
    };
  }

  const scoredResults = output.results
    .map((source) => ({
      source,
      score: scoreSearchResult(source, plan),
    }))
    .sort((a, b) => b.score - a.score);

  const top = scoredResults.slice(0, 5);
  const positive = top.filter((item) => item.score > 0).length;
  const entertainment = top.filter((item) => isEntertainmentDrift(item.source)).length;
  const accepted = positive >= Math.min(2, top.length) && entertainment < Math.ceil(top.length / 2);

  return {
    accepted,
    reason: accepted
      ? 'Sources match the resolved intent and topic entities.'
      : 'Top sources look off-topic for the resolved intent.',
    scoredResults,
  };
}

export function buildRepairQuery(plan: SearchActionPlan, attemptedQueries: string[]) {
  const base = plan.queries[0] ?? plan.resolvedIntent;
  const repair = `${base} ${plan.topicEntities.join(' ')} news current updates -lyrics -song -music -video`
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);

  return attemptedQueries.includes(repair) ? null : repair;
}
