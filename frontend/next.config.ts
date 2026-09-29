import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * Trivia predates the platform and owned the app's root paths, so invite links of the form
   * `/play/<pin>` are already in circulation. They redirect permanently into the game's new
   * namespace rather than 404ing. See DECISIONS.md D7.
   */
  async redirects() {
    return [
      { source: "/play/:path*", destination: "/trivia/play/:path*", permanent: true },
      { source: "/host/:path*", destination: "/trivia/host/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
