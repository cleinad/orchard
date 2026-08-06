'use client';

import { getHomeE2eFixture } from '@/app/home/e2eFixtures';
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
  useHomeFixtureRuntime({
    ...runtimeProps,
    fixture: getHomeE2eFixture(fixtureKey),
  });

  return null;
}
