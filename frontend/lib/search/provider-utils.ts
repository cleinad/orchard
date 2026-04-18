import type { SearchCandidate, SearchSourceType } from '@/lib/search/types';

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'at',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'latest',
  'of',
  'on',
  'or',
  'recent',
  'the',
  'this',
  'to',
  'what',
  'with',
]);
const RESEARCH_DOMAINS = [
  'arxiv.org',
  'pubmed.ncbi.nlm.nih.gov',
  'nature.com',
  'science.org',
  'sciencedirect.com',
  'springer.com',
  'jamanetwork.com',
  'nejm.org',
  'bmj.com',
  'cell.com',
];
const FORUM_DOMAINS = ['reddit.com', 'stackexchange.com', 'stackoverflow.com', 'news.ycombinator.com'];

export function sanitizeText(value: string, maxLength: number) {
  const normalized = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export function sanitizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.startsWith('utm_')
        || key === 'ref'
        || key === 'ref_src'
        || key === 'fbclid'
        || key === 'gclid'
      ) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function getSourceDomain(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function canonicalizeUrl(url: string) {
  const sanitized = sanitizeUrl(url);
  if (!sanitized) return null;

  try {
    const parsed = new URL(sanitized);
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch {
    return sanitized;
  }
}

export function extractQueryTokens(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

export function inferSourceType(
  query: string,
  url: string,
  title: string,
  snippet: string
): SearchSourceType {
  const domain = getSourceDomain(url);
  const normalizedText = `${title} ${snippet}`.toLowerCase();
  const loweredDomain = domain.toLowerCase();
  const loweredUrl = url.toLowerCase();
  const queryTokens = extractQueryTokens(query);

  if (loweredDomain === 'x.com' || loweredDomain === 'twitter.com') {
    return 'social';
  }

  if (loweredDomain === 'youtube.com' || loweredDomain === 'youtu.be') {
    return 'video';
  }

  if (FORUM_DOMAINS.some((forumDomain) => loweredDomain.endsWith(forumDomain))) {
    return 'forum';
  }

  if (loweredDomain.endsWith('.gov') || loweredDomain.endsWith('.gc.ca')) {
    return 'government';
  }

  if (
    RESEARCH_DOMAINS.some((researchDomain) => loweredDomain.endsWith(researchDomain))
    || loweredUrl.includes('/doi/')
    || normalizedText.includes('abstract')
    || normalizedText.includes('meta-analysis')
    || normalizedText.includes('systematic review')
  ) {
    return 'research';
  }

  if (
    loweredDomain.startsWith('docs.')
    || loweredUrl.includes('/docs')
    || loweredUrl.includes('/documentation')
    || loweredUrl.includes('/changelog')
    || loweredUrl.includes('/release-notes')
    || normalizedText.includes('api reference')
    || normalizedText.includes('documentation')
  ) {
    return 'docs';
  }

  if (
    queryTokens.some((token) => loweredDomain.includes(token))
    || loweredUrl.includes('/pricing')
    || loweredUrl.includes('/blog')
    || loweredUrl.includes('/announcements')
    || loweredUrl.includes('/newsroom')
    || loweredUrl.includes('/press')
  ) {
    return 'official';
  }

  return 'news';
}

export function sourceAuthorityHint(sourceType: SearchSourceType) {
  switch (sourceType) {
    case 'official':
    case 'docs':
    case 'government':
    case 'research':
      return 3;
    case 'news':
      return 1;
    case 'other':
      return 0;
    case 'video':
      return -1;
    case 'forum':
      return -2;
    case 'social':
      return -3;
    default:
      return 0;
  }
}

export function freshnessHint(dateValue: string | null | undefined) {
  if (!dateValue) {
    return 0;
  }

  const timestamp = Date.parse(dateValue);
  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  const ageMs = Date.now() - timestamp;
  const day = 24 * 60 * 60 * 1000;
  if (ageMs <= day) return 3;
  if (ageMs <= 7 * day) return 2;
  if (ageMs <= 31 * day) return 1;
  return 0;
}

export function makeCandidateKey(candidate: Pick<SearchCandidate, 'title' | 'url'>) {
  const canonicalUrl = canonicalizeUrl(candidate.url);
  return canonicalUrl || `${candidate.title}::${candidate.url}`;
}
