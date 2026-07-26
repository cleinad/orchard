import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep automated browser runs isolated from an already-running local dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  typescript: {
    tsconfigPath: process.env.NEXT_TS_CONFIG_PATH || 'tsconfig.json',
  },
};

export default nextConfig;
