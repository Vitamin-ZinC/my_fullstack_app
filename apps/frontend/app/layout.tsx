import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LevelUP.AI Ikigai",
  description: "AI диагностика Икигай по голосу, лицу и карьерным сигналам"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
