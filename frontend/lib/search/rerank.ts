import type { SearchCandidate, SearchRoute } from '@/lib/search/types';
import { extractQueryTokens, makeCandidateKey } from '@/lib/search/provider-utils';

const MAX_DOMAIN_REPETITIONS = 2;

function queryRelevanceScore(candidate: SearchCandidate, route: SearchRoute) {
  const haystack = `${candidate.title} ${candidate.snippet} ${candidate.domain}`.toLowerCase();
  const tokens = extractQueryTokens(route.query);

  return tokens.reduce((score, token) => (haystack.includes(token) ? score + 1 : score), 0);
}

function sourceTypeWeight(candidate: SearchCandidate, route: SearchRoute) {
  switch (candidate.sourceType) {
    case 'official':
      return route.preferOfficial ? 6 : 4;
    case 'docs':
      return 5;
    case 'government':
      return 5;
    case 'research':
      return route.profile === 'research_backed' ? 6 : 4;
    case 'news':
      return 2;
    case 'other':
      return 1;
    case 'video':
      return -1;
    case 'forum':
      return -3;
    case 'social':
      return route.allowSocial ? -1 : -5;
    default:
      return 0;
  }
}

function profileBonus(candidate: SearchCandidate, route: SearchRoute) {
  switch (route.profile) {
    case 'research_backed':
      if (candidate.sourceType === 'research' || candidate.sourceType === 'docs') return 3;
      if (candidate.sourceType === 'forum' || candidate.sourceType === 'social') return -3;
      return 0;
    case 'official_priority':
      if (
        candidate.sourceType === 'official'
        || candidate.sourceType === 'docs'
        || candidate.sourceType === 'government'
      ) {
        return 3;
      }
      return 0;
    case 'web_social':
      if (candidate.sourceType === 'social') return 2;
      return 0;
    default:
      return 0;
  }
}

function providerBonus(candidate: SearchCandidate, route: SearchRoute) {
  if (route.profile === 'research_backed' && candidate.provider === 'exa') {
    return 1;
  }

  return 0;
}

function domainMatchBonus(candidate: SearchCandidate, route: SearchRoute) {
  const tokens = extractQueryTokens(route.query);
  return tokens.some((token) => candidate.domain.includes(token)) ? 3 : 0;
}

function computeScore(candidate: SearchCandidate, route: SearchRoute) {
  return (
    queryRelevanceScore(candidate, route) * 2
    + candidate.authorityScoreHint
    + candidate.freshnessScoreHint
    + sourceTypeWeight(candidate, route)
    + profileBonus(candidate, route)
    + providerBonus(candidate, route)
    + domainMatchBonus(candidate, route)
  );
}

export function rerankSearchCandidates(
  candidates: SearchCandidate[],
  route: SearchRoute
) {
  const sorted = [...candidates].sort((left, right) => {
    const scoreDelta = computeScore(right, route) - computeScore(left, route);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return left.title.localeCompare(right.title);
  });

  const seenKeys = new Set<string>();
  const domainCounts = new Map<string, number>();
  const ranked: SearchCandidate[] = [];

  for (const candidate of sorted) {
    const key = makeCandidateKey(candidate);
    if (seenKeys.has(key)) {
      continue;
    }

    const domainCount = domainCounts.get(candidate.domain) ?? 0;
    if (domainCount >= MAX_DOMAIN_REPETITIONS && ranked.length >= 6) {
      continue;
    }

    seenKeys.add(key);
    domainCounts.set(candidate.domain, domainCount + 1);
    ranked.push(candidate);
  }

  return ranked;
}
