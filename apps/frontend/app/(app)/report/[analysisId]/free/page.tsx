import Link from "next/link";
import { IkigaiPremiumMap } from "@/components/IkigaiPremiumMap";

export default function FreeReportPage({ params }: { params: { analysisId: string } }) {
  return (
    <article className="stack">
      <div>
        <div className="eyebrow">Free report</div>
        <h1>Ваша базовая роль: Продуктовый стратег</h1>
        <p className="muted">Открыта только зона профессии. Полный отчёт показывает 5 ролей, психотип, риски и дорожную карту.</p>
      </div>
      <IkigaiPremiumMap />
      <div className="grid grid-2">
        <div className="card"><h3>Free</h3><p className="muted">1 роль, короткое резюме, подсветка зоны профессии.</p></div>
        <div className="card"><h3>Premium</h3><p className="muted">5 ролей, анализ голоса и лица, психотип, roadmap развития.</p></div>
      </div>
      <Link className="button" href={`/pay/${params.analysisId}`}>Открыть PRO-отчёт</Link>
    </article>
  );
}
