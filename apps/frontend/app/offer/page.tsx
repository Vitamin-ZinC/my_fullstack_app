import type { Metadata } from "next";
import { LegalDocument } from "@/components/LegalDocument";
import { publicOfferDocument } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Публичная оферта - ORKEN.LIFE",
  description: "Публичная оферта и пользовательское соглашение сервиса ORKEN.LIFE"
};

export default function OfferPage() {
  return <LegalDocument document={publicOfferDocument} />;
}
