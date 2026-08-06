const HOME_E2E_FIXTURE_KEYS = new Set([
  'inline-threads',
  'inline-threads-persistent',
  'inline-threads-highlight-order',
  'inline-threads-offset-render',
  'inline-threads-repeated-text',
  'inline-threads-bullet-list',
  'inline-threads-rich-selection',
  'inline-threads-table-selection',
  'conversation-map-temporary',
]);

export const HOME_E2E_FIXTURES_ENABLED =
  process.env.NEXT_PUBLIC_HOME_E2E_FIXTURES === '1';

export function isHomeE2eFixtureKey(
  key: string | null
): key is string {
  return (
    HOME_E2E_FIXTURES_ENABLED
    && key !== null
    && HOME_E2E_FIXTURE_KEYS.has(key)
  );
}
