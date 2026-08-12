import type { Metadata } from "next";
import { CoachesLandingClient } from "../coaches/CoachesLandingClient";

export const metadata: Metadata = {
  title: "ORKEN.LIFE для коучей",
  description: "Цифровое сопровождение клиентов между коуч-сессиями.",
  alternates: { canonical: "/for-coaches" }
};

export default function ForCoachesPage() {
  return <CoachesLandingClient />;
}
