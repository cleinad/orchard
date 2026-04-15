/** Body font: storage key, stacks for `setProperty('--font-body', …, 'important')`, and helpers. */
export const BODY_FONT_STORAGE_KEY = "keen-body-font";

export type BodyFontId = "satoshi" | "newsreader";

export const DEFAULT_BODY_FONT_ID: BodyFontId = "satoshi";

/** Stacks reference `globals.css` (`--font-sans` / `--font-serif`) so one definition stays canonical. */
export const BODY_FONT_STACK: Record<BodyFontId, string> = {
  satoshi: "var(--font-sans)",
  newsreader: "var(--font-serif)",
};

export const BODY_FONT_OPTIONS: { id: BodyFontId; label: string }[] = [
  { id: "satoshi", label: "Satoshi" },
  { id: "newsreader", label: "Newsreader" },
];

export const LEGACY_BODY_FONT_ID: Record<string, BodyFontId> = {
  "eb-garamond": "newsreader",
};

export function normalizeStoredBodyFontId(
  value: string | null | undefined
): BodyFontId | null {
  if (value === "satoshi" || value === "newsreader") return value;
  if (value && LEGACY_BODY_FONT_ID[value]) return LEGACY_BODY_FONT_ID[value];
  return null;
}

export function resolveBodyFontId(
  stored: string | null | undefined
): BodyFontId {
  return normalizeStoredBodyFontId(stored) ?? DEFAULT_BODY_FONT_ID;
}

export function applyBodyFont(id: BodyFontId): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.bodyFont = id;
  // Beats `:root` `--font-body` and survives hydration; Newsreader needs `--font-body-newsreader` on `html`+`body`.
  root.style.setProperty("--font-body", BODY_FONT_STACK[id], "important");
}

export function persistBodyFont(id: BodyFontId): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BODY_FONT_STORAGE_KEY, id);
}
