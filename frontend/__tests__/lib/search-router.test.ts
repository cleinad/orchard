import { describe, expect, it } from 'vitest';
import { classifySearchQuery } from '@/lib/search/router';

describe('search router', () => {
  it('routes freshness queries to fresh_web with brave only', () => {
    expect(classifySearchQuery('latest climate summit updates')).toMatchObject({
      profile: 'fresh_web',
      providers: ['brave'],
      freshness: 'pw',
    });
  });

  it('routes evidence queries to research_backed', () => {
    expect(
      classifySearchQuery('What does the evidence say about creatine and cognition?')
    ).toMatchObject({
      profile: 'research_backed',
      providers: ['brave', 'exa'],
      exaCategory: 'research paper',
    });
  });

  it('routes docs and filing queries to official_priority', () => {
    expect(classifySearchQuery('official sources only for Anthropic release notes')).toMatchObject({
      profile: 'official_priority',
      providers: ['brave', 'exa'],
    });
  });

  it('routes reaction and sentiment queries to web_social', () => {
    expect(classifySearchQuery('what are people saying about the outage on X')).toMatchObject({
      profile: 'web_social',
      providers: ['brave'],
      allowSocial: true,
    });
  });

  it('prefers explicit social intent over freshness cues', () => {
    expect(classifySearchQuery('latest reaction on twitter to the release')).toMatchObject({
      profile: 'web_social',
    });
  });
});
