"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MeReportSummary, MeResponse } from "@levelup/contracts";
import { api } from "@/lib/api";

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [reports, setReports] = useState<MeReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.me(), api.myReports()])
      .then(([nextMe, nextReports]) => {
        setMe(nextMe);
        setReports(nextReports);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Нужно войти в аккаунт"))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await api.logout();
    router.push("/login");
  }

  if (loading) {
    return (
      <article className="stack">
        <div className="card">
          <div className="eyebrow">Аккаунт</div>
          <h1 className="ub flow-title">Загружаем кабинет...</h1>
        </div>
      </article>
    );
  }

  if (error || !me) {
    return (
      <article className="stack">
        <div className="card error-card">
          <div className="eyebrow">Аккаунт</div>
          <h1 className="ub flow-title">Войдите, чтобы открыть кабинет</h1>
          <p className="flow-copy">{error || "Сессия не найдена"}</p>
        </div>
        <Link className="button" href="/login">Войти или создать аккаунт</Link>
      </article>
    );
  }

  return (
    <article className="account-page stack" data-testid="account-page">
      <section className="account-hero card cyan-border">
        <div>
          <div className="eyebrow">Личный кабинет</div>
          <h1 className="ub account-title">{me.user.name || me.user.email}</h1>
          <p className="muted account-copy">{me.user.email}</p>
        </div>
        <button className="btn-back" type="button" onClick={logout}>Выйти</button>
      </section>

      <section className="account-metrics">
        <div className="account-metric card">
          <span>Отчётов</span>
          <strong>{me.reportCount}</strong>
        </div>
        <div className="account-metric card">
          <span>Последний вход</span>
          <strong>{formatDate(me.user.lastLoginAt)}</strong>
        </div>
      </section>

      <section className="card green-border account-navigator">
        <div>
          <h2 className="ub">Навигатор привычек</h2>
          <p className="muted">Переводит выводы диагностики в ежедневные действия, отметки состояния и персональные рекомендации Пингви.</p>
        </div>
        <Link className="button" href="/habits?from=account">Открыть навигатор</Link>
      </section>

      <section className="stack">
        <div className="row">
          <h2 className="ub section-title">История диагностик</h2>
          <Link className="btn-back" href="/flow/voice">Новая диагностика</Link>
        </div>

        {reports.length === 0 ? (
          <div className="card">
            <p className="muted">Здесь появятся все ваши отчёты после прохождения диагностики.</p>
          </div>
        ) : (
          reports.map((report) => (
            <article className="report-history-card card" key={report.id}>
              <div>
                <div className="report-date">{formatDate(report.completedAt || report.createdAt)}</div>
                <h3>{report.profession || "Диагностика ORKEN.LIFE"}</h3>
                <p>{report.summary || "Отчёт формируется или ожидает завершения анализа."}</p>
              </div>
              <div className="report-history-actions">
                <Link className="button secondary" href={`/report/${report.id}/free`}>Бесплатный</Link>
                {report.fullReportAvailable ? (
                  <Link className="button" href={`/report/${report.id}/full`}>Полный отчёт</Link>
                ) : (
                  <Link className="button" href={`/pay/${report.id}`}>Открыть PRO</Link>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </article>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}
