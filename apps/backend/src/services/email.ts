import { createHash } from "node:crypto";
import { env } from "../env.js";

type SendReportEmailInput = {
  analysisId: string;
  email: string;
  freeReportUrl: string;
  paymentUrl: string;
  locale: string;
  profession?: string;
};

type ResendEmailResponse = {
  id?: string;
  message?: string;
  name?: string;
};

export type SendReportEmailResult = {
  emailSent: boolean;
  emailId?: string;
  error?: string;
};

type SendMagicLinkEmailInput = {
  email: string;
  loginUrl: string;
  locale: string;
};

type SendCoachApplicationEmailsInput = {
  applicationId: string;
  email: string;
  fullName: string;
  telegram?: string | null;
  city?: string | null;
  practiceFormat: string;
  experienceYears?: number | null;
  activeClients?: number | null;
  interests: string[];
  message?: string | null;
  materialUrl: string;
  materialExpiresAt: Date;
};

export type SendCoachApplicationEmailsResult = {
  applicantEmailSent: boolean;
  teamNotificationSent: boolean;
};

export async function sendReportEmail(input: SendReportEmailInput): Promise<SendReportEmailResult> {
  if (!env.RESEND_API_KEY) {
    return { emailSent: false, error: "Resend is not configured" };
  }

  const subject = input.locale === "en"
    ? "Your ORKEN.LIFE report is ready"
    : "Ваш отчет ORKEN.LIFE готов";
  const html = buildReportEmailHtml(input);
  const text = buildReportEmailText(input);
  const idempotencyKey = createHash("sha256")
    .update(`report:${input.analysisId}:${input.email.toLowerCase()}`)
    .digest("hex");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [input.email],
        subject,
        html,
        text,
        tags: [
          { name: "source", value: "orken_life" },
          { name: "analysis", value: input.analysisId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 256) }
        ]
      })
    });

    const payload = parseResendPayload(await response.text());
    if (!response.ok) {
      logEmailFailure("report", input.email, response.status, payload.message || payload.name);
      return {
        emailSent: false,
        error: truncateEmailError(payload.message || payload.name || `Resend ${response.status}`)
      };
    }

    return { emailSent: true, emailId: payload.id };
  } catch (error) {
    return {
      emailSent: false,
      error: truncateEmailError(error instanceof Error ? error.message : "Email send failed")
    };
  }
}

export async function sendMagicLinkEmail(input: SendMagicLinkEmailInput): Promise<SendReportEmailResult> {
  if (!env.RESEND_API_KEY) {
    return { emailSent: false, error: "Resend is not configured" };
  }

  const subject = input.locale === "en"
    ? "Sign in to ORKEN.LIFE"
    : "Вход в ORKEN.LIFE";
  const html = buildMagicLinkEmailHtml(input);
  const text = buildMagicLinkEmailText(input);
  const idempotencyKey = createHash("sha256")
    .update(`magic-link:${input.email.toLowerCase()}:${input.loginUrl}`)
    .digest("hex");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [input.email],
        subject,
        html,
        text,
        tags: [
          { name: "source", value: "orken_life" },
          { name: "kind", value: "magic_link" }
        ]
      })
    });

    const payload = parseResendPayload(await response.text());
    if (!response.ok) {
      logEmailFailure("magic_link", input.email, response.status, payload.message || payload.name);
      return {
        emailSent: false,
        error: truncateEmailError(payload.message || payload.name || `Resend ${response.status}`)
      };
    }

    return { emailSent: true, emailId: payload.id };
  } catch (error) {
    return {
      emailSent: false,
      error: truncateEmailError(error instanceof Error ? error.message : "Email send failed")
    };
  }
}

export async function sendCoachApplicationEmails(
  input: SendCoachApplicationEmailsInput
): Promise<SendCoachApplicationEmailsResult> {
  if (!env.RESEND_API_KEY) {
    return { applicantEmailSent: false, teamNotificationSent: false };
  }

  const expiresLabel = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "Europe/Moscow" })
    .format(input.materialExpiresAt);
  const applicant = await sendTransactionalEmail({
    to: input.email,
    subject: "Условия сотрудничества с ORKEN.LIFE",
    html: buildCoachApplicantEmailHtml(input, expiresLabel),
    text: buildCoachApplicantEmailText(input, expiresLabel),
    idempotencyKey: `coach-application:applicant:${input.applicationId}`,
    kind: "coach_application_applicant"
  });
  const team = await sendTransactionalEmail({
    to: env.COACH_APPLICATION_NOTIFY_EMAIL,
    subject: `Новая заявка коуча: ${input.fullName}`,
    html: buildCoachTeamEmailHtml(input),
    text: buildCoachTeamEmailText(input),
    idempotencyKey: `coach-application:team:${input.applicationId}`,
    kind: "coach_application_team"
  });
  return {
    applicantEmailSent: applicant.emailSent,
    teamNotificationSent: team.emailSent
  };
}

async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  kind: string;
}): Promise<SendReportEmailResult> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": createHash("sha256").update(input.idempotencyKey).digest("hex")
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        tags: [
          { name: "source", value: "orken_life" },
          { name: "kind", value: input.kind }
        ]
      })
    });
    const payload = parseResendPayload(await response.text());
    if (!response.ok) {
      logEmailFailure(input.kind, input.to, response.status, payload.message || payload.name);
      return { emailSent: false, error: truncateEmailError(payload.message || payload.name || `Resend ${response.status}`) };
    }
    return { emailSent: true, emailId: payload.id };
  } catch (error) {
    return {
      emailSent: false,
      error: truncateEmailError(error instanceof Error ? error.message : "Email send failed")
    };
  }
}

function buildCoachApplicantEmailHtml(input: SendCoachApplicationEmailsInput, expiresLabel: string) {
  return `<!doctype html>
<html><body style="margin:0;background:#05070b;color:#f7f7fb;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:36px 20px;">
    <div style="font-size:21px;font-weight:800;color:#00e5ff;letter-spacing:2px;">ORKEN.LIFE</div>
    <h1 style="font-size:28px;line-height:1.2;margin:26px 0 12px;">Спасибо за заявку, ${escapeHtml(input.fullName)}</h1>
    <p style="font-size:16px;line-height:1.65;color:#c9cbd5;">Мы получили данные и подготовили закрытый материал с экономикой программы, правилами витрины и условиями личного сопровождения.</p>
    <p style="margin:28px 0;"><a href="${escapeHtml(input.materialUrl)}" style="display:inline-block;padding:14px 20px;background:#00e5ff;color:#041016;text-decoration:none;font-weight:800;border-radius:8px;">Открыть условия сотрудничества</a></p>
    <p style="font-size:13px;line-height:1.55;color:#8e919d;">Ссылка действует до ${escapeHtml(expiresLabel)}. Не публикуйте её: материал содержит закрытые коммерческие условия.</p>
    <p style="font-size:13px;line-height:1.55;color:#8e919d;">Команда ORKEN свяжется с вами после рассмотрения заявки.</p>
  </div>
</body></html>`;
}

function buildCoachApplicantEmailText(input: SendCoachApplicationEmailsInput, expiresLabel: string) {
  return [
    "ORKEN.LIFE",
    "",
    `Спасибо за заявку, ${input.fullName}.`,
    "Закрытые условия сотрудничества:",
    input.materialUrl,
    "",
    `Ссылка действует до ${expiresLabel}. Не публикуйте ее.`,
    "Команда ORKEN свяжется с вами после рассмотрения заявки."
  ].join("\n");
}

function buildCoachTeamEmailHtml(input: SendCoachApplicationEmailsInput) {
  const rows = [
    ["Имя", input.fullName],
    ["Email", input.email],
    ["Telegram", input.telegram || "Не указан"],
    ["Город", input.city || "Не указан"],
    ["Формат практики", input.practiceFormat],
    ["Опыт", input.experienceYears == null ? "Не указан" : `${input.experienceYears} лет`],
    ["Активные клиенты", input.activeClients == null ? "Не указано" : String(input.activeClients)],
    ["Интересы", input.interests.join(", ")],
    ["Сообщение", input.message || "Нет"]
  ];
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#151822;">
    <div style="max-width:680px;margin:0 auto;padding:28px 18px;">
      <h1 style="font-size:24px;">Новая заявка коуча</h1>
      <table style="width:100%;border-collapse:collapse;">${rows.map(([label, value]) => `<tr><td style="padding:10px;border-bottom:1px solid #e5e7eb;color:#626775;">${escapeHtml(label)}</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;font-weight:600;">${escapeHtml(value)}</td></tr>`).join("")}</table>
      <p style="margin-top:22px;"><a href="${escapeHtml(input.materialUrl)}">Проверить закрытый материал заявки</a></p>
      <p style="color:#626775;font-size:13px;">ID заявки: ${escapeHtml(input.applicationId)}</p>
    </div>
  </body></html>`;
}

function buildCoachTeamEmailText(input: SendCoachApplicationEmailsInput) {
  return [
    "Новая заявка коуча ORKEN.LIFE",
    `ID: ${input.applicationId}`,
    `Имя: ${input.fullName}`,
    `Email: ${input.email}`,
    `Telegram: ${input.telegram || "не указан"}`,
    `Город: ${input.city || "не указан"}`,
    `Формат: ${input.practiceFormat}`,
    `Опыт: ${input.experienceYears ?? "не указан"}`,
    `Активные клиенты: ${input.activeClients ?? "не указано"}`,
    `Интересы: ${input.interests.join(", ")}`,
    `Сообщение: ${input.message || "нет"}`,
    `Материал: ${input.materialUrl}`
  ].join("\n");
}

function buildReportEmailHtml(input: SendReportEmailInput) {
  const profession = input.profession ? escapeHtml(input.profession) : "ORKEN.LIFE";
  const freeUrl = escapeHtml(input.freeReportUrl);
  const paymentUrl = escapeHtml(input.paymentUrl);

  return `<!doctype html>
<html>
  <body style="margin:0;background:#05070b;color:#f7f7fb;font-family:Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <div style="font-size:22px;font-weight:800;letter-spacing:2px;color:#20d4ff;">ORKEN.LIFE</div>
      <h1 style="margin:28px 0 12px;font-size:28px;line-height:1.2;">Ваш отчет готов</h1>
      <p style="font-size:16px;line-height:1.6;color:#c8c8d2;">Мы сохранили результат диагностики. Текущий вектор: <strong style="color:#ffffff;">${profession}</strong>.</p>
      <p style="font-size:16px;line-height:1.6;color:#c8c8d2;">Откройте бесплатный отчет или перейдите к полному отчету, где доступны подробные выводы по голосу, лицу, ролям, рискам и плану развития.</p>
      <p style="margin:28px 0;">
        <a href="${freeUrl}" style="display:inline-block;background:#1fc7ff;color:#05070b;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:10px;">Открыть бесплатный отчет</a>
      </p>
      <p style="margin:16px 0;">
        <a href="${paymentUrl}" style="color:#20d4ff;font-weight:700;">Открыть полный отчет</a>
      </p>
      <p style="margin-top:32px;font-size:12px;line-height:1.5;color:#858895;">Если вы не проходили диагностику ORKEN.LIFE, просто проигнорируйте это письмо.</p>
    </div>
  </body>
</html>`;
}

function buildMagicLinkEmailHtml(input: SendMagicLinkEmailInput) {
  const loginUrl = escapeHtml(input.loginUrl);

  return `<!doctype html>
<html>
  <body style="margin:0;background:#05070b;color:#f7f7fb;font-family:Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <div style="font-size:22px;font-weight:800;letter-spacing:2px;color:#20d4ff;">ORKEN.LIFE</div>
      <h1 style="margin:28px 0 12px;font-size:28px;line-height:1.2;">Вход в личный кабинет</h1>
      <p style="font-size:16px;line-height:1.6;color:#c8c8d2;">Нажмите кнопку ниже, чтобы войти в ORKEN.LIFE. Ссылка действует 20 минут и может быть использована только один раз.</p>
      <p style="margin:28px 0;">
        <a href="${loginUrl}" style="display:inline-block;background:#1fc7ff;color:#05070b;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:10px;">Войти в ORKEN.LIFE</a>
      </p>
      <p style="margin-top:32px;font-size:12px;line-height:1.5;color:#858895;">Если вы не запрашивали вход, просто проигнорируйте это письмо.</p>
    </div>
  </body>
</html>`;
}

function buildMagicLinkEmailText(input: SendMagicLinkEmailInput) {
  return [
    "ORKEN.LIFE",
    "",
    "Вход в личный кабинет.",
    "Ссылка действует 20 минут и может быть использована только один раз.",
    "",
    input.loginUrl,
    "",
    "Если вы не запрашивали вход, просто проигнорируйте это письмо."
  ].join("\n");
}

function buildReportEmailText(input: SendReportEmailInput) {
  return [
    "ORKEN.LIFE",
    "",
    "Ваш отчет готов.",
    input.profession ? `Текущий вектор: ${input.profession}.` : "",
    "",
    `Бесплатный отчет: ${input.freeReportUrl}`,
    `Полный отчет: ${input.paymentUrl}`,
    "",
    "Если вы не проходили диагностику ORKEN.LIFE, просто проигнорируйте это письмо."
  ].filter(Boolean).join("\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function truncateEmailError(value: string) {
  return value.slice(0, 500);
}

function parseResendPayload(raw: string): ResendEmailResponse {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ResendEmailResponse;
  } catch {
    return { message: raw.slice(0, 500) };
  }
}

function logEmailFailure(kind: string, email: string, status: number, error?: string) {
  console.warn("email_send_failed", {
    kind,
    status,
    emailDomain: email.split("@")[1] ?? "unknown",
    error: error ? truncateEmailError(error) : undefined
  });
}
