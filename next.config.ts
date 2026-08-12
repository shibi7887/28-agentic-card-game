import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: false },
  allowedDevOrigins: ['10.0.0.213']
};

export default nextConfig;
