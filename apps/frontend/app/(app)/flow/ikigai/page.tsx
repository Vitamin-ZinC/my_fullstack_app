"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IkigaiPremiumMap } from "@/components/IkigaiPremiumMap";
import { api, getAnalysisDraft } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

export default function IkigaiPage() {
  const siteText = useSiteText();
  const text = siteText.flow.ikigai;
  const faceText = siteText.flow.face;
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    const draft = getAnalysisDraft();
    if (!draft) {
      setError(faceText.noVoice);
      return;
    }

    const ikigaiAnswers = {
      love: split(answers.love),
      good_at: split(answers.good_at),
      world_needs: split(answers.world_needs),
      paid_for: split(answers.paid_for)
    };

    try {
      setBusy(true);
      window.sessionStorage.setItem("levelup_ikigai_answers", JSON.stringify(ikigaiAnswers));
      await api.confirmAnalysis(draft.analysisId, ikigaiAnswers);
      router.push("/flow/analysis");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.launchError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flow-inner" data-testid="ikigai-page">
      <div className="stepbar">
        <div className="step-done" />
        <div className="step-done" />
        <div className="step-done" />
        <span>{text.step}</span>
      </div>

      <h1 className="ub flow-title">{text.title}</h1>
      <p className="muted flow-copy">{text.copy}</p>

      <div className="card cyan-border ikigai-flow-card">
        <IkigaiPremiumMap />
        <div className="ikigai-factor-list">
          {siteText.landing.modelFactors.map((factor) => <div key={factor}>{factor}</div>)}
        </div>
      </div>

      <div className="ikigai-question-grid">
        {text.questions.map(([id, label]) => (
          <label className="card ikigai-question" key={id}>
            <div className="eyebrow">{label}</div>
            <input
              className="input"
              data-testid={`ikigai-${id}`}
              value={answers[id] ?? ""}
              onChange={(event) => setAnswers({ ...answers, [id]: event.target.value })}
              placeholder={text.placeholder}
            />
          </label>
        ))}
      </div>

      {error && <div className="card error-card">{error}</div>}
      <button className="button" data-testid="ikigai-submit-button" onClick={submit} disabled={busy}>{busy ? text.busy : text.submit}</button>
    </div>
  );
}

function split(value = "") {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
