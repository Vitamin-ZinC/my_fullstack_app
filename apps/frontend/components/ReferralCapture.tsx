"use client";
import { uiText, getFormatLocale, useUiLocale } from "@/lib/locale";


import { useEffect } from "react";
import { captureReferralFromUrl } from "@/lib/api";

export function ReferralCapture() {
  useUiLocale();
  useEffect(() => {
    captureReferralFromUrl();
  }, []);

  return null;
}
