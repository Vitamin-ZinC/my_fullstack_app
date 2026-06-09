export const BRAND_NAME = "ORKEN.LIFE";

export type Locale = "ru" | "en";

export const ruSiteText = {
  nav: {
    brand: BRAND_NAME,
    sub: "AI-диагностика ИКИГАЙ",
    backHome: "← Главная"
  },
  landing: {
    kicker: BRAND_NAME,
    titlePrefix: "Найди свою точку",
    titleAccent: "ИКИГАЙ",
    subtitle: "за 3 минуты с помощью AI",
    lead: "Экспресс-диагностика по лицу и голосу помогает увидеть, как ты на самом деле распределяешь энергию и фокус.",
    cta: "👉 Пройти экспресс-диагностику",
    note: "Займёт 3–5 минут · Без тестов · Бесплатный отчёт",
    problemTitle: "🤔 Почему так сложно понять, что с тобой происходит?",
    problemItems: [
      "Ты вроде бы справляешься, но постоянно устаёшь",
      "Достигать целей, но терять ощущение смысла",
      "Решения даются тяжело, даже когда всё «логично»",
      "Хочется ясности, но не очередного теста"
    ],
    problemCopy: "Большинство тестов задают 150 вопросов и анализируют прошлый опыт. Но твои реальные состояния проявляются раньше мыслей — в лице, голосе, микрореакциях.",
    signalsTitle: `🔬 Что анализирует ${BRAND_NAME}`,
    faceTitle: "Лицо",
    voiceTitle: "Голос",
    faceSignals: ["Напряжение", "Внимание", "Когн. нагрузка", "Баланс энергии"],
    voiceSignals: ["Энергия", "Эмоц. нагрузка", "Стиль мышления", "Тип усилия"],
    howTitle: "🧩 Как это работает",
    steps: [
      ["1", "Голосовая фраза", "Произнеси текст до 20 секунд"],
      ["2", "Сканирование лица", "Смотри в экран 10–15 сек или загрузи фото"],
      ["3", "AI-анализ", "Алгоритм формирует персональный отчёт"]
    ],
    freeTitle: "📄 В бесплатном отчёте",
    freeItems: [
      "Твоя текущая профессиональная роль",
      "Направления, соответствующие твоей энергии",
      "Первичные сигналы твоей точки ИКИГАЙ",
      "Намёк на более подходящие профессии"
    ],
    modelTitle: "🧩 МОДЕЛЬ ИКИГАЙ",
    modelCopy: `${BRAND_NAME} использует динамическую модель ИКИГАЙ. Она показывает пересечение четырех факторов:`,
    modelFactors: ["что у тебя получается", "что дает тебе энергию", "что нужно рынку", "что может приносить доход"],
    modelHighlight: "В точке пересечения возникает окно профессиональной реализации: зона, где способности, энергия, польза и деньги перестают конфликтовать.",
    privacyTitle: "🛡️ Данные в безопасности",
    privacyItems: ["Фото и аудио не сохраняются", "Данные не используются для обучения", "Никаких оценок внешности", "Никаких диагнозов — только паттерны"],
    finalTitle: "🚀 Хочешь увидеть свою реальную картину?",
    finalCopy: "Иногда несколько минут ясности экономят годы движения не в ту сторону.",
    finalNote: "3 минуты · Бесплатный отчёт · Без регистрации"
  },
  flow: {
    voice: {
      eyebrow: "Шаг 1",
      title: "🎤 Анализ голоса",
      copy: "Произнеси короткую фразу. Фрагмент загрузится в анализ и откроет следующий шаг.",
      start: "🎤 Начать запись",
      stop: "⏹ Остановить запись",
      busy: "Подготовка...",
      next: "Далее — Фото лица →",
      tooShort: "Голосовой фрагмент слишком короткий",
      failed: "Не удалось записать или загрузить голос"
    },
    face: {
      eyebrow: "Шаг 2",
      title: "👤 Анализ лица",
      copy: "Сделай спокойный снимок при хорошем освещении. Это нужно для оценки паттернов внимания и энергии.",
      openCamera: "📷 Сделать селфи",
      capture: "📷 Сохранить снимок",
      next: "🚀 Начать анализ →",
      noVoice: "Сначала запиши голос",
      cameraError: "Камера недоступна",
      uploadError: "Не удалось загрузить фото"
    },
    ikigai: {
      eyebrow: "Шаг 3",
      title: "Карта Икигай",
      copy: "Ответь коротко: можно перечислять слова через запятую.",
      questions: [
        ["love", "Что даёт тебе энергию?"],
        ["good_at", "Что у тебя получается?"],
        ["world_needs", "Что нужно людям и рынку?"],
        ["paid_for", "За что тебе могут платить?"]
      ],
      placeholder: "Через запятую",
      submit: "Начать AI-анализ",
      busy: "Запуск...",
      launchError: "Не удалось запустить анализ"
    },
    analysis: {
      eyebrow: "AI-анализ",
      title: "✨ Идёт магия ИИ",
      waiting: "Ожидаем обработку...",
      ready: "Отчёт готов",
      failed: "Не удалось загрузить статус анализа",
      noAnalysis: "Анализ не был создан",
      openReport: "Посмотреть результат →",
      stages: ["Обрабатываем голос", "Считываем визуальные сигналы", "Собираем персональную карту Икигай", "Формируем отчёт"]
    }
  },
  ikigaiMap: {
    labels: {
      passion: "СТРАСТЬ",
      mission: "МИССИЯ",
      profession: "ПРОФЕССИЯ",
      vocation: "ПРИЗВАНИЕ",
      ikigai: "Икигай"
    },
    zones: {
      passion: {
        title: "Страсть",
        insight: "Зона показывает, где интерес совпадает с тем, что у Вас уже получается.",
        recommendation: "Навыки: сторителлинг, исследование, методология."
      },
      mission: {
        title: "Миссия",
        insight: "Зона связывает личную энергию с задачами, которые нужны людям и рынку.",
        recommendation: "Роли: консультант, фасилитатор, образовательный продукт."
      },
      vocation: {
        title: "Призвание",
        insight: "Зона отвечает за пользу, которую можно превратить в устойчивую карьерную траекторию.",
        recommendation: "Роли: продуктовый стратег, карьерный аналитик, CX/UX эксперт."
      },
      profession: {
        title: "Профессия",
        insight: "Зона соединяет сильные навыки и платежеспособный спрос. Это главный мост к монетизации.",
        recommendation: "Роли: продуктовый стратег, AI-консультант, методолог."
      },
      ikigai: {
        title: "Икигай",
        insight: "Центральная точка, где энергия, компетенции, польза рынку и доход соединяются в рабочую стратегию.",
        recommendation: "Соберите 7-дневную проверку оффера и покажите ее реальным клиентам."
      }
    }
  },
  report: {
    free: {
      eyebrow: "Бесплатный отчёт",
      title: "🔍 Твоя конфигурация ИКИГАЙ",
      loading: "Загружаем отчёт...",
      pending: "Отчёт появится после завершения анализа.",
      baseRole: "Базовая роль",
      unlock: "🔓 Открыть полный отчёт — $3",
      loadError: "Не удалось загрузить отчёт"
    },
    payment: {
      eyebrow: "Stripe",
      title: "Доступ к полному отчёту Икигай",
      subtitle: `от ${BRAND_NAME}`,
      copy: "Платёжные данные вводятся на стороне Stripe. Можно применить промокод.",
      promoPlaceholder: "Промокод",
      checkout: "Открыть PRO-отчёт",
      checkoutExternal: "Перейти к оплате",
      busy: "Подготовка...",
      confirm: "Подтвердить оплату",
      openedByPromo: "Промокод применён. Полный отчёт открыт.",
      stripeNoSecret: "Stripe не вернул clientSecret",
      stripeNotLoaded: "Stripe.js не загрузился",
      paymentNotReady: "Платёжная форма ещё не готова",
      failed: "Оплата не прошла",
      startFailed: "Не удалось начать оплату",
      openFull: "Открыть полный отчёт",
      compareFree: ["1 основная роль", "Краткий срез Икигай", "Общий вывод по текущему состоянию"],
      comparePremium: ["5 ролей с процентом соответствия", "Детальный разбор психотипа", "Глубокий анализ лица и голоса", "Дорожная карта развития на 30 дней"]
    },
    full: {
      eyebrow: `${BRAND_NAME} · Premium report`,
      title: "Полный аналитический отчет Икигай",
      needsPayment: "Нужна оплата",
      pay: "Перейти к оплате",
      loading: "Загружаем полный отчёт...",
      toc: ["Конусы", "Резюме", "Голос", "Лицо", "Роли", "Риски", "План", "Итог"],
      sections: ["1. Конусная модель Икигай", "2. Executive summary", "3. Расширенный анализ голоса", "4. Глубокий анализ лица и визуального сигнала", "5. Top-5 профессиональных направлений", "6. Карьерные риски и точки роста", "7. 30-дневный маршрут внедрения", "8. Итоговое профессиональное заключение"],
      savePdf: "Сохранить отчет в PDF",
      match: "совпадение"
    }
  },
  admin: {
    eyebrow: "Admin",
    title: `${BRAND_NAME} operations dashboard`,
    passwordPlaceholder: "Admin password",
    login: "Log in",
    logout: "Log out",
    activeSession: "Admin session is active for this browser tab.",
    stats: ["Analyses", "Paid reports", "Revenue cents", "Events 24h", "Failed", "Statuses"],
    seedLocales: "Seed locales",
    seedFlag: "Seed flag",
    seedPrompt: "Seed prompt",
    promoTitle: "Promo codes",
    textTitle: "Texts and translations",
    textCopy: "Редактируй JSON-словарь. Сохранённые значения перекрывают базовый файл messages.ts без нового деплоя.",
    saveTexts: "Save texts",
    resetTexts: "Reset to defaults",
    invalidJson: "JSON невалиден",
    savedTexts: "Тексты сохранены",
    lists: ["Settings", "Feature flags", "Prompts", "Recent analyses"]
  },
  habits: {
    brand: BRAND_NAME,
    subtitle: "Трекер превращает выводы Икигай в ежедневные действия",
    nav: [
      ["dashboard", "🏠", "Дашборд"],
      ["journey", "🧭", "Мой путь"],
      ["habits", "✦", "Привычки"],
      ["archive", "📚", "Архив"],
      ["navigator", "🤖", "AI Навигатор"],
      ["settings", "⚙", "Настройки"],
      ["guide", "?", "Гид"]
    ],
    dashboardTitle: "Сегодняшний фокус",
    dashboardCopy: "Здесь ты ежедневно отмечаешь состояние и делаешь отметку привычки",
    journeyTitle: "Мой путь",
    journeyCopy: "4 цикла по 12 недель: от ресурса к устойчивой профессиональной стратегии",
    habitsTitle: "Привычки",
    habitsCopy: "48 привычек · 11 активных месяцев · месяц 12 = повторение",
    archiveTitle: "Архив инсайтов",
    archiveCopy: "Сохраняй наблюдения по неделям и возвращайся к ним в конце цикла",
    navigatorTitle: "AI Навигатор",
    navigatorCopy: "Пингви — твой личный AI-наставник в ORKEN.LIFE",
    settingsTitle: "Настройки",
    guideTitle: `Добро пожаловать в ${BRAND_NAME} Ikigai`,
    cta: "Открыть трекер привычек",
    trial: "30 дней trial · затем $8 в месяц",
    trialButton: "Активировать трекер привычек — 30 дней trial",
    metrics: ["Энергия", "Ясность", "Фокус", "Ресурс"],
    stats: ["XP очков", "Текущий цикл", "Текущая неделя", "Дней в пути", "Привычек выполнено", "Инсайтов записано"],
    currentHabit: {
      title: "Упаковка ценности",
      focus: "Сформулировать, за какой конкретный результат Вам могут платить",
      essence: "Икигай становится рабочей стратегией, когда ценность можно объяснить конкретному человеку.",
      practice: "Запиши одну фразу: кому ты помогаешь, с какой болью и к какому результату.",
      why: "Рынок реагирует не на потенциал, а на понятное обещание результата.",
      book: "«Атомные привычки» — Джеймс Клир"
    },
    habitCards: [
      ["Цикл 1 · Неделя 1", "Сон как фундамент", "Найти минимальный ритуал восстановления"],
      ["Цикл 1 · Неделя 2", "Утренний фокус", "Выбрать одно главное действие дня"],
      ["Цикл 1 · Неделя 3", "Лог энергии", "Понять, какие задачи дают ресурс"],
      ["Цикл 1 · Неделя 4", "Упаковка ценности", "Перевести навык в понятное предложение"]
    ],
    navigatorPrompts: ["Помоги с привычкой", "Разбери мой фокус", "Расскажи про Икигай", "Что делать завтра?"],
    guideBlocks: [
      "Программа рассчитана на 1 год: 4 цикла по 3 месяца, каждый цикл — 12 привычек.",
      "Каждую неделю открывается одна привычка. Выполни практику, отметь день и запиши короткий инсайт.",
      "XP помогает видеть динамику, но главный результат — устойчивый ритм действий."
    ],
    settingsTabs: ["Профиль", "Мой прогресс", "Подписка", "Уведомления"]
  }
} as const;

type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : T extends object
      ? { [K in keyof T]: Widen<T[K]> }
      : T;

export type SiteText = Widen<typeof ruSiteText>;

export const defaultSiteText: Record<Locale, SiteText> = {
  ru: ruSiteText,
  en: {
    ...ruSiteText,
    nav: { brand: BRAND_NAME, sub: "AI IKIGAI diagnostics", backHome: "← Home" },
    landing: {
      ...ruSiteText.landing,
      titlePrefix: "Find your",
      titleAccent: "IKIGAI point",
      subtitle: "in 3 minutes with AI",
      cta: "👉 Start express diagnostics",
      finalNote: "3 minutes · Free report · No registration"
    },
    admin: {
      ...ruSiteText.admin,
      textCopy: "Edit the JSON dictionary. Saved values override messages.ts without redeploying."
    }
  }
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mergeSiteText(base: SiteText, overrides: unknown): SiteText {
  if (!isPlainObject(overrides)) return base;

  const merge = (current: unknown, next: unknown): unknown => {
    if (Array.isArray(current)) return Array.isArray(next) ? next : current;
    if (!isPlainObject(current)) return next ?? current;
    if (!isPlainObject(next)) return current;

    return Object.fromEntries(
      Object.entries(current).map(([key, value]) => [key, merge(value, next[key])])
    );
  };

  return merge(base, overrides) as SiteText;
}

export function parseLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "ru";
}
