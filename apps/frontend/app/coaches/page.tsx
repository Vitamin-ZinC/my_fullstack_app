import type { Metadata } from "next";
import { CoachesLandingClient } from "./CoachesLandingClient";

export const metadata: Metadata = {
  title: "ORKEN.LIFE для коучей — партнёрская программа",
  description: "AI-диагностика, трекер состояний, реферальная программа, витрина коучей и White Label для развития коучинговой практики.",
  alternates: { canonical: "/coaches" }
};

export default function CoachesPage() {
  return <CoachesLandingClient />;
}
