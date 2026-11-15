import { validatePhotoBuffer } from "./imageValidation.js";

export function inlineReportPhoto(buffer: Buffer | null) {
  if (!buffer) throw new Error("PHOTO_INPUT_UNAVAILABLE");
  if (buffer.length > 12 * 1024 * 1024) throw new Error("PHOTO_INPUT_TOO_LARGE");
  const validation = validatePhotoBuffer(buffer);
  if (!validation.ok) throw new Error("PHOTO_INPUT_INVALID");
  return `data:image/${validation.format};base64,${buffer.toString("base64")}`;
}

export function assertReportPhotoReady(assets: { type: string; status: string }[]) {
  const photo = assets.find(asset => asset.type === "PHOTO");
  if (photo && photo.status !== "UPLOADED" && photo.status !== "VERIFIED") throw new Error("PHOTO_INPUT_NOT_READY");
}

export function hasMissingPhotoClaim(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const report = value as { face_analysis?: unknown; top_roles?: unknown };
  const face = report.face_analysis && typeof report.face_analysis === "object" ? Object.values(report.face_analysis) : [];
  const roles = Array.isArray(report.top_roles) ? report.top_roles.map(role => role?.faceEvidence) : [];
  return [...face, ...roles].some(text => typeof text === "string" && (
    /(?<!на\s)(?:фото(?:графи[а-яё]*)?|изображени[а-яё]*|снимок)\s+(?:не\s+(?:был[ао]?\s+)?(?:предоставлен[аоы]?|представлен[аоы]?|приложен[аоы]?|загружен[аоы]?|прикрепл[её]н[аоы]?|получен[аоы]?|доступ[а-яё]*)|отсутствует|недоступ[а-яё]*)/iu.test(text)
    || /(?:photo(?:graph)?|image|picture)\s+(?:(?:was|is|has been)\s+)?(?:not\s+(?:provided|attached|uploaded|available|received)|missing|absent|unavailable)/i.test(text)
    || /(?:no\s+(?:photo(?:graph)?|image)\s+(?:was|is|has been)\s+(?:provided|attached|uploaded)|нет\s+(?:фото(?:графии)?|изображения))/iu.test(text)
  ));
}

export function assertPhotoEvidence(value: unknown, photoAttached: boolean) {
  if (photoAttached && hasMissingPhotoClaim(value)) throw new Error("PHOTO_EVIDENCE_CONFLICT: An image is attached. Analyze that still image; do not claim it is absent.");
}

export function redactPhotoPayload(message: string) {
  return message.replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+/gi, "[redacted image]");
}
