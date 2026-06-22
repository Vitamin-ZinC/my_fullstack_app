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
      ["1️⃣", "Сканирование лица", "Смотри в экран 10–15 сек или загрузи фото"],
      ["2️⃣", "Голосовая фраза", "Говори 30-60 секунд по подсказкам"],
      ["3️⃣", "AI-анализ", "Алгоритм формирует персональный отчёт"]
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
      step: "Шаг 1/2",
      title: "🎤 Анализ голоса",
      copy: "Расскажите о себе в течение 30-60 секунд",
      start: "🎤 Начать запись",
      stop: "⏹ Остановить запись",
      minimumHint: "Стоп будет доступен через {seconds} сек.",
      stopAvailable: "Можно остановить запись или продолжить до 1 минуты.",
      busy: "Подготовка...",
      next: "Далее — Фото лица →",
      reset: "Записать заново",
      instructionsTitle: "ИНСТРУКЦИИ",
      instructions: [
        "😌 Говорите естественным голосом — не меняйте тон специально",
        "🔈 Избегайте шумных мест — фоновый шум снижает качество"
      ],
      topicsTitle: "Темы для записи:",
      topicNow: "Сейчас:",
      topics: ["Расскажи о своей работе", "Что тебя вдохновляет?", "Опиши идеальный день", "Чем ты гордишься?"],
      saved: "✓ Запись сохранена ({seconds} сек)",
      fileInfo: "Файл: {size} KB · {mime}",
      unsupported: "Браузер не поддерживает запись звука через MediaRecorder/getUserMedia.",
      tooShort: "Голосовой фрагмент слишком короткий",
      failed: "Не удалось записать или загрузить голос"
    },
    face: {
      eyebrow: "Шаг 2",
      step: "Шаг 2/2",
      title: "👤 Анализ лица",
      copy: "Сделайте селфи или загрузите фото анфас. Система оценит качество кадра и соберет визуальный сигнал для premium-отчета.",
      visualLabel: "Анимация анализа лица",
      uploadTitle: "Нажмите, чтобы загрузить фото",
      uploadSubtitle: "или сделайте селфи ниже",
      uploadButton: "Загрузить фото",
      openCamera: "📷 Сделать селфи",
      capture: "Снять",
      next: "Далее — карта Икигай →",
      previewAlt: "preview",
      metricsTitle: "КАЧЕСТВО КАДРА",
      metricLabels: {
        brightness: "Свет",
        contrast: "Контраст",
        sharpness: "Резкость",
        tone: "Лицо"
      },
      hints: [
        ["Свет и резкость", "Лицо должно быть читаемым, без сильной тени и смаза."],
        ["Положение", "Лучше анфас, спокойный взгляд, нейтральная мимика."]
      ],
      noVoice: "Сначала запиши голос",
      cameraError: "Камера недоступна",
      cameraNotReady: "Камера еще не готова. Подождите секунду и нажмите “Снять” снова.",
      fileTypeError: "Загрузите изображение в формате JPG, PNG или HEIC.",
      uploadError: "Не удалось загрузить фото"
    },
    ikigai: {
      eyebrow: "Шаг 3",
      step: "Шаг 3/3",
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
      completeTitle: "✅ Анализ завершён",
      subtitle: "Алгоритмы изучают твой психотип по голосу и лицу",
      completeSubtitle: "Твой отчёт готов!",
      waiting: "Ожидаем обработку...",
      processing: "Собираем сигналы в единую карту",
      ready: "Отчёт готов",
      failed: "Не удалось загрузить статус анализа",
      noAnalysis: "Анализ не был создан",
      openReport: "Посмотреть результат →",
      stagesTitle: "ЭТАПЫ АНАЛИЗА",
      logTitle: "NEURAL LOG",
      stageQueued: "В очереди",
      stageActive: "В процессе",
      stageDone: "Готово",
      stages: ["Анализ вокальных характеристик", "Распознавание микромимики", "Сопоставление с моделью ИКИГАЙ"],
      neuralLog: [
        "Инициализируем аудио- и face-сигналы...",
        "Анализируем микромимику...",
        "Проверяем качество лица и читаемость взгляда...",
        "Оценка тембрального окраса...",
        "Сравниваем энергию голоса и визуальную собранность...",
        "Сопоставление с базой 500+ профессий...",
        "Собираем персональную карту Икигай..."
      ],
      contactTitle: "📧 Куда сохранить контакт?",
      contactCopy: "Email нужен, чтобы сохранить результат, восстановить доступ к отчёту и связать оплату с вашей диагностикой.",
      contactPlaceholder: "твой@email.com",
      contactSubmit: "Сохранить email и открыть отчёт",
      contactError: "Введите email",
      contactInvalid: "Введите корректный email адрес",
      contactSaving: "Сохраняем email...",
      contactSendError: "Не удалось сохранить email"
    }
  },
  ikigaiMap: {
    lockedNote: "Остальные зоны доступны в полном отчёте",
    labels: {
      passion: "СТРАСТЬ",
      mission: "МИССИЯ",
      profession: "ПРОФЕССИЯ",
      vocation: "ПРИЗВАНИЕ",
      ikigai: "Икигай"
    },
    zones: {
      passion: {
        title: "Passion / Страсть",
        insight: "Ваша мимика при темах, где есть личный интерес, считывается как сдержанная, но вовлеченная: Вы не демонстрируете эмоции резко, зато удерживаете внимание и глубину. Голос подтверждает тот же паттерн: энергия раскрывается через смысл, объяснение и экспертный диалог, а не через шумную активность.",
        recommendation: "Навыки: фасилитация, сторителлинг, продуктовое исследование. Профессии: методолог образовательных продуктов, карьерный консультант, UX-исследователь."
      },
      mission: {
        title: "Mission / Миссия",
        insight: "Face Analysis показывает эмпатию и внимательность к реакции собеседника: Вы хорошо замечаете состояние другого человека и можете переводить его в понятные выводы. Voice Analysis добавляет спокойствие и доверие, поэтому Ваша миссия сильнее всего проявляется там, где нужно снижать тревогу и давать ясность.",
        recommendation: "Навыки: диагностическое интервью, клиентская коммуникация, коучинговые вопросы. Профессии: AI-карьерный консультант, фасилитатор стратегических сессий, HR/people partner."
      },
      vocation: {
        title: "Vocation / Призвание",
        insight: "Визуальный сигнал говорит о собранности и способности держать рамку, а голос — о мягкой убедительности без давления. Это сочетание подходит для ролей, где людям важно не просто получить совет, а почувствовать надежную экспертную опору.",
        recommendation: "Навыки: консультационные продажи, аудит, стратегическая упаковка. Профессии: бизнес-консультант, продуктовый стратег, наставник для экспертов."
      },
      profession: {
        title: "Profession / Профессия",
        insight: "В бесплатном отчете открыта именно зона профессии: анализ лица показывает фокус, дисциплину и аналитичность, а голос подтверждает способность объяснять спокойно и последовательно. Это указывает на профессиональный потенциал в задачах, где нужно структурировать сложное, видеть причинно-следственные связи и переводить хаос в понятный план.",
        recommendation: "Профессии: продуктовый стратег, методолог образовательных продуктов, AI-консультант. Навыки: системное мышление, упаковка экспертизы, презентация решений."
      },
      ikigai: {
        title: "Ikigai / Центр реализации",
        insight: "Центр карты показывает, где сходятся энергия, компетенция, польза и доход. По лицу читается собранный аналитический профиль, по голосу — доверие, спокойствие и экспертная харизма. Поэтому Ваше сильное пересечение находится не в случайной профессии, а в роли, где Вы диагностируете ситуацию, объясняете ее людям и помогаете принять практическое решение.",
        recommendation: "Профессии: основатель нишевого AI-сервиса, продуктовый стратег, premium-консультант. Навыки: оффер, исследование рынка, персональная диагностика, ведение клиента к результату."
      }
    }
  },
  report: {
    free: {
      eyebrow: "Бесплатный отчёт",
      title: "🔍 Твоя конфигурация ИКИГАЙ",
      subtitle: "Это не ответ навсегда. Это срез твоего пути сейчас.",
      loading: "Загружаем отчёт...",
      pending: "Отчёт появится после завершения анализа.",
      baseRole: "Базовая роль",
      statusTitle: "ТЕКУЩИЙ СТАТУС",
      statusIntro: "Судя по анализу, ваша текущая роль ближе всего к:",
      insightTitle: "КЛЮЧЕВОЙ ВЫВОД",
      paidPreviewTitle: "В ПОЛНОМ ОТЧЁТЕ ОТКРОЕТСЯ",
      upgradeCopy: "Хочешь увидеть, как твой Икигай проявляется в мимике, голосе и как тебя воспринимают другие? Полный отчёт показывает, где именно возникает рассинхрон.",
      upgradeNote: "Решение принимаешь после FREE-отчёта",
      unlock: "🔓 Открыть полный отчёт — $3",
      loadError: "Не удалось загрузить отчёт"
    },
    payment: {
      eyebrow: "ОПЛАТА",
      title: "Доступ к полному отчёту Икигай",
      subtitle: `от ${BRAND_NAME}`,
      price: "$3",
      priceHint: "Примерно цена одного бизнес-ланча",
      compareTitle: "FREE VS PREMIUM",
      promoTitle: "ПРОМОКОД",
      promoPlaceholder: "ВВЕДИТЕ КОД",
      promoHint: "Если промокод покрывает 100% стоимости, полный отчёт откроется без перехода в Stripe.",
      cardTitle: "ДАННЫЕ КАРТЫ",
      cardName: "ИМЯ ДЕРЖАТЕЛЯ",
      cardNamePlaceholder: "IVAN PETROV",
      stripePlaceholder: "Нажмите кнопку ниже, чтобы загрузить Stripe Payment Element",
      checkoutPlaceholder: "Оплата будет открыта на защищенной странице Stripe Checkout",
      secureCopy: "Платёжные данные обрабатывает Stripe. Номер карты, срок и CVV не сохраняются в ORKEN.LIFE.",
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
      backToFree: "Вернуться к бесплатному отчёту",
      compareFree: ["1 основная роль", "Краткий срез Икигай", "Общий вывод по текущему состоянию"],
      comparePremium: ["5 ролей с процентом соответствия", "Детальный разбор психотипа", "Глубокий анализ лица и голоса", "Дорожная карта развития на 30 дней"]
    },
    full: {
      eyebrow: `${BRAND_NAME} · Premium report`,
      title: "Полный аналитический отчет Икигай",
      needsPayment: "Нужна оплата",
      pay: "Перейти к оплате",
      loading: "Загружаем полный отчёт...",
      mapHint: "Нажмите на один из разделов диаграммы Икигай, чтобы увидеть персональные результаты ниже.",
      toc: ["Карта", "Резюме", "Голос", "Лицо", "Роли", "Риски", "План", "Итог"],
      sections: ["1. Карта Икигай", "2. Краткое резюме", "3. Расширенный анализ голоса", "4. Глубокий анализ лица и визуального сигнала", "5. Топ-5 профессиональных направлений", "6. Карьерные риски и точки роста", "7. 30-дневный маршрут внедрения", "8. Итоговое профессиональное заключение"],
      voiceLabels: {
        timbre: "Тембр",
        emotionality: "Эмоциональность",
        confidence: "Уверенность",
        pace: "Темп речи",
        energy: "Энергия",
        leadership: "Лидерский сигнал",
        anxiety: "Напряжение",
        communication: "Коммуникация",
        charisma: "Харизма",
        analytical: "Аналитичность",
        sociality: "Социальность",
        persuasion: "Убедительность",
        motivation: "Мотивация"
      },
      faceLabels: {
        emotionality: "Эмоциональность",
        leadership: "Лидерский сигнал",
        confidence: "Уверенность",
        thinkingType: "Тип мышления",
        sociality: "Социальность",
        stressTolerance: "Стрессоустойчивость",
        analytical: "Аналитичность",
        motivation: "Мотивация",
        empathy: "Эмпатия",
        openness: "Открытость",
        communication: "Коммуникация",
        discipline: "Дисциплина",
        ambition: "Амбиция"
      },
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
    priceTitle: "Report price",
    priceCopy: "Цена хранится в центах и применяется сервером при создании Stripe Checkout или PaymentIntent.",
    priceAmount: "Amount, cents",
    priceCurrency: "Currency",
    savePrice: "Save price",
    savedPrice: "Цена отчёта сохранена",
    promptTitle: "AI report prompts",
    promptCopy: "Edit the active report templates. New analyses use ACTIVE prompts from the database; defaults are used only when no active prompt exists.",
    promptOutputTitle: "Report outputs",
    promptOutputCopy: "FREE and PREMIUM are generated by separate prompts. FREE returns an engaging first result and paid-preview fields; PREMIUM returns the full voice, face, roles, risks, action plan and final insight.",
    promptSelect: "Select saved or default prompt",
    promptKey: "Prompt key",
    promptLocale: "Locale",
    promptVersion: "Version",
    promptTitleField: "Prompt title",
    promptPlaceholdersTitle: "Available placeholders",
    promptPlaceholders: "{{language}}, {{analysisId}}, {{questionnaireJson}}, {{voiceMetricsJson}}, {{voiceTranscript}}, {{photoIncluded}}",
    savePrompt: "Save prompt",
    savedPrompt: "Prompt saved",
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
