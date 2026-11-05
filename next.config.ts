import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages read the session cookie on every request; keep rendering dynamic for release 1.
  cacheComponents: false,
};

export default nextConfig;
