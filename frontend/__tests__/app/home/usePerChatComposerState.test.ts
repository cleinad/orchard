import { describe, expect, it } from 'vitest';
import {
  clearSearchModeForKey,
  getSearchModeFromMap,
  setSearchModeForKey,
} from '@/app/home/components/usePerChatComposerState';
import { BLANK_COMPOSER_KEY } from '@/app/home/components/homeSelection';

describe('usePerChatComposerState search modes', () => {
  it('does not leak blank or draft search mode into an unrelated persistent chat', () => {
    const sessionStore = {};
    let modes = {};

    modes = setSearchModeForKey(modes, BLANK_COMPOSER_KEY, 'off', sessionStore);
    modes = setSearchModeForKey(modes, 'draft:draft-1', 'required', sessionStore);

    expect(getSearchModeFromMap(modes, BLANK_COMPOSER_KEY)).toBe('off');
    expect(getSearchModeFromMap(modes, 'draft:draft-1')).toBe('required');
    expect(getSearchModeFromMap(modes, 'persistent:conversation-1')).toBe('auto');
  });

  it('clears discarded composer search mode state', () => {
    const sessionStore = {};
    let modes = {};

    modes = setSearchModeForKey(modes, 'draft:draft-1', 'required', sessionStore);
    modes = clearSearchModeForKey(modes, 'draft:draft-1', sessionStore);

    expect(getSearchModeFromMap(modes, 'draft:draft-1')).toBe('auto');
    expect(sessionStore).toEqual({});
  });
});
