"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, FileLock2, LoaderCircle, Printer, ShieldAlert } from "lucide-react";
import type { CoachPartnershipMaterial } from "@levelup/contracts";
import { coachPartnershipApi } from "@/lib/api";
import styles from "../../coaches.module.css";

export function CoachesMaterialClient({ token }: { token: string }) {
  const [material, setMaterial] = useState<CoachPartnershipMaterial | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    coachPartnershipApi.material(token)
      .then((value) => { if (active) setMaterial(value); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Материал недоступен"); });
    return () => { active = false; };
  }, [token]);

  if (error) {
    return <main className={`${styles.page} ${styles.materialPage}`}>
      <div className={`${styles.materialShell} ${styles.materialError}`}>
        <ShieldAlert size={42} />
        <h1>Ссылка недоступна</h1>
        <p>{error}</p>
        <a className={styles.secondaryButton} href="mailto:orken.eco@gmail.com">Связаться с ORKEN</a>
      </div>
    </main>;
  }

  if (!material) {
    return <main className={`${styles.page} ${styles.materialPage}`}>
      <div className={`${styles.materialShell} ${styles.materialError}`}><LoaderCircle className="spin" /><p>Проверяем доступ к материалу...</p></div>
    </main>;
  }

  return <main className={`${styles.page} ${styles.materialPage}`}>
    <div className={styles.materialShell}>
      <header className={styles.materialHeader}>
        <Link className={styles.brand} href="/coaches"><span className={styles.brandMark}><FileLock2 size={19} /></span><span><strong>ORKEN.LIFE</strong><small>Закрытый материал</small></span></Link>
        <button className={styles.secondaryButton} type="button" onClick={() => window.print()}><Printer size={17} /> Сохранить в PDF</button>
      </header>
      <article className={styles.materialDocument}>
        <p className={styles.materialBadge}><FileLock2 size={16} /> Только для кандидата в партнёры</p>
        <h1>{material.title}</h1>
        <p className={styles.materialIntro}>{material.intro}</p>
        <div className={styles.materialMeta}><span>Версия: {material.version}</span><span>Доступ до: {formatDate(material.expiresAt)}</span></div>

        <section className={styles.materialSection}>
          <h2>Партнёрская стоимость продуктов</h2>
          <p>Вы самостоятельно определяете стоимость своей программы. В таблице указана текущая базовая сетка ORKEN.</p>
          <table className={styles.termsTable}><thead><tr><th>Продукт</th><th>Розница</th><th>Для партнёра</th></tr></thead><tbody>{material.wholesale.map((row) => <tr key={row.product}><td>{row.product}</td><td>{row.retail}</td><td>{row.partnerPrice}</td></tr>)}</tbody></table>
        </section>

        <section className={styles.materialSection}>
          <h2>Реферальная программа</h2>
          <div className={styles.termsGrid}><div className={styles.termBox}><strong>{material.referral.rate}</strong><span>{material.referral.basis}</span></div><div className={styles.termBox}><strong>Период</strong><span>{material.referral.duration}</span></div></div>
          <p>{material.referral.payoutRule}</p>
        </section>

        <section className={styles.materialSection}>
          <h2>Личное сопровождение</h2>
          <div className={styles.termsGrid}><div className={styles.termBox}><strong>{material.personal.rate}</strong><span>Доля коуча в персональном тарифе за фактическое сопровождение клиента.</span></div><div className={styles.termBox}><strong>Лимит</strong><span>{material.personal.standardSlotLimit}</span></div></div>
          <p>{material.personal.workloadRule}</p>
        </section>

        <MaterialList title="Правила видимости в витрине" items={material.visibilityRules} />
        <MaterialList title="Этапы подключения" items={material.onboardingSteps} />
        <MaterialList title="Правовые и финансовые оговорки" items={material.legalNotes} />

        <div className={styles.materialActions}><Link className={styles.primaryButton} href={material.partnerPortalUrl}>Перейти в кабинет партнёра</Link><a className={styles.secondaryButton} href={`mailto:${material.supportEmail}`}>Задать вопрос</a></div>
      </article>
    </div>
  </main>;
}

function MaterialList({ title, items }: { title: string; items: string[] }) {
  return <section className={styles.materialSection}><h2>{title}</h2><ul className={styles.materialList}>{items.map((item) => <li key={item}><Check /> <span>{item}</span></li>)}</ul></section>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(new Date(value));
}
