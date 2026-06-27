import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESPONSE_STYLE,
  buildResponseStylePrompt,
  getResponseStyleSummary,
  sanitizeResponseStyle,
} from '@/lib/response-style';

describe('response style', () => {
  it('defaults invalid input to brief and familiar', () => {
    expect(sanitizeResponseStyle({ length: 'huge', level: 'wizard' })).toEqual(
      DEFAULT_RESPONSE_STYLE
    );
  });

  it('sanitizes session notes before prompt construction', () => {
    const style = sanitizeResponseStyle({
      length: 'deep',
      level: 'new',
      sessionNote: '  Give   examples\nfor every response.  ',
    });

    expect(style).toEqual({
      length: 'deep',
      level: 'new',
      sessionNote: 'Give examples for every response.',
    });
  });

  it('summarizes defaults and custom settings for the composer trigger', () => {
    expect(getResponseStyleSummary(DEFAULT_RESPONSE_STYLE)).toBe('Response style');
    expect(
      getResponseStyleSummary({
        length: 'concise',
        level: 'fluent',
        sessionNote: '',
      })
    ).toBe('Concise · Fluent');
  });

  it('places session notes after slider guidance so they can override conflicts', () => {
    const prompt = buildResponseStylePrompt({
      length: 'concise',
      level: 'fluent',
      sessionNote: 'Give one example in every response.',
    });

    expect(prompt).toContain('Length: Concise');
    expect(prompt).toContain('Level: Fluent');
    expect(prompt.indexOf('Length: Concise')).toBeLessThan(
      prompt.indexOf('<session_response_style_note>')
    );
    expect(prompt).toContain('Give one example in every response.');
  });

  it('defines concrete output expectations for each length level', () => {
    expect(buildResponseStylePrompt({ length: 'concise', level: 'familiar', sessionNote: '' }))
      .toContain('Answer in 1 to 2 sentences.');
    expect(buildResponseStylePrompt({ length: 'brief', level: 'familiar', sessionNote: '' }))
      .toContain('Answer directly with concise, skimmable prose');
    expect(buildResponseStylePrompt({ length: 'detailed', level: 'familiar', sessionNote: '' }))
      .toContain('Use a focused teaching style');
    expect(buildResponseStylePrompt({ length: 'deep', level: 'familiar', sessionNote: '' }))
      .toContain('Give a deeper, high-signal response');
  });

  it('calibrates assumed familiarity across the four level stops', () => {
    expect(buildResponseStylePrompt({ length: 'brief', level: 'new', sessionNote: '' }))
      .toContain('little or no background');
    expect(buildResponseStylePrompt({ length: 'brief', level: 'familiar', sessionNote: '' }))
      .toContain('knows the basics');
    expect(buildResponseStylePrompt({ length: 'brief', level: 'advanced', sessionNote: '' }))
      .toContain('strong working knowledge');
    expect(buildResponseStylePrompt({ length: 'brief', level: 'fluent', sessionNote: '' }))
      .toContain('comfortable operating in the domain');
  });
});
