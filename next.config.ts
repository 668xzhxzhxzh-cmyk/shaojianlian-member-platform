import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typescript: {
    tsconfigPath: "./tsconfig.next.json",
  },
  experimental: {
    // The Alibaba Cloud delivery server has 2 GB RAM. Keep production builds
    // single-worker so static generation cannot exhaust the instance.
    cpus: 1,
  },
};

export default nextConfig;
