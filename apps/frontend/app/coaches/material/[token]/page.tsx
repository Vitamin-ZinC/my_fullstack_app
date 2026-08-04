import type { Metadata } from "next";
import { CoachesMaterialClient } from "./CoachesMaterialClient";

export const metadata: Metadata = {
  title: "Закрытые условия сотрудничества — ORKEN.LIFE",
  robots: { index: false, follow: false, nocache: true }
};

export default async function CoachMaterialPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CoachesMaterialClient token={token} />;
}
