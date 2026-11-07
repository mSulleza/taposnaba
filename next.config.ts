import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The helper takes evidence photos with the phone camera, so camera stays allowed for this site.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
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
