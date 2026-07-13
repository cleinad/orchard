import { describe, expect, it } from 'vitest';
import {
  clearSearchModeForKey,
  getSearchModeFromMap,
  moveSearchModeBetweenKeys,
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
    expect(getSearchModeFromMap(modes, 'persistent:conversation-1')).toBe('off');
  });

  it('clears discarded composer search mode state', () => {
    const sessionStore = {};
    let modes = {};

    modes = setSearchModeForKey(modes, 'draft:draft-1', 'required', sessionStore);
    modes = clearSearchModeForKey(modes, 'draft:draft-1', sessionStore);

    expect(getSearchModeFromMap(modes, 'draft:draft-1')).toBe('off');
    expect(sessionStore).toEqual({});
  });

  it('moves non-default draft search mode to the promoted persistent chat', () => {
    const sessionStore = {};
    let modes = {};

    modes = setSearchModeForKey(modes, 'draft:draft-1', 'required', sessionStore);
    modes = setSearchModeForKey(modes, 'persistent:conversation-2', 'off', sessionStore);
    modes = moveSearchModeBetweenKeys(
      modes,
      'draft:draft-1',
      'persistent:conversation-1',
      sessionStore
    );

    expect(getSearchModeFromMap(modes, 'draft:draft-1')).toBe('off');
    expect(getSearchModeFromMap(modes, 'persistent:conversation-1')).toBe('required');
    expect(getSearchModeFromMap(modes, 'persistent:conversation-2')).toBe('off');
    expect(sessionStore).toEqual({
      'persistent:conversation-1': 'required',
    });
  });

  it('clears the promoted persistent key when moving default off mode', () => {
    const sessionStore = {};
    let modes = {};

    modes = setSearchModeForKey(modes, 'persistent:conversation-1', 'required', sessionStore);
    modes = moveSearchModeBetweenKeys(
      modes,
      'draft:draft-1',
      'persistent:conversation-1',
      sessionStore
    );

    expect(getSearchModeFromMap(modes, 'persistent:conversation-1')).toBe('off');
    expect(sessionStore).toEqual({});
  });

  it('preserves auto as an explicit per-chat choice', () => {
    const sessionStore = {};
    const modes = setSearchModeForKey({}, 'persistent:conversation-1', 'auto', sessionStore);

    expect(getSearchModeFromMap(modes, 'persistent:conversation-1')).toBe('auto');
    expect(sessionStore).toEqual({ 'persistent:conversation-1': 'auto' });
  });
});
