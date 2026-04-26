import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/trips/:path*", destination: "http://localhost:8003/:path*" },
      { source: "/api/users/:path*", destination: "http://localhost:8004/:path*" },
      { source: "/api/realtime/:path*", destination: "http://localhost:8005/:path*" },
    ];
  },
};

export default nextConfig;
