'use client';

import { useState } from 'react';
import { getHomeE2eFixture } from '@/app/home/e2eFixtures';
import {
  HOME_ERROR_BOUNDARY_FIXTURE_KEY,
  HOME_ERROR_BOUNDARY_RECOVERED_STORAGE_KEY,
} from '@/app/home/homeE2eFixtureKeys';
import {
  useHomeFixtureRuntime,
  type UseHomeFixtureRuntimeParams,
} from '@/app/home/components/useHomeFixtureRuntime';

interface HomeFixtureRuntimeLoaderProps
  extends Omit<UseHomeFixtureRuntimeParams, 'fixture'> {
  fixtureKey: string;
}

export default function HomeFixtureRuntimeLoader({
  fixtureKey,
  ...runtimeProps
}: HomeFixtureRuntimeLoaderProps) {
  const [shouldThrowErrorBoundaryFixture] = useState(
    () =>
      fixtureKey === HOME_ERROR_BOUNDARY_FIXTURE_KEY
      && window.sessionStorage.getItem(
        HOME_ERROR_BOUNDARY_RECOVERED_STORAGE_KEY
      ) !== '1'
  );
  useHomeFixtureRuntime({
    ...runtimeProps,
    fixture:
      fixtureKey === HOME_ERROR_BOUNDARY_FIXTURE_KEY
        ? null
        : getHomeE2eFixture(fixtureKey),
  });

  if (shouldThrowErrorBoundaryFixture) {
    throw new Error('Injected home error-boundary fixture');
  }

  return null;
}
