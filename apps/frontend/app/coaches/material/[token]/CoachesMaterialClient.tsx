"use client";
import { uiText, getFormatLocale, useUiLocale } from "@/lib/locale";


import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, FileLock2, LoaderCircle, Printer, ShieldAlert } from "lucide-react";
import type { CoachPartnershipMaterial } from "@levelup/contracts";
import { coachPartnershipApi } from "@/lib/api";
import styles from "../../coaches.module.css";

export function CoachesMaterialClient({ token }: { token: string }) {
  useUiLocale();
  const [material, setMaterial] = useState<CoachPartnershipMaterial | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    coachPartnershipApi.material(token)
      .then((value) => { if (active) setMaterial(value); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : uiText("Материал недоступен")); });
    return () => { active = false; };
  }, [token]);

  if (error) {
    return <main className={`${styles.page} ${styles.materialPage}`}>
      <div className={`${styles.materialShell} ${styles.materialError}`}>
        <ShieldAlert size={42} />
        <h1>{uiText("Ссылка недоступна")}</h1>
        <p>{error}</p>
        <a className={styles.secondaryButton} href="mailto:orken.eco@gmail.com">{uiText("Связаться с ORKEN")}</a>
      </div>
    </main>;
  }

  if (!material) {
    return <main className={`${styles.page} ${styles.materialPage}`}>
      <div className={`${styles.materialShell} ${styles.materialError}`}><LoaderCircle className="spin" /><p>{uiText("Проверяем доступ к материалу...")}</p></div>
    </main>;
  }

  return <main className={`${styles.page} ${styles.materialPage}`}>
    <div className={styles.materialShell}>
      <header className={styles.materialHeader}>
        <Link className={styles.brand} href="/coaches"><span className={styles.brandMark}><FileLock2 size={19} /></span><span><strong>ORKEN.LIFE</strong><small>{uiText("Закрытый материал")}</small></span></Link>
        <button className={styles.secondaryButton} type="button" onClick={() => window.print()}><Printer size={17} /> {uiText(" Сохранить в PDF")}</button>
      </header>
      <article className={styles.materialDocument}>
        <p className={styles.materialBadge}><FileLock2 size={16} /> {uiText(" Только для кандидата в партнёры")}</p>
        <h1>{uiText(material.title)}</h1>
        <p className={styles.materialIntro}>{uiText(material.intro)}</p>
        <div className={styles.materialMeta}><span>{uiText("Версия: ")}{material.version}</span><span>{uiText("Доступ до: ")}{formatDate(material.expiresAt)}</span></div>

        <section className={styles.materialSection}>
          <h2>{uiText("Партнёрская стоимость продуктов")}</h2>
          <p>{uiText("Вы самостоятельно определяете стоимость своей программы. В таблице указана текущая базовая сетка ORKEN.")}</p>
          <table className={styles.termsTable}><thead><tr><th>{uiText("Продукт")}</th><th>{uiText("Розница")}</th><th>{uiText("Для партнёра")}</th></tr></thead><tbody>{material.wholesale.map((row) => <tr key={uiText(row.product)}><td>{uiText(row.product)}</td><td>{row.retail}</td><td>{uiText(row.partnerPrice)}</td></tr>)}</tbody></table>
        </section>

        <section className={styles.materialSection}>
          <h2>{uiText("Реферальная программа")}</h2>
          <div className={styles.termsGrid}><div className={styles.termBox}><strong>{material.referral.rate}</strong><span>{uiText(material.referral.basis)}</span></div><div className={styles.termBox}><strong>{uiText("Период")}</strong><span>{uiText(material.referral.duration)}</span></div></div>
          <p>{uiText(material.referral.payoutRule)}</p>
        </section>

        <section className={styles.materialSection}>
          <h2>{uiText("Личное сопровождение")}</h2>
          <div className={styles.termsGrid}><div className={styles.termBox}><strong>{material.personal.rate}</strong><span>{uiText("Доля коуча в персональном тарифе за фактическое сопровождение клиента.")}</span></div><div className={styles.termBox}><strong>{uiText("Лимит")}</strong><span>{uiText(material.personal.standardSlotLimit)}</span></div></div>
          <p>{uiText(material.personal.workloadRule)}</p>
        </section>

        <MaterialList title={uiText("Правила видимости в витрине")} items={material.visibilityRules} />
        <MaterialList title={uiText("Этапы подключения")} items={material.onboardingSteps} />
        <MaterialList title={uiText("Правовые и финансовые оговорки")} items={material.legalNotes} />

        <div className={styles.materialActions}><Link className={styles.primaryButton} href={material.partnerPortalUrl}>{uiText("Перейти в кабинет партнёра")}</Link><a className={styles.secondaryButton} href={`mailto:${material.supportEmail}`}>{uiText("Задать вопрос")}</a></div>
      </article>
    </div>
  </main>;
}

function MaterialList({ title, items }: { title: string; items: string[] }) {
  useUiLocale();
  return <section className={styles.materialSection}><h2>{title}</h2><ul className={styles.materialList}>{items.map((item) => <li key={item}><Check /> <span>{uiText(item)}</span></li>)}</ul></section>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(getFormatLocale(), { dateStyle: "long" }).format(new Date(value));
}
