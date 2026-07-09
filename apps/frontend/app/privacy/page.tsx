import type { Metadata } from "next";
import { LegalDocument } from "@/components/LegalDocument";
import { privacyPolicyDocument } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Политика конфиденциальности - ORKEN.LIFE",
  description: "Политика конфиденциальности сервиса ORKEN.LIFE"
};

export default function PrivacyPage() {
  return <LegalDocument document={privacyPolicyDocument} />;
}
