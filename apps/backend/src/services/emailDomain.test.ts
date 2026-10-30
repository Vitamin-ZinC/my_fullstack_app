import assert from "node:assert/strict";
import test from "node:test";
import type { Resolver } from "node:dns/promises";
import { checkEmailDomain, EmailDomainError } from "./emailDomain.js";
const dnsError = (code: string) => Object.assign(new Error(code), { code });
const resolver = (mx: unknown, a: unknown = [], aaaa: unknown = []) => ({
  resolveMx: async () => { if (mx instanceof Error) throw mx; return mx; },
  resolve4: async () => { if (a instanceof Error) throw a; return a; },
  resolve6: async () => { if (aaaa instanceof Error) throw aaaa; return aaaa; }
}) as unknown as Resolver;
test("mail domain validation supports MX and implicit MX without claiming the mailbox exists", async () => {
  await checkEmailDomain("person@example.com", resolver([{ priority: 10, exchange: "mx.example.com" }]));
  await checkEmailDomain("person@example.com", resolver(dnsError("ENODATA"), ["192.0.2.1"]));
  await checkEmailDomain("person@example.com", resolver([], [], ["2001:db8::1"]));
  await assert.rejects(checkEmailDomain("person@example.com", resolver([{ priority: 0, exchange: "." }])), (error: unknown) => error instanceof EmailDomainError && !error.temporary);
  await assert.rejects(checkEmailDomain("person@localhost", resolver([])), EmailDomainError);
  await assert.rejects(checkEmailDomain("person@example.com", resolver(dnsError("ENOTFOUND"), [], [])), (error: unknown) => error instanceof EmailDomainError && !error.temporary);
  await assert.rejects(checkEmailDomain("person@example.com", resolver(dnsError("ETIMEOUT"))), (error: unknown) => error instanceof EmailDomainError && error.temporary);
});
