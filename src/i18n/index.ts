import type { HomeAssistant } from "../types";
import { en } from "./en";
import { pl } from "./pl";
import type { PluralForms, Strings } from "./strings";
import { zhHans } from "./zh-Hans";

export type { PluralForms, Strings };

const LANGUAGES: Record<string, Strings> = { en, pl, "zh-Hans": zhHans };

// Język z profilu użytkownika HA; brak tłumaczenia = angielski.
export function languageOf(hass: Pick<HomeAssistant, "locale" | "language">): string {
  const raw = hass.locale?.language ?? hass.language ?? "en";
  if (LANGUAGES[raw]) return raw;
  if (raw.startsWith("zh")) return raw === "zh-Hant" ? "en" : "zh-Hans";
  const base = raw.split("-")[0];
  return LANGUAGES[base] ? base : "en";
}

export function stringsFor(hass: Pick<HomeAssistant, "locale" | "language">): Strings {
  return LANGUAGES[languageOf(hass)];
}

// Odmiana liczebników zgodna z językiem (1 rzecz, 3 rzeczy, 5 rzeczy).
export function plural(lang: string, count: number, forms: PluralForms): string {
  const rule = new Intl.PluralRules(lang).select(count);
  const form = forms[rule] ?? forms.other ?? "";
  return form.replace("{n}", new Intl.NumberFormat(lang).format(count));
}

export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}
