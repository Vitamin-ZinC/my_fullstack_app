import { Resolver } from "node:dns/promises";
import { domainToASCII } from "node:url";

export class EmailDomainError extends Error {
  constructor(readonly temporary: boolean) { super(temporary ? "Не удалось проверить домен почты. Попробуйте позже." : "Домен почты не принимает письма. Проверьте email."); }
}
const absent = (error: unknown) => ["ENODATA", "ENOTFOUND"].includes((error as { code?: string }).code ?? "");
export async function checkEmailDomain(email: string, resolver = new Resolver({ timeout: 2000, tries: 1 })) {
  const domain = domainToASCII(email.slice(email.lastIndexOf("@") + 1)).toLowerCase();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new EmailDomainError(false);
  try {
    const records = await resolver.resolveMx(domain);
    if (records.some(record => record.exchange && record.exchange !== ".")) return;
    if (records.length) throw new EmailDomainError(false); // RFC 7505 null MX.
  } catch (error) {
    if (error instanceof EmailDomainError) throw error;
    if (!absent(error)) throw new EmailDomainError(true);
  }
  // RFC 5321 permits an implicit MX when an address record exists.
  const addresses = await Promise.allSettled([resolver.resolve4(domain), resolver.resolve6(domain)]);
  if (addresses.some(result => result.status === "fulfilled" && result.value.length > 0)) return;
  throw new EmailDomainError(addresses.some(result => result.status === "rejected" && !absent(result.reason)));
}
