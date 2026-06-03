"use client";

import Link from "next/link";
import { useState } from "react";
import { IkigaiPremiumMap } from "@/components/IkigaiPremiumMap";

const fields = [
  ["love", "Что даёт Вам энергию?"],
  ["good_at", "Что у Вас получается?"],
  ["world_needs", "Что нужно рынку?"],
  ["paid_for", "За что Вам могут платить?"]
] as const;

export default function IkigaiPage() {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  function save() {
    window.sessionStorage.setItem("levelup_ikigai_answers", JSON.stringify({
      love: split(answers.love),
      good_at: split(answers.good_at),
      world_needs: split(answers.world_needs),
      paid_for: split(answers.paid_for)
    }));
  }

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Шаг 3</div>
        <h1>Карта Икигай</h1>
      </div>
      <IkigaiPremiumMap />
      <div className="grid grid-2">
        {fields.map(([id, label]) => (
          <label className="card" key={id}>
            <div className="eyebrow">{label}</div>
            <input className="input" value={answers[id] ?? ""} onChange={(event) => setAnswers({ ...answers, [id]: event.target.value })} placeholder="Через запятую" />
          </label>
        ))}
      </div>
      <Link className="button" href="/flow/analysis" onClick={save}>Начать анализ</Link>
    </div>
  );
}

function split(value = "") {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
