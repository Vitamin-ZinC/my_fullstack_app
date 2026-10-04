import { localizeStaticText, translateGeneratedSystemText, normalizeUiLocale } from "@levelup/contracts";
import { HABIT_DEFINITIONS } from "./habitCatalog.js";

const builtinSlugs = new Set<string>(HABIT_DEFINITIONS.map(item => item.slug));

export function localizeHabitProgramSummary<T extends Record<string, any>>(program: T, requestedLocale?: string): T {
  const locale = normalizeUiLocale(requestedLocale);
  if (locale === "ru") return program;
  const copy = (value: unknown) => typeof value === "string" ? translateGeneratedSystemText(value, locale) : value;
  const fields = (item: Record<string, any>, names: string[]) => ({ ...item, ...Object.fromEntries(names.filter(name => name in item).map(name => [name, copy(item[name])])) });
  const task = (item: any) => item ? fields(item, ["title", "taskText", "microAction", "whyToday"]) : item;
  const enrollments = program.enrollments.map((item: any) => !builtinSlugs.has(item.slug) ? item : ({
    ...fields(item, ["title", "focus", "essence", "practice", "why", "book"]),
    dailyTasks: item.dailyTasks.map(task), todayTask: task(item.todayTask)
  }));
  return {
    ...program,
    title: copy(program.title),
    enrollments,
    activeEnrollment: enrollments.find((item: any) => item.id === program.activeEnrollment?.id) ?? null,
    todayTask: enrollments.find((item: any) => item.id === program.activeEnrollment?.id)?.todayTask ?? null,
    cycles: localizeStaticText(program.cycles, locale),
    rewards: program.rewards.map((item: any) => fields(item, ["label"])),
    weekSummaries: program.weekSummaries.map((item: any) => fields(item, ["habitTitle", "rewardLabel"])),
    rankHistory: program.rankHistory.map((item: any) => fields(item, ["rankTitle"])),
    stats: { ...program.stats, rank: fields(program.stats.rank, ["title", "nextTitle"]) }
  };
}
