import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 0, // never serve stale data for dynamic routes
    },
  },
};

export default nextConfig;
