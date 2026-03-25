export type ThemeId = "blizzard" | "dune" | "stellar" | "twilight";
export type ThemeMode = "light" | "dark";

export type ThemeOption = {
  id: ThemeId;
  label: string;
  mode: ThemeMode;
  accent: string;
  palette: [string, string, string];
};

export const STORAGE_KEY = "keen-theme";
export const DEFAULT_LIGHT_THEME_ID: ThemeId = "blizzard";
export const DEFAULT_DARK_THEME_ID: ThemeId = "stellar";

export const LEGACY_THEME_ID_MAP = {
  light: DEFAULT_LIGHT_THEME_ID,
  dark: DEFAULT_DARK_THEME_ID,
} as const;

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "blizzard",
    label: "Blizzard",
    mode: "light",
    accent: "#7C93B8",
    palette: ["#FFFFFF", "#EEF4FB", "#7C93B8"],
  },
  {
    id: "dune",
    label: "Dune",
    mode: "light",
    accent: "#B28252",
    palette: ["#F6F0E6", "#FCF7F0", "#B28252"],
  },
  {
    id: "stellar",
    label: "Stellar",
    mode: "dark",
    accent: "#64748B",
    palette: ["#0D0D0C", "#181817", "#64748B"],
  },
  {
    id: "twilight",
    label: "Twilight",
    mode: "dark",
    accent: "#7AA2F7",
    palette: ["#1A1B26", "#24283B", "#7AA2F7"],
  },
];

export const THEME_MODE_BY_ID = Object.fromEntries(
  THEME_OPTIONS.map((theme) => [theme.id, theme.mode])
) as Record<ThemeId, ThemeMode>;

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return (
    value === "blizzard"
    || value === "dune"
    || value === "stellar"
    || value === "twilight"
  );
}

export function normalizeStoredThemeId(
  value: string | null | undefined
): ThemeId | null {
  if (isThemeId(value)) return value;
  if (value === "light" || value === "dark") return LEGACY_THEME_ID_MAP[value];
  return null;
}

export function resolveThemeId(
  storedThemeId: string | null | undefined,
  prefersDark: boolean
): ThemeId {
  return (
    normalizeStoredThemeId(storedThemeId) ||
    (prefersDark ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID)
  );
}
