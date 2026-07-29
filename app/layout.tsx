import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "邵教练专属会员平台",
    template: "%s｜邵教练专属会员平台",
  },
  description:
    "训练、饮食、打卡、身体数据、课程预约与 Hermes 智能健康助理一体化会员服务平台。",
  applicationName: "邵教练专属会员平台",
  manifest: "/manifest.webmanifest",
  keywords: ["武汉私教", "会员管理", "健身训练", "饮食管理", "Hermes 智能助理"],
  openGraph: {
    title: "邵教练专属会员平台",
    description: "一对一训练与智能健康管理，让每一次进步都有记录。",
    locale: "zh_CN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "邵教练专属会员平台",
    description: "一对一训练与智能健康管理，让每一次进步都有记录。",
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
