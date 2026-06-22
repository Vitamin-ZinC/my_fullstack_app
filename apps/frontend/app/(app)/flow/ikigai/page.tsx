"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, getAnalysisDraft } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

const emptyIkigaiAnswers = {
  love: [],
  good_at: [],
  world_needs: [],
  paid_for: []
};

export default function IkigaiPage() {
  const router = useRouter();
  const text = useSiteText();
  const [error, setError] = useState("");

  useEffect(() => {
    const draft = getAnalysisDraft();
    if (!draft) {
      router.replace("/flow/face");
      return;
    }

    window.sessionStorage.setItem("levelup_ikigai_answers", JSON.stringify(emptyIkigaiAnswers));
    api.confirmAnalysis(draft.analysisId, emptyIkigaiAnswers)
      .then(() => router.replace("/flow/analysis"))
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : text.flow.ikigai.launchError);
      });
  }, [router, text.flow.ikigai.launchError]);

  return (
    <div className="flow-inner" data-testid="ikigai-redirect-page">
      <div className="ub very-muted analysis-kicker">{text.flow.analysis.eyebrow}</div>
      <h1 className="ub flow-title">Запускаем анализ</h1>
      <p className="muted flow-copy">Собираем голос и фото в единый отчет.</p>
      {error && <div className="card error-card">{error}</div>}
    </div>
  );
}
