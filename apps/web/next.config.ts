import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // NEXT_DIST_DIR=.next-verify : build de vérification dans un dossier à
  // part, sans écraser le `.next` d'un `pnpm dev` en cours.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@kps/ui", "@kps/types", "@kps/shared"],
};

export default nextConfig;
