import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The inherited codebase contains legacy lint debt in API and RAG modules.
  // Keep production builds unblocked while lint remains available as a separate task.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
