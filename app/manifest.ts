import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BlogPad — 手机 Blogger 写作器",
    short_name: "BlogPad",
    description: "为 iPhone 设计的大字、轻松、专注的 Blogger 写作与发布工具。",
    start_url: "/blogpad/",
    scope: "/blogpad/",
    display: "standalone",
    background_color: "#f3efe6",
    theme_color: "#cc4f27",
    icons: [
      {
        src: "/blogpad/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/blogpad/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
