import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "计量学习地图 · Econometrics Atlas",
  description: "基于教材的双语计量经济学学习卡片、练习与私密同步。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
