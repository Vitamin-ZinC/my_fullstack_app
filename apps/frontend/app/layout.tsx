import type { Metadata } from "next";
import "./globals.css";
import { BRAND_NAME } from "@/lib/messages";
import { ReferralCapture } from "@/components/ReferralCapture";
import { GlobalLanguageSwitcher } from "@/components/LanguageSwitcher";
import { Suspense } from "react";
import { TrafficAnalytics } from "@/components/TrafficAnalytics";

export const metadata: Metadata = {
  title: `Икигай - ${BRAND_NAME}`,
  description: "AI диагностика Икигай по голосу, лицу и карьерным сигналам"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body><GlobalLanguageSwitcher /><ReferralCapture />{children}<Suspense fallback={null}><TrafficAnalytics /></Suspense></body>
    </html>
  );
}
