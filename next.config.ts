import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/blogpad",
  assetPrefix: "/blogpad/",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
