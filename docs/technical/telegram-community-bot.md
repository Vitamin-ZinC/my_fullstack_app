# ORKEN Community Telegram Bot

## Назначение

Community Bot — отдельный Telegram-бот для публичных групп. Он использует ту же инфраструктуру Orken, но не имеет доступа к личной памяти Навигатора, диагностическим отчётам, привычкам, метрикам, инсайтам или личным Telegram-чатам.

Основной персональный бот принимает только `private`-сообщения. Групповые события обрабатывает только Community Bot.

## Что реализовано

- отдельные backend-only token, username и webhook secret;
- защищённый webhook `POST /api/telegram/community/webhook` с проверкой заголовка Telegram `X-Telegram-Bot-Api-Secret-Token`;
- регистрация группы через `my_chat_member`, безопасный статус `PENDING` и явная активация администратором;
- добровольное участие и упоминания: `/join`, `/leave`, `/mentions_on`, `/mentions_off`;
- публичный фокус `/focus`, итог `/done` или `/partial`, отдельные community-баллы и `/leaderboard`;
- автоматические публикации утром, днём и вечером с timezone и quiet hours;
- Smart Ping только для opted-in участников, разрешивших упоминания, не чаще одного раза в 24 часа;
- AI-ответы только на явное упоминание бота или reply, без личного контекста и долговременного хранения текста группы;
- отдельный безопасный prompt `telegram.community.system`, доступный в админке;
- управление шаблонами, группами, расписанием, AI, Smart Ping и объявлениями в `/admin/integrations`.

Community-баллы не являются XP пользователя на ORKEN.LIFE и не влияют на подписку, выплаты или партнёрские начисления.

## Подключение после получения токена

1. Создать нового бота через `@BotFather`.
2. Разрешить добавление в группы через `/setjoingroups`.
3. Оставить Privacy Mode включённым через `/setprivacy`. Для первой версии бот должен получать только команды, упоминания, replies и служебные события.
4. Добавить в production `.env`:

```env
TELEGRAM_COMMUNITY_BOT_TOKEN=<server-side token>
TELEGRAM_COMMUNITY_BOT_USERNAME=<username without @>
TELEGRAM_COMMUNITY_WEBHOOK_SECRET=<random string at least 16 characters>
```

5. Перезапустить backend и worker.
6. Из backend-контейнера зарегистрировать webhook и команды:

```bash
npm run telegram:community:configure
```

7. Добавить бота в тестовую группу. Группа появится в `Админка -> Интеграции -> ORKEN Community Bot`.
8. Проверить timezone, расписание и шаблоны. Затем выполнить `/activate` от администратора группы.

Токен и webhook secret нельзя отправлять во frontend, добавлять в `NEXT_PUBLIC_*`, хранить в БД/AppSetting или вставлять в prompt.

## Команды

Участники:

- `/join`
- `/leave`
- `/focus один конкретный результат`
- `/done`
- `/partial`
- `/leaderboard`
- `/mentions_on`
- `/mentions_off`
- `/life`
- `/help`

Администраторы группы:

- `/activate`
- `/pause`
- `/wake_up`
- `/status`

## Принятые ограничения

- Нет `@all`: упоминаются только известные боту opted-in участники.
- Нет чтения всех сообщений при включённом Privacy Mode. Активность учитывается по командам, replies и обращениям к боту.
- Нет автоматических наказаний, потери баллов, публичного стыда или публикации личных результатов.
- Нет переноса group chat ID в `TelegramAccount` персонального бота.
- Нет автоматического начисления ORKEN XP за групповой чек-ин.
