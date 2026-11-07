import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Keep prefetched dynamic segments in the client cache. Every page here is
     * `force-dynamic`, whose default client-cache TTL is 0 — so tapping between
     * bottom-nav tabs refetched the whole segment from the server every time,
     * even when you had just come from it. 30s makes tab switching instant
     * without letting task state go visibly stale.
     */
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
