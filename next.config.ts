import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages read the session cookie on every request; keep rendering dynamic for release 1.
  cacheComponents: false,
  // Logo uploads are capped at 1 MB in the action; leave room for multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "1500kb" } },
};

export default nextConfig;
