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

    const raw = await response.text();
    const payload = raw ? JSON.parse(raw) as ResendEmailResponse : {};
    if (!response.ok) {
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
