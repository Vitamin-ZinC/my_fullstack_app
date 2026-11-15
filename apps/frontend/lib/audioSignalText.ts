export const audioSignalText = {
  ru: {
    title: "Измерения аудиозаписи", pitch: "Основная частота F0", range: "Интонационный диапазон P10–P90",
    pauses: "Внутренние паузы", medianPause: "Медианная пауза", loudness: "Уровень речи", speech: "Речь в записи",
    coverage: "Пригодные для F0 участки речи", hz: "Гц", semitones: "полутонов", ms: "мс", seconds: "с",
    usable: "Достаточно данных", limited: "Ограниченные данные", unavailable: "Не удалось надёжно измерить",
    note: "Показатели описывают эту запись, а не характер или здоровье. Уровень dBFS зависит от микрофона. Статус означает пригодность сигнала, не точность психологических выводов.",
    timeline: "Динамика по 5 секунд", table: "Значения по времени", interval: "Интервал",
    pauseNote: "Паузы от 200 мс между речевыми участками. Тишина до и после рассказа не включена. Границы являются оценкой VAD.",
    short_speech: "Мало речи для устойчивых выводов.", quiet_signal: "Тихая запись: измерения ограничены.",
    clipping: "Есть перегрузка микрофона: искажённые значения нельзя интерпретировать как особенности человека.",
    low_pitch_coverage: "Мало участков с надёжно определяемой основной частотой.",
    possible_background_noise: "Возможно влияние фонового шума."
  },
  en: {
    title: "Audio measurements", pitch: "Fundamental frequency F0", range: "Intonation range P10–P90",
    pauses: "Internal pauses", medianPause: "Median pause", loudness: "Speech level", speech: "Speech in recording",
    coverage: "Speech eligible for F0 measurement", hz: "Hz", semitones: "semitones", ms: "ms", seconds: "s",
    usable: "Sufficient data", limited: "Limited data", unavailable: "Cannot measure reliably",
    note: "These measurements describe this recording, not personality or health. dBFS depends on the microphone. Status indicates signal eligibility, not the accuracy of psychological conclusions.",
    timeline: "Five-second intervals", table: "Values over time", interval: "Interval",
    pauseNote: "Pauses of at least 200 ms between speech regions. Silence before and after the story is excluded. Boundaries are VAD estimates.",
    short_speech: "Too little speech for stable conclusions.", quiet_signal: "Quiet recording: measurements are limited.",
    clipping: "Microphone overload detected: distortion must not be interpreted as a personal characteristic.",
    low_pitch_coverage: "Too few regions with reliably detectable fundamental frequency.",
    possible_background_noise: "Background noise may affect the measurements."
  }
} as const;
