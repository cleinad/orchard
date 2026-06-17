import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('settings billing navigation', () => {
  it('links the settings page to the dedicated billing page', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/settings/page.tsx'),
      'utf8'
    );

    expect(source).toContain('label="Billing"');
    expect(source).toContain("router.push('/settings/billing')");
  });
});
