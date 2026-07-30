import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://120.26.121.247"),
  title: {
    default: "邵教练专属会员平台",
    template: "%s｜邵教练专属会员平台",
  },
  description:
    "武汉一对一私人教练会员平台，提供训练计划、饮食执行、身体趋势与私教预约服务。",
  applicationName: "邵教练专属会员平台",
  manifest: "/manifest.webmanifest",
  keywords: ["武汉私教", "一对一私教", "会员管理", "健身训练", "饮食管理"],
  openGraph: {
    title: "邵教练专属会员平台",
    description: "武汉一对一私人教练服务，让每一次进步都有记录。",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "/og.png", width: 1728, height: 905, alt: "邵教练一对一私教会员平台" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "邵教练专属会员平台",
    description: "武汉一对一私人教练服务，让每一次进步都有记录。",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
