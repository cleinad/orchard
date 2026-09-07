import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRefresh = vi.hoisted(() => vi.fn());

vi.mock('@/app/settings/actions', () => ({
  saveGlobalInstructions: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import SettingsClient from '@/app/settings/SettingsClient';
import SettingsPage from '@/app/(authenticated)/settings/page';
import type { SettingsViewerResult } from '@/app/settings/types';

const readyViewer = {
  status: 'ready' as const,
  viewer: {
    id: 'user-1',
    email: 'viewer@example.com',
    fullName: 'Viewer Name',
    globalInstructions: 'Use concrete examples.',
  },
};

describe('settings page rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders from the persistent viewer provider without a page data request', () => {
    const result = SettingsPage();

    expect(result.type).toBe(SettingsClient);
    expect(result.props).toEqual({});
  });

  it('renders ready settings HTML without a full-page loading spinner', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsClient, { viewerResult: readyViewer })
    );

    expect(html).toContain('Viewer Name');
    expect(html).toContain('viewer@example.com');
    expect(html).toContain('Use concrete examples.');
    expect(html).toContain('Global instructions');
    expect(html).not.toContain('animate-spin');
    expect(html).not.toContain('Unable to load your account details');
  });

  it.each([
    {
      status: 'profile-unavailable' as const,
      expected:
        'Your profile could not be loaded. The rest of settings remains available.',
    },
    {
      status: 'profile-missing' as const,
      expected:
        'Your account profile is missing. Retry after the account is repaired.',
    },
  ])('keeps the settings shell usable for $status', ({ status, expected }) => {
    const viewerResult: SettingsViewerResult =
      status === 'profile-unavailable'
        ? {
            status,
            reason: 'error',
            viewer: {
              id: 'user-1',
              email: 'viewer@example.com',
            },
          }
        : {
            status,
            viewer: {
              id: 'user-1',
              email: 'viewer@example.com',
            },
          };
    const html = renderToStaticMarkup(
      createElement(SettingsClient, {
        viewerResult,
      })
    );

    expect(html).toContain(expected);
    expect(html).toContain('Body font');
    expect(html).toContain('Sign out');
    expect(html).toContain('Retry');
    expect(html).toContain('viewer@example.com');
    expect(html).not.toContain('settings-global-instructions');
    expect(html).not.toContain('animate-spin');
  });
});
