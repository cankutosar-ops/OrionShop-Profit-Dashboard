import {
  addDays,
  eachDayOfInterval,
  format,
  startOfWeek,
  type Locale,
} from "date-fns";
import { enUS, ru } from "date-fns/locale";

export type AppLanguage = "en" | "ru";

const INTL_LOCALE: Record<AppLanguage, string> = {
  en: "en-US",
  ru: "ru-RU",
};

const DATE_FNS_LOCALE: Record<AppLanguage, Locale> = {
  en: enUS,
  ru: ru,
};

/** Application UI language — override with NEXT_PUBLIC_APP_LOCALE=en|ru. */
export function getAppLanguage(): AppLanguage {
  const configured = process.env.NEXT_PUBLIC_APP_LOCALE?.trim().toLowerCase();
  if (configured === "ru" || configured === "en") return configured;
  return "en";
}

/** Map BCP-47 or short language codes (e.g. company.language) to supported UI languages. */
export function normalizeAppLanguage(value: string | null | undefined): AppLanguage {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return getAppLanguage();
  if (normalized === "ru" || normalized.startsWith("ru-")) return "ru";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  return getAppLanguage();
}

export function getIntlLocale(language: AppLanguage = getAppLanguage()): string {
  return INTL_LOCALE[language];
}

export function getDateFnsLocale(language: AppLanguage = getAppLanguage()): Locale {
  return DATE_FNS_LOCALE[language];
}

export function formatAppDate(
  date: string | Date,
  language: AppLanguage = getAppLanguage()
): string {
  const value = typeof date === "string" ? new Date(`${date.slice(0, 10)}T12:00:00`) : date;
  return new Intl.DateTimeFormat(getIntlLocale(language), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

export function formatCalendarMonth(
  date: Date,
  language: AppLanguage = getAppLanguage()
): string {
  return format(date, "LLLL yyyy", { locale: getDateFnsLocale(language) });
}

/** Localized two-letter weekday labels (Monday-first week). */
export function getCalendarWeekdayLabels(
  language: AppLanguage = getAppLanguage()
): string[] {
  const locale = getDateFnsLocale(language);
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  return eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) }).map((day) =>
    format(day, "EEEEEE", { locale })
  );
}
