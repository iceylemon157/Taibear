import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Taibear — 台北旅遊助手",
  description: "找旅館、規劃行程、即時交通資訊",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={`${geistSans.variable} h-full`}>
      <body className="h-full">
        {children}
      </body>
    </html>
  );
}
