import type { Metadata } from "next";
import "./globals.css";

const title = "BlogPad — 手机 Blogger 写作器";
const description = "为 iPhone 设计的大字、轻松、专注的 Blogger 写作与发布工具。";

export const metadata: Metadata = {
  metadataBase: new URL("https://nononon2015.github.io/blogpad/"),
  title,
  description,
  openGraph: { title, description, type: "website", images: [{ url: "https://nononon2015.github.io/blogpad/og.png", width: 1734, height: 907 }] },
  twitter: { card: "summary_large_image", title, description, images: ["https://nononon2015.github.io/blogpad/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
