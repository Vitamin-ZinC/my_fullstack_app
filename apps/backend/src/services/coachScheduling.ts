import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { decryptCoachIntegrationToken, encryptCoachIntegrationToken } from "./coachPlatform.js";

const DAY_MS = 86_400_000;
const BOOKING_STATUSES = ["SYNC_PENDING", "CONFIRMED", "SYNC_ERROR"] as const;

export const DEFAULT_COACH_AVAILABILITY = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 18 * 60,
  active: true
}));

type BusyInterval = { startsAt: Date; endsAt: Date };
type AvailabilityRule = { weekday: number; startMinute: number; endMinute: number; active: boolean };
type AvailabilityException = { date: Date; isAvailable: boolean; startMinute: number | null; endMinute: number | null };

export async function ensureCoachScheduleSettings(coachProfileId: string) {
  const existing = await prisma.coachScheduleSettings.findUnique({
    where: { coachProfileId },
    include: { availabilityRules: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }, availabilityExceptions: { orderBy: { date: "asc" } } }
  });
  if (existing) return existing;
  try {
    return await prisma.coachScheduleSettings.create({
      data: { coachProfileId, availabilityRules: { create: DEFAULT_COACH_AVAILABILITY } },
      include: { availabilityRules: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }, availabilityExceptions: { orderBy: { date: "asc" } } }
    });
  } catch (error) {
    if ((error as { code?: string })?.code !== "P2002") throw error;
    return prisma.coachScheduleSettings.findUniqueOrThrow({
      where: { coachProfileId },
      include: { availabilityRules: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }, availabilityExceptions: { orderBy: { date: "asc" } } }
    });
  }
}

export function serializeCoachSchedule(settings: any, connections?: { google?: any; calendly?: any }) {
  return {
    provider: settings.provider,
    timezone: settings.timezone,
    slotDurationMinutes: settings.slotDurationMinutes,
    bufferBeforeMinutes: settings.bufferBeforeMinutes,
    bufferAfterMinutes: settings.bufferAfterMinutes,
    minNoticeMinutes: settings.minNoticeMinutes,
    bookingHorizonDays: settings.bookingHorizonDays,
    active: settings.active,
    availabilityRules: (settings.availabilityRules ?? []).map((rule: any) => ({ id: rule.id, weekday: rule.weekday, startMinute: rule.startMinute, endMinute: rule.endMinute, active: rule.active })),
    availabilityExceptions: (settings.availabilityExceptions ?? []).map((item: any) => ({ id: item.id, date: item.date.toISOString().slice(0, 10), isAvailable: item.isAvailable, startMinute: item.startMinute, endMinute: item.endMinute, note: item.note ?? null })),
    integrations: {
      google: { connected: connections?.google?.status === "ACTIVE", status: connections?.google?.status ?? "DISCONNECTED", calendarName: connections?.google?.calendarName ?? null },
      calendly: { connected: connections?.calendly?.status === "ACTIVE", status: connections?.calendly?.status ?? "DISCONNECTED" }
    }
  };
}

export function generateCoachSlots(input: {
  from: Date;
  to: Date;
  now?: Date;
  timezone: string;
  durationMinutes: number;
  minNoticeMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  busy: BusyInterval[];
}) {
  assertTimeZone(input.timezone);
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() + input.minNoticeMinutes * 60_000);
  const exceptionMap = new Map<string, AvailabilityException[]>();
  for (const item of input.exceptions) {
    const key = item.date.toISOString().slice(0, 10);
    exceptionMap.set(key, [...(exceptionMap.get(key) ?? []), item]);
  }
  const slots: Array<{ startsAt: string; endsAt: string }> = [];
  let dateKey = dateKeyInZone(input.from, input.timezone);
  const lastDateKey = dateKeyInZone(input.to, input.timezone);
  for (let guard = 0; guard < 370 && dateKey <= lastDateKey; guard += 1) {
    const exceptions = exceptionMap.get(dateKey) ?? [];
    const closed = exceptions.some((item) => !item.isAvailable);
    const windows = closed
      ? []
      : exceptions.some((item) => item.isAvailable)
        ? exceptions.filter((item) => item.isAvailable && item.startMinute != null && item.endMinute != null).map((item) => ({ startMinute: item.startMinute!, endMinute: item.endMinute! }))
        : input.rules.filter((rule) => rule.active && rule.weekday === weekday(dateKey)).map((rule) => ({ startMinute: rule.startMinute, endMinute: rule.endMinute }));
    for (const window of windows) {
      for (let minute = window.startMinute; minute + input.durationMinutes <= window.endMinute; minute += input.durationMinutes) {
        const startsAt = zonedDateTimeToUtc(dateKey, minute, input.timezone);
        const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
        if (startsAt < input.from || endsAt > input.to || startsAt < cutoff) continue;
        const blockedFrom = new Date(startsAt.getTime() - input.bufferBeforeMinutes * 60_000);
        const blockedTo = new Date(endsAt.getTime() + input.bufferAfterMinutes * 60_000);
        if (input.busy.some((busy) => {
          const busyFrom = new Date(busy.startsAt.getTime() - input.bufferBeforeMinutes * 60_000);
          const busyTo = new Date(busy.endsAt.getTime() + input.bufferAfterMinutes * 60_000);
          return blockedFrom < busyTo && blockedTo > busyFrom;
        })) continue;
        slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
      }
    }
    dateKey = addDateKeyDays(dateKey, 1);
  }
  return slots;
}

export async function availabilityForCoachOrder(input: { orderId: string; userId: string; from?: Date; to?: Date }) {
  const order = await prisma.coachServiceOrder.findFirst({
    where: { id: input.orderId, userId: input.userId, status: "AWAITING_BOOKING" },
    include: { offer: { include: { coachProfile: { include: { calendlyConnection: true, googleCalendarConnection: true } } } } }
  });
  if (!order) throw new Error("Заказ не найден или уже записан");
  if (order.bookingDeadline && order.bookingDeadline <= new Date()) throw new Error("Срок записи истёк");
  const settings = await ensureCoachScheduleSettings(order.offer.coachProfileId);
  if (!settings.active) throw new Error("Запись у коуча временно закрыта");
  if (settings.provider === "CALENDLY") {
    if (order.offer.coachProfile.calendlyConnection?.status !== "ACTIVE" || !order.offer.calendlySchedulingUrl) throw new Error("Calendly коуча не подключён");
    const url = new URL(order.offer.calendlySchedulingUrl);
    url.searchParams.set("utm_source", "orken");
    url.searchParams.set("utm_campaign", "coach-consultation");
    url.searchParams.set("utm_content", order.id);
    return { provider: "CALENDLY" as const, timezone: settings.timezone, slots: [], externalUrl: url.toString(), bookingDeadline: order.bookingDeadline?.toISOString() ?? null };
  }
  const now = new Date();
  const from = input.from && input.from > now ? input.from : now;
  const horizon = new Date(now.getTime() + settings.bookingHorizonDays * DAY_MS);
  const deadline = order.bookingDeadline && order.bookingDeadline < horizon ? order.bookingDeadline : horizon;
  const to = input.to && input.to < deadline ? input.to : deadline;
  if (to <= from) return { provider: settings.provider, timezone: settings.timezone, slots: [], externalUrl: null, bookingDeadline: order.bookingDeadline?.toISOString() ?? null };
  const localBusy = await prisma.coachAppointment.findMany({
    where: { coachProfileId: order.offer.coachProfileId, status: { in: [...BOOKING_STATUSES] }, startsAt: { lt: to }, endsAt: { gt: from } },
    select: { startsAt: true, endsAt: true }
  });
  const externalBusy = settings.provider === "GOOGLE"
    ? await googleBusyIntervals(order.offer.coachProfile.googleCalendarConnection, from, to)
    : [];
  const slots = generateCoachSlots({
    from,
    to,
    timezone: settings.timezone,
    durationMinutes: settings.slotDurationMinutes,
    minNoticeMinutes: settings.minNoticeMinutes,
    bufferBeforeMinutes: settings.bufferBeforeMinutes,
    bufferAfterMinutes: settings.bufferAfterMinutes,
    rules: settings.availabilityRules,
    exceptions: settings.availabilityExceptions,
    busy: [...localBusy, ...externalBusy]
  });
  return { provider: settings.provider, timezone: settings.timezone, slots, externalUrl: null, bookingDeadline: order.bookingDeadline?.toISOString() ?? null };
}

export async function bookCoachOrder(input: { orderId: string; userId: string; startsAt: Date }) {
  const availability = await availabilityForCoachOrder({ orderId: input.orderId, userId: input.userId });
  if (availability.provider === "CALENDLY") throw new Error("Для этой консультации используется Calendly");
  const selected = availability.slots.find((slot) => slot.startsAt === input.startsAt.toISOString());
  if (!selected) throw new Error("Это время уже недоступно. Выберите другой слот");
  const order = await prisma.coachServiceOrder.findFirstOrThrow({
    where: { id: input.orderId, userId: input.userId },
    include: { user: { select: { email: true, name: true } }, offer: { include: { coachProfile: { include: { googleCalendarConnection: true } } } } }
  });
  const settings = await ensureCoachScheduleSettings(order.offer.coachProfileId);
  const endsAt = new Date(input.startsAt.getTime() + settings.slotDurationMinutes * 60_000);
  let appointment;
  try {
    appointment = await prisma.$transaction(async (tx) => {
      const fresh = await tx.coachServiceOrder.findFirst({ where: { id: order.id, userId: input.userId, status: "AWAITING_BOOKING", OR: [{ bookingDeadline: null }, { bookingDeadline: { gt: new Date() } }] } });
      if (!fresh) throw new Error("ORDER_NOT_BOOKABLE");
      const bufferGap = (settings.bufferBeforeMinutes + settings.bufferAfterMinutes) * 60_000;
      const conflict = await tx.coachAppointment.findFirst({
        where: { coachProfileId: order.offer.coachProfileId, status: { in: [...BOOKING_STATUSES] }, startsAt: { lt: new Date(endsAt.getTime() + bufferGap) }, endsAt: { gt: new Date(input.startsAt.getTime() - bufferGap) } }
      });
      if (conflict) throw new Error("SLOT_TAKEN");
      const created = await tx.coachAppointment.create({
        data: { orderId: order.id, coachProfileId: order.offer.coachProfileId, userId: input.userId, startsAt: input.startsAt, endsAt, timezone: settings.timezone, provider: settings.provider, status: settings.provider === "GOOGLE" ? "SYNC_PENDING" : "CONFIRMED" }
      });
      await tx.coachServiceOrder.update({ where: { id: order.id }, data: { status: "BOOKED", scheduledFor: input.startsAt, bookedAt: new Date() } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Error && ["ORDER_NOT_BOOKABLE", "SLOT_TAKEN"].includes(error.message)) throw new Error("Это время уже недоступно. Выберите другой слот");
    if ((error as { code?: string })?.code === "P2034") throw new Error("Это время только что заняли. Выберите другой слот");
    throw error;
  }
  if (settings.provider === "GOOGLE") {
    try {
      const synced = await createGoogleCalendarEvent({
        connection: order.offer.coachProfile.googleCalendarConnection,
        appointmentId: appointment.id,
        idempotencyId: order.id,
        title: order.offer.title,
        description: `Консультация ORKEN с ${order.offer.coachProfile.displayName}`,
        startsAt: input.startsAt,
        endsAt,
        timezone: settings.timezone,
        attendeeEmail: order.user.email,
        attendeeName: order.user.name
      });
      appointment = await prisma.coachAppointment.update({ where: { id: appointment.id }, data: { status: "CONFIRMED", externalEventId: synced.id, externalEventUrl: synced.htmlLink, meetingUrl: synced.meetingUrl, syncError: null } });
    } catch (error) {
      await prisma.$transaction([
        prisma.coachAppointment.delete({ where: { id: appointment.id } }),
        prisma.coachServiceOrder.update({ where: { id: order.id }, data: { status: "AWAITING_BOOKING", scheduledFor: null, bookedAt: null } })
      ]);
      throw new Error("Не удалось добавить встречу в Google Calendar. Попробуйте ещё раз");
    }
  }
  return serializeCoachAppointment(appointment);
}

export function serializeCoachAppointment(item: any) {
  return {
    id: item.id,
    orderId: item.orderId,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt.toISOString(),
    timezone: item.timezone,
    provider: item.provider,
    status: item.status,
    externalEventUrl: item.externalEventUrl ?? null,
    meetingUrl: item.meetingUrl ?? null,
    client: item.user ? { name: item.user.name ?? null, email: item.user.email } : undefined,
    serviceTitle: item.order?.offer?.title ?? undefined
  };
}

export async function activeGoogleAccessToken(connection: any) {
  if (!connection || connection.status !== "ACTIVE") throw new Error("Google Calendar не подключён");
  if (!connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() > Date.now() + 60_000) return decryptCoachIntegrationToken(connection.accessTokenCiphertext);
  if (!connection.refreshTokenCiphertext || !env.GOOGLE_CALENDAR_CLIENT_ID || !env.GOOGLE_CALENDAR_CLIENT_SECRET) {
    await prisma.coachGoogleCalendarConnection.update({ where: { id: connection.id }, data: { status: "ERROR" } });
    throw new Error("Google Calendar требует повторного подключения");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: decryptCoachIntegrationToken(connection.refreshTokenCiphertext), client_id: env.GOOGLE_CALENDAR_CLIENT_ID, client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET })
  });
  if (!response.ok) {
    await prisma.coachGoogleCalendarConnection.update({ where: { id: connection.id }, data: { status: "ERROR" } });
    throw new Error("Не удалось обновить доступ к Google Calendar");
  }
  const token = await response.json() as any;
  await prisma.coachGoogleCalendarConnection.update({ where: { id: connection.id }, data: { accessTokenCiphertext: encryptCoachIntegrationToken(token.access_token), tokenExpiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null, status: "ACTIVE", lastSyncedAt: new Date() } });
  return String(token.access_token);
}

export async function cancelGoogleCalendarEvent(connection: any, externalEventId: string) {
  const token = await activeGoogleAccessToken(connection);
  const calendarId = connection.calendarId || "primary";
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}?sendUpdates=all`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Google event cancel failed: ${response.status}`);
}

async function googleBusyIntervals(connection: any, from: Date, to: Date) {
  if (!connection || connection.status !== "ACTIVE") throw new Error("Google Calendar не подключён");
  const token = await activeGoogleAccessToken(connection);
  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: connection.calendarId || "primary" }] })
  });
  if (!response.ok) throw new Error("Не удалось проверить занятость Google Calendar");
  const data = await response.json() as any;
  return (data.calendars?.[connection.calendarId || "primary"]?.busy ?? []).map((item: any) => ({ startsAt: new Date(item.start), endsAt: new Date(item.end) }));
}

async function createGoogleCalendarEvent(input: { connection: any; appointmentId: string; idempotencyId: string; title: string; description: string; startsAt: Date; endsAt: Date; timezone: string; attendeeEmail: string; attendeeName: string | null }) {
  const token = await activeGoogleAccessToken(input.connection);
  const calendarId = input.connection.calendarId || "primary";
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;
  const eventId = createHash("sha256").update(`orken:${input.idempotencyId}`).digest("hex").slice(0, 52);
  const basePayload = {
    id: eventId,
    summary: input.title,
    description: input.description,
    start: { dateTime: input.startsAt.toISOString(), timeZone: input.timezone },
    end: { dateTime: input.endsAt.toISOString(), timeZone: input.timezone },
    attendees: [{ email: input.attendeeEmail, displayName: input.attendeeName ?? undefined }],
    extendedProperties: { private: { orkenAppointmentId: input.appointmentId } }
  };
  const create = (payload: object) => fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  let response = await create({ ...basePayload, conferenceData: { createRequest: { requestId: `orken-${input.appointmentId}-${randomUUID().slice(0, 8)}`, conferenceSolutionKey: { type: "hangoutsMeet" } } } });
  if (!response.ok && [400, 403].includes(response.status)) response = await create(basePayload);
  if (response.status === 409) response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Google event create failed: ${response.status}`);
  const event = await response.json() as any;
  return { id: String(event.id), htmlLink: event.htmlLink ? String(event.htmlLink) : null, meetingUrl: event.hangoutLink ?? event.conferenceData?.entryPoints?.find((item: any) => item.entryPointType === "video")?.uri ?? null };
}

export function assertTimeZone(value: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); }
  catch { throw new Error("Некорректный часовой пояс"); }
}

function weekday(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function dateKeyInZone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDateKeyDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function zonedDateTimeToUtc(dateKey: string, minute: number, timezone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const hour = Math.floor(minute / 60);
  const minutePart = minute % 60;
  const target = Date.UTC(year, month - 1, day, hour, minutePart, 0);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  for (let index = 0; index < 3; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const next = target - (represented - guess);
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}
