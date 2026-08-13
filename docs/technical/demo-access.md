# Demo access for coach and client cabinets

## Purpose

`/demo` is an isolated, read-only product demonstration for founders and prospective coaches. It contains synthetic coach and client data and does not create a user, partner, payment, or Partner Core session.

## Admin workflow

1. Open `/admin/coaches`.
2. In **Demo access to cabinets**, enter a label, expiry in days, and a maximum number of sign-ins.
3. Create the code and copy it immediately. The complete code is returned once; the database stores only an HMAC hash and a masked hint.
4. Send the `/demo` link and code to the recipient.
5. Disable the code after the demonstration. Disabling it revokes every active session created from that code.

Each successful redemption creates an eight-hour httpOnly, Secure (in production), SameSite=Lax cookie. Codes can also have an earlier expiry and a lifetime sign-in limit.

## Security boundaries

- Demo routes never call Partner Core, Stripe, coach workspace routes, or user habit routes.
- The browser receives synthetic fixtures only.
- Codes and session tokens are never stored in localStorage or URLs.
- The database stores `codeHash`, `codeHint`, and `tokenHash`, not plaintext credentials.
- Access attempts are rate-limited.
- Demo controls show expected product behavior but do not persist writes.

## API

- `POST /api/demo/access`
- `GET /api/demo/session`
- `GET /api/demo/workspace`
- `POST /api/demo/logout`
- `GET /api/admin/demo-access-codes`
- `POST /api/admin/demo-access-codes`
- `PUT /api/admin/demo-access-codes/:id/active`
