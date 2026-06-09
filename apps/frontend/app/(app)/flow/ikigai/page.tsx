"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IkigaiPremiumMap } from "@/components/IkigaiPremiumMap";
import { api, getAnalysisDraft } from "@/lib/api";

const fields = [
  ["love", "Что даёт тебе энергию?"],
  ["good_at", "Что у тебя получается?"],
  ["world_needs", "Что нужно людям и рынку?"],
  ["paid_for", "За что тебе могут платить?"]
] as const;

export default function IkigaiPage() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    const draft = getAnalysisDraft();
    if (!draft) {
      setError("Сначала запиши голос");
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
      setError(reason instanceof Error ? reason.message : "Не удалось запустить анализ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" data-testid="ikigai-page">
      <div>
        <div className="eyebrow">Шаг 3</div>
        <h1 className="ub">Карта Икигай</h1>
        <p className="muted">Ответь коротко: можно перечислять слова через запятую.</p>
      </div>
      <IkigaiPremiumMap />
      <div className="grid grid-2">
        {fields.map(([id, label]) => (
          <label className="card" key={id}>
            <div className="eyebrow">{label}</div>
            <input className="input" data-testid={`ikigai-${id}`} value={answers[id] ?? ""} onChange={(event) => setAnswers({ ...answers, [id]: event.target.value })} placeholder="Через запятую" />
          </label>
        ))}
      </div>
      {error && <div className="card" style={{ borderColor: "var(--danger)" }}>{error}</div>}
      <button className="button" data-testid="ikigai-submit-button" onClick={submit} disabled={busy}>{busy ? "Запуск..." : "Начать AI-анализ"}</button>
    </div>
  );
}

function split(value = "") {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
