import type { NextConfig } from "next";

const githubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "averis-ai";
const basePath = githubPages ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  output: githubPages ? "export" : undefined,
  basePath,
  assetPrefix: basePath || undefined,
  images: {
    unoptimized: githubPages,
  },
  trailingSlash: githubPages,
};

export default nextConfig;
