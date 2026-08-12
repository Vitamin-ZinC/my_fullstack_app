"use client";

import { useEffect } from "react";
import { captureReferralFromUrl } from "@/lib/api";

export function ReferralCapture() {
  useEffect(() => {
    captureReferralFromUrl();
  }, []);

  return null;
}
