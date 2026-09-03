import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "BlogPad — 手机 Blogger 写作器";
const description = "为 iPhone 设计的大字、轻松、专注的 Blogger 写作与发布工具。";

export const metadata: Metadata = {
  metadataBase: new URL("https://nononon2015.github.io/blogpad/"),
  title,
  description,
  applicationName: "BlogPad",
  manifest: "/blogpad/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/blogpad/favicon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/blogpad/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/blogpad/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "BlogPad",
    statusBarStyle: "default",
  },
  openGraph: { title, description, type: "website", images: [{ url: "https://nononon2015.github.io/blogpad/og.png", width: 1734, height: 907 }] },
  twitter: { card: "summary_large_image", title, description, images: ["https://nononon2015.github.io/blogpad/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#cc4f27",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
