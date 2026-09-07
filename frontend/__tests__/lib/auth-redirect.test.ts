import { describe, expect, it } from 'vitest';
import { getSafeRedirectPath } from '@/lib/auth-redirect';

describe('getSafeRedirectPath', () => {
  it('falls back to /home for missing or unsafe values', () => {
    expect(getSafeRedirectPath(null)).toBe('/home');
    expect(getSafeRedirectPath('settings')).toBe('/home');
    expect(getSafeRedirectPath('//evil.example')).toBe('/home');
    expect(getSafeRedirectPath('/')).toBe('/home');
    expect(getSafeRedirectPath('/login')).toBe('/home');
    expect(getSafeRedirectPath('/login?redirect=/settings')).toBe('/home');
    expect(getSafeRedirectPath('/signup')).toBe('/home');
  });

  it('preserves safe in-app destinations', () => {
    expect(getSafeRedirectPath('/settings')).toBe('/settings');
    expect(getSafeRedirectPath('/workspaces/workspace-1')).toBe('/workspaces/workspace-1');
    expect(getSafeRedirectPath('/mentors?view=create')).toBe('/mentors?view=create');
  });
});
