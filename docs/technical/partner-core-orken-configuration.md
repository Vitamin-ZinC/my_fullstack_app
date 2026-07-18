# Partner Core: настройка Orken

Статус на 2026-07-18: управление партнерами встроено в `/admin`, партнерский кабинет доступен на `/partners`, редактирование офферов, refund/reversal и customer bonus подключены серверно. Браузер работает только с Orken BFF; service key и opaque Partner Core session token не должны попадать во frontend, URL, localStorage, аналитику или публичные логи.

## 1. Деплой Partner Core

Перед деплоем Orken нужно задеплоить текущую версию Partner Core и применить PostgreSQL schema:

```powershell
npm.cmd run build
npm.cmd run db:postgres:migrate:prod
```

В `PARTNER_CORE_SERVICE_KEYS_JSON` Partner Core добавить отдельный principal Orken:

```json
[
  {
    "keyId": "orken-bff-2026q3",
    "secret": "<secret-manager-value>",
    "scopes": ["sessions:write", "partners:read", "partners:write", "events:write"],
    "projectIds": ["orken"],
    "status": "active"
  }
]
```

`secret` должен быть случайным значением минимум 32 байта и храниться в secret manager. Для ротации сначала добавить новый active key в Core и Orken, переключить трафик, затем перевести старый key в `retiring`/`retired`.

## 2. Переменные Orken backend

Заполнить backend environment по обновленному `.env.example`:

```dotenv
# Текущий production-маршрут внутри приватной сети VM; не используется браузером.
PARTNER_CORE_URL=http://10.100.50.8:8787
PARTNER_CORE_SERVICE_KEYS_JSON=[{"keyId":"orken-bff-2026q3","secret":"<same-secret>","scopes":["sessions:write","partners:read","partners:write","events:write"],"projectIds":["orken"],"status":"active"}]
PARTNER_CORE_PROJECT_ID=orken-life
PARTNER_CORE_DEFAULT_PROGRAM_ID=prog-orken-life
PARTNER_CORE_EMBED_ORIGIN=https://orken.life
PARTNER_CORE_PRIVACY_SECRET=<independent-random-secret>
PARTNER_PORTAL_ORIGIN=https://orken.life
PARTNER_PORTAL_SESSION_ENCRYPTION_SECRET=<independent-32-byte-secret>
# Для https://orken.life/partners оставить незаданным.
PARTNER_PORTAL_COOKIE_DOMAIN=
```

Не задавать эти значения через `NEXT_PUBLIC_*`. `PARTNER_CORE_PRIVACY_SECRET` и `PARTNER_PORTAL_SESSION_ENCRYPTION_SECRET` должны отличаться от service key и друг от друга.

Если frontend и API работают на одном host, `PARTNER_PORTAL_COOKIE_DOMAIN` можно не задавать. Для subdomain-схемы значение должно совпадать с фактическим cookie domain; `Secure` включается автоматически в production.

## 3. База Orken

Применить Prisma migrations:

```powershell
npm.cmd --workspace apps/backend exec prisma migrate deploy
```

`PartnerPortalSession` хранит только hash Orken cookie token и зашифрованный Core token. Core-сессия абсолютная, 30 минут, без refresh. После `401 partner_session_expired` Orken отзывает локальную сессию и показывает login.

## 4. Что подключено

- `/admin`: project-scoped snapshot Partner Core, партнеры, приостановка/восстановление доступа, affiliate program, referral links, offers, reward currency, redemptions и revenue ledger.
- `GET /api/admin/partner-core`: server-to-server загрузка project-scoped данных для текущей админки.
- `PATCH /api/admin/partner-core/partners/:id/status`: `approved`/`suspended` только в границах Orken.
- `/partners`: login/register, dashboard, referral links, offers, ledger, payouts.
- `PATCH /api/partners/portal/offers/:offerId`: редактирование draft и changes-requested/rejected офферов.
- CSRF double-submit cookie для всех portal write routes.
- Server-signed `PartnerCoreServiceClient.reverseConversion(...)`.
- Server-signed `PartnerCoreServiceClient.recordCustomerBonus(...)`.
- Stripe `charge.refunded` для полного refund отправляет conversion reversal в Core.
- `applyPendingReferralBonus` после локального начисления trial/points отправляет customer bonus event в Core.
- Backend worker каждые 2 минуты повторяет `FAILED` и зависшие `PENDING` события типов `SIGNUP`, `PAYMENT`, `REFUND`, `CUSTOMER_BONUS` через сохраненный `PartnerEvent` и тот же idempotency key.
- Core session token зашифрован в Orken DB и никогда не возвращается браузеру.

## 5. Бизнес-события Orken -> Partner Core

### Signup

Отправляется при регистрации с referral code:

```text
Idempotency-Key: orken:signup:<orkenUserId>
externalId: signup:<orkenUserId>
```

### Payment / renewal

Отправляется при успешной оплате или продлении:

```text
Idempotency-Key: orken:invoice:<invoice-or-checkout-id>:affiliate
externalId: invoice:<invoice-or-checkout-id>
```

### Full refund

Отправляется только для полного Stripe refund. Частичный refund текущим Core-контрактом не поддержан.

```text
Idempotency-Key: orken:refund:<stripe-refund-id>
originalExternalId: invoice:<original-invoice-or-checkout-id>
eventType: refund
```

### Customer bonus

Отправляется после успешного локального начисления бонуса в Orken:

```text
Idempotency-Key: orken:bonus:<PartnerAttribution.id>
externalId: bonus:<PartnerAttribution.id>
conversionExternalId: signup:<orkenUserId>
```

Для `FREE_DAYS` используется `bonusType: "trial_extension"`, `bonusUnit: "days"`. Для `CREDITS` используется `bonusType: "points"`, `bonusUnit: "orken_points"`.

## 6. Публикация Orken

Production Compose передает обязательные Partner Core и portal variables в backend/worker. На VM заполнить `/home/deploy/orken-life/shared/.env`, затем развернуть commit из `main`:

```bash
cd /home/deploy/orken-life/current
DEPLOY_REF=main bash scripts/deploy-prod.sh
```

При публикации на `https://orken.life/partners` отдельный DNS и отдельный reverse-proxy route не нужны: существующий frontend обслуживает `/partners`, существующий API proxy обслуживает `/api/*`.

## 7. Smoke-проверка

```powershell
npm.cmd --workspace apps/backend run test
npm.cmd run test:partner-boundary
npm.cmd run build
```

В staging проверить:

1. Войти в `/admin`, открыть блок партнерской программы Orken и убедиться, что загружены project metrics, партнеры и revenue ledger.
2. Приостановить тестового партнера: его вход в `/partners` должен вернуть отказ. Восстановить доступ и проверить успешный login.
3. Создать/обновить программу, reward currency и оффер; отправить оффер на модерацию и синхронизировать статус.
4. Зарегистрировать партнера на `/partners`, повторно войти, создать ссылку, создать/изменить оффер и отправить его на модерацию.
5. Проверить payment conversion, повтор одного idempotency key, full refund с нулевым pending payout и customer bonus без изменения Core money ledger.
6. Убедиться, что service key, embedded token и Core partner session отсутствуют в browser responses, localStorage и frontend bundle.
