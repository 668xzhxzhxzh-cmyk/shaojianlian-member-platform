import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typescript: {
    tsconfigPath: "./tsconfig.next.json",
  },
};

export default nextConfig;
