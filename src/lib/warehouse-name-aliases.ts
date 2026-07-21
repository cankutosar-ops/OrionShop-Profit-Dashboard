/**
 * Presentation-only Latin aliases for Wildberries warehouse names (Cyrillic → Latin).
 * Does not affect DB, API responses, or aggregation keys — UI / Excel display only.
 *
 * Extend WAREHOUSE_NAME_ALIASES when new warehouses appear in stock/sales data.
 * Unknown Cyrillic names fall back to a deterministic Latin transliteration so the
 * Inventory UI never renders Cyrillic warehouse labels.
 */

/** Exact WB warehouse name (trimmed) → Latin display alias. */
export const WAREHOUSE_NAME_ALIASES: Readonly<Record<string, string>> = {
  // --- Seen in Orion exports / live stock+sales ---
  Коледино: "Koledino",
  Электросталь: "Elektrostal",
  Краснодар: "Krasnodar",
  Тула: "Tula",
  Казань: "Kazan",
  "Самара (Новосемейкино)": "Samara (Novosemeykino)",
  "Екатеринбург - Перспективная 14": "Yekaterinburg - Perspektivnaya 14",
  Невинномысск: "Nevinnomyssk",
  Котовск: "Kotovsk",
  Сарапул: "Sarapul",
  Воронеж: "Voronezh",
  Владимир: "Vladimir",
  Волгоград: "Volgograd",
  "Рязань (Тюшевское)": "Ryazan (Tyushevskoye)",
  "СПБ Шушары": "SPB Shushary",
  Пенза: "Penza",
  Новосибирск: "Novosibirsk",
  "Набережные Челны": "Naberezhnye Chelny",
  "СК Ереван": "SC Yerevan",
  "СЦ Барнаул": "SC Barnaul",
  "СЦ Оренбург Центральная": "SC Orenburg Tsentralnaya",
  "Астана Карагандинское шоссе": "Astana Karagandinskoye Highway",
  Владивосток: "Vladivostok",
  Актобе: "Aktobe",
  Тверь: "Tver",
  Атакент: "Atakent",
  Подольск: "Podolsk",
  "Белая дача": "Belaya Dacha",
  Обухово: "Obukhovo",
  "Остальные склады": "Other warehouses",
  Пушкино: "Pushkino",
  "Радумля 1": "Radumlya 1",
  "СЦ Астрахань (Солянка)": "SC Astrakhan (Solyanka)",
  "СЦ Гродно": "SC Grodno",
  "СЦ Внуково": "SC Vnukovo",
  "СЦ Ереван": "SC Yerevan",

  // --- Common WB FBW warehouses (aggressive coverage) ---
  "Санкт-Петербург Уткина Заводь": "Saint Petersburg Utkina Zavod",
  "СПб Уткина Заводь": "SPB Utkina Zavod",
  Шушары: "Shushary",
  "СЦ Шушары": "SC Shushary",
  Хабаровск: "Khabarovsk",
  Чехов: "Chekhov",
  "Чехов 1": "Chekhov 1",
  "Чехов 2": "Chekhov 2",
  "Подольск 3": "Podolsk 3",
  "Подольск 4": "Podolsk 4",
  Вёшки: "Veshki",
  Вешки: "Veshki",
  Истра: "Istra",
  Чашниково: "Chashnikovo",
  Крыловская: "Krylovskaya",
  "Краснодар (Тихорецкая)": "Krasnodar (Tikhoretskaya)",
  "Екатеринбург - Испытателей 14г": "Yekaterinburg - Ispytateley 14g",
  "Екатеринбург - Перспективный 12": "Yekaterinburg - Perspektivny 12",
  "Казань (Республиканский)": "Kazan (Respublikansky)",
  Самара: "Samara",
  Новосемейкино: "Novosemeykino",
  Рязань: "Ryazan",
  Тюшевское: "Tyushevskoye",
  "СЦ Иваново": "SC Ivanovo",
  "СЦ Курск": "SC Kursk",
  "СЦ Белогорск": "SC Belogorsk",
  "СЦ Симферополь": "SC Simferopol",
  "СЦ Серов": "SC Serov",
  "СЦ Ульяновск": "SC Ulyanovsk",
  "СЦ Ярославль": "SC Yaroslavl",
  "СЦ Нижний Новгород": "SC Nizhny Novgorod",
  "СЦ Челябинск 2": "SC Chelyabinsk 2",
  "СЦ Пермь 2": "SC Perm 2",
  "СЦ Киров": "SC Kirov",
  "СЦ Мурманск": "SC Murmansk",
  "СЦ Артем": "SC Artem",
  "СЦ Астрахань": "SC Astrakhan",
  "СЦ Брянск": "SC Bryansk",
  "СЦ Владикавказ": "SC Vladikavkaz",
  "СЦ Вологда": "SC Vologda",
  "СЦ Ижевск": "SC Izhevsk",
  "СЦ Калининград": "SC Kaliningrad",
  "СЦ Кемерово": "SC Kemerovo",
  "СЦ Красноярск": "SC Krasnoyarsk",
  "СЦ Липецк": "SC Lipetsk",
  "СЦ Махачкала": "SC Makhachkala",
  "СЦ Омск": "SC Omsk",
  "СЦ Псков": "SC Pskov",
  "СЦ Смоленск": "SC Smolensk",
  "СЦ Сыктывкар": "SC Syktyvkar",
  "СЦ Томск": "SC Tomsk",
  "СЦ Тюмень": "SC Tyumen",
  "СЦ Уфа": "SC Ufa",
  "СЦ Чита": "SC Chita",
  "СЦ Южно-Сахалинск": "SC Yuzhno-Sakhalinsk",
  "Алматы Атакент": "Almaty Atakent",
  Минск: "Minsk",
  "Гомель 2": "Gomel 2",
  "Склад продавца": "Seller warehouse",
  "Склад WB": "WB Warehouse",
};

const CYRILLIC_RE = /[А-Яа-яЁё]/;

/** GOST-ish single-letter map for unknown Cyrillic warehouse labels. */
const TRANSLIT_MAP: Readonly<Record<string, string>> = {
  А: "A",
  Б: "B",
  В: "V",
  Г: "G",
  Д: "D",
  Е: "E",
  Ё: "Yo",
  Ж: "Zh",
  З: "Z",
  И: "I",
  Й: "Y",
  К: "K",
  Л: "L",
  М: "M",
  Н: "N",
  О: "O",
  П: "P",
  Р: "R",
  С: "S",
  Т: "T",
  У: "U",
  Ф: "F",
  Х: "Kh",
  Ц: "Ts",
  Ч: "Ch",
  Ш: "Sh",
  Щ: "Shch",
  Ъ: "",
  Ы: "Y",
  Ь: "",
  Э: "E",
  Ю: "Yu",
  Я: "Ya",
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** Transliterate Cyrillic characters to Latin; leave other characters unchanged. */
export function transliterateCyrillic(value: string): string {
  let out = "";
  for (const ch of value) {
    out += TRANSLIT_MAP[ch] ?? ch;
  }
  return out;
}

/**
 * Resolve a Latin display name for a WB warehouse string.
 * Known names use WAREHOUSE_NAME_ALIASES; unknown Cyrillic is transliterated;
 * already-Latin (or empty) values are returned trimmed/as-is.
 */
export function localizeWarehouseName(warehouse: string | null | undefined): string {
  if (warehouse == null) return "";
  const key = warehouse.trim();
  if (!key) return warehouse;

  const alias = WAREHOUSE_NAME_ALIASES[key];
  if (alias) return alias;

  if (CYRILLIC_RE.test(key)) {
    // Prefer readable WB prefixes before full letter-by-letter transliteration.
    const withPrefixes = key
      .replace(/^СЦ\s+/u, "SC ")
      .replace(/^СК\s+/u, "SC ")
      .replace(/^СПБ\s+/u, "SPB ")
      .replace(/^СПб\s+/u, "SPB ");
    return transliterateCyrillic(withPrefixes);
  }

  return key;
}

/** Sprint alias for {@link localizeWarehouseName}. */
export const formatWarehouseName = localizeWarehouseName;

/** True when the string still contains Cyrillic letters (should not appear in Inventory UI). */
export function warehouseNameHasCyrillic(value: string | null | undefined): boolean {
  if (value == null || value === "") return false;
  return CYRILLIC_RE.test(value);
}
