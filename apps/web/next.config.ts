import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@kps/ui", "@kps/types", "@kps/shared"],
};

export default nextConfig;
