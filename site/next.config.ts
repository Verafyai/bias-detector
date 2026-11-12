import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stored runs are read from the committed files at request time.
  outputFileTracingIncludes: {
    "/**": ["./data/bias/runs/**/*.json"],
  },
  async redirects() {
    return [
      { source: "/bias/questions/versions", destination: "/bias/questions", permanent: false },
      { source: "/questions/versions", destination: "/bias/questions", permanent: false },
    ];
  },
  async rewrites() {
    // bias.verafy.ai/ and bias.verafy.ai/leaderboard keep working, as they did when this host was a rewrite of /bias.
    return [
      { source: "/", destination: "/bias" },
      { source: "/:path((?!bias/|bias$|api/|_next/).*)", destination: "/bias/:path" },
    ];
  },
};

export default nextConfig;
