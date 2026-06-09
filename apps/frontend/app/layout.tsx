import type { Metadata } from "next";
import "./globals.css";
import { BRAND_NAME } from "@/lib/messages";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: "AI диагностика Икигай по голосу, лицу и карьерным сигналам"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
