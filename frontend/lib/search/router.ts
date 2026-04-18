import type { SearchProfile, SearchRoute } from '@/lib/search/types';

const SOCIAL_CUES = [
  'what are people saying',
  'what people are saying',
  'reaction',
  'reactions',
  'sentiment',
  'discourse',
  'on x',
  'on twitter',
  'online chatter',
  'public opinion',
];

const RESEARCH_CUES = [
  'study',
  'studies',
  'research',
  'paper',
  'papers',
  'evidence',
  'meta-analysis',
  'systematic review',
  'trial',
  'clinical',
  'efficacy',
  'safety',
  'literature',
];

const OFFICIAL_CUES = [
  'official',
  'official sources',
  'docs',
  'documentation',
  'api docs',
  'release notes',
  'changelog',
  'pricing',
  'policy',
  'terms',
  'filing',
  'sec',
  'guidance',
];

const FRESHNESS_CUES = [
  'latest',
  'today',
  'recent',
  'this week',
  'new',
  'changed',
  'announced',
  'released',
  'update',
  'updates',
  'currently',
  'current',
];

function normalizeQuery(query: string) {
  return query.replace(/\s+/g, ' ').trim();
}

function includesAny(haystack: string, phrases: string[]) {
  return phrases.some((phrase) => haystack.includes(phrase));
}

function scoreSocialIntent(query: string) {
  let score = 0;
  if (includesAny(query, SOCIAL_CUES)) score += 6;
  if (/\b(opinion|opinions|anecdote|anecdotes|community)\b/.test(query)) score += 2;
  return score;
}

function scoreResearchIntent(query: string) {
  let score = 0;
  if (includesAny(query, RESEARCH_CUES)) score += 6;
  if (/\b(does|is there|what does the evidence say)\b/.test(query)) score += 1;
  return score;
}

function scoreOfficialIntent(query: string) {
  let score = 0;
  if (includesAny(query, OFFICIAL_CUES)) score += 4;
  if (/\b(company|product|api|pricing|release|announcement|policy|filing)\b/.test(query)) {
    score += 1;
  }
  return score;
}

function scoreFreshnessIntent(query: string) {
  let score = 0;
  if (includesAny(query, FRESHNESS_CUES)) score += 3;
  if (/\b(this month|right now|breaking|just happened)\b/.test(query)) score += 2;
  return score;
}

function resolveFreshness(query: string): SearchRoute['freshness'] {
  if (/\b(today|right now|breaking)\b/.test(query)) return 'pd';
  if (/\b(this week|latest|recent|announced|released)\b/.test(query)) return 'pw';
  if (/\b(this month|current)\b/.test(query)) return 'pm';
  if (/\b(this year)\b/.test(query)) return 'py';
  return '';
}

function buildRoute(profile: SearchProfile, query: string): SearchRoute {
  const freshness = resolveFreshness(query);

  switch (profile) {
    case 'research_backed':
      return {
        profile,
        providers: ['brave', 'exa'],
        query,
        freshness,
        preferOfficial: true,
        allowSocial: false,
        exaCategory: 'research paper',
      };
    case 'official_priority':
      return {
        profile,
        providers: ['brave', 'exa'],
        query,
        freshness,
        preferOfficial: true,
        allowSocial: false,
        exaCategory: null,
      };
    case 'web_social':
      return {
        profile,
        providers: ['brave'],
        query,
        freshness,
        preferOfficial: true,
        allowSocial: true,
        exaCategory: null,
      };
    default:
      return {
        profile: 'fresh_web',
        providers: ['brave'],
        query,
        freshness,
        preferOfficial: true,
        allowSocial: false,
        exaCategory: null,
      };
  }
}

export function classifySearchQuery(rawQuery: string): SearchRoute {
  const query = normalizeQuery(rawQuery);
  const loweredQuery = query.toLowerCase();

  if (!query) {
    return buildRoute('fresh_web', query);
  }

  const socialScore = scoreSocialIntent(loweredQuery);
  const researchScore = scoreResearchIntent(loweredQuery);
  const officialScore = scoreOfficialIntent(loweredQuery);
  const freshnessScore = scoreFreshnessIntent(loweredQuery);

  if (socialScore >= 6) {
    return buildRoute('web_social', query);
  }

  if (researchScore >= 6) {
    return buildRoute('research_backed', query);
  }

  if (officialScore >= 4) {
    return buildRoute('official_priority', query);
  }

  if (freshnessScore >= 3) {
    return buildRoute('fresh_web', query);
  }

  return buildRoute('fresh_web', query);
}
