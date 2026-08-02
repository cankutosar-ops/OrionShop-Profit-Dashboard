/**
 * Theme preference — Light / Dark / System.
 * Persisted in localStorage so it survives logout/login.
 */

export const THEME_STORAGE_KEY = "orionshop.theme";

export const THEME_OPTIONS = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_OPTIONS)[number];

export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_OPTIONS.includes(value as ThemePreference);
}
