import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Keep automated browser runs isolated from an already-running local dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  typescript: {
    tsconfigPath: process.env.NEXT_TS_CONFIG_PATH || 'tsconfig.json',
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
