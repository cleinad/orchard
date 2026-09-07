import type { NextConfig } from "next";

const homeE2eFixturesEnabled =
  process.env.NEXT_PUBLIC_HOME_E2E_FIXTURES === '1';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Keep automated browser runs isolated from an already-running local dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  typescript: {
    tsconfigPath: process.env.NEXT_TS_CONFIG_PATH || 'tsconfig.json',
  },
  turbopack: {
    resolveAlias: homeE2eFixturesEnabled
      ? {}
      : {
          '@/app/home/components/HomeFixtureRuntimeLoader':
            './app/home/components/HomeFixtureRuntimeDisabled.tsx',
        },
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.orchard.study' }],
        destination: 'https://orchard.study/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
