"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  DEFAULT_LIGHT_THEME_ID,
  STORAGE_KEY,
  THEME_MODE_BY_ID,
  THEME_OPTIONS,
  type ThemeId,
  isThemeId,
  normalizeStoredThemeId,
  resolveThemeId,
} from "@/lib/theme";
import "./theme-picker.css";

type ThemePopoverElement = HTMLDivElement & {
  hidePopover: () => void;
  matches: (selectors: string) => boolean;
};

function systemPrefersDark() {
  return (
    typeof window !== "undefined"
    && !!window.matchMedia
    && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function applyTheme(themeId: ThemeId) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const isDark = THEME_MODE_BY_ID[themeId] === "dark";
  root.dataset.theme = themeId;
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
}

function ThemeAccent({ themeId }: { themeId: ThemeId }) {
  const theme = THEME_OPTIONS.find((option) => option.id === themeId);
  if (!theme) return null;

  return (
    <span
      aria-hidden="true"
      className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/[0.08] dark:ring-white/[0.12]"
      style={{ backgroundColor: theme.accent }}
    />
  );
}

function ThemePalette({ themeId }: { themeId: ThemeId }) {
  const theme = THEME_OPTIONS.find((option) => option.id === themeId);
  if (!theme) return null;

  return (
    <div className="flex items-center gap-1.5">
      {theme.palette.map((swatch) => (
        <span
          key={swatch}
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full ring-1 ring-black/[0.08] dark:ring-white/[0.12]"
          style={{ backgroundColor: swatch }}
        />
      ))}
    </div>
  );
}

export default function ThemePicker() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<ThemePopoverElement | null>(null);
  const popoverId = `theme-picker-${useId()}`;
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    if (typeof document === "undefined") return DEFAULT_LIGHT_THEME_ID;
    const currentThemeId = document.documentElement.dataset.theme;
    return isThemeId(currentThemeId) ? currentThemeId : DEFAULT_LIGHT_THEME_ID;
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const storedThemeId =
      typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const nextThemeId = resolveThemeId(storedThemeId, systemPrefersDark());
    applyTheme(nextThemeId);
    setThemeId(nextThemeId);

    const migratedThemeId = normalizeStoredThemeId(storedThemeId);
    if (storedThemeId && migratedThemeId && storedThemeId !== migratedThemeId) {
      window.localStorage.setItem(STORAGE_KEY, migratedThemeId);
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const nextThemeId = resolveThemeId(event.newValue, systemPrefersDark());
      applyTheme(nextThemeId);
      setThemeId(nextThemeId);
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const currentTheme =
    THEME_OPTIONS.find((option) => option.id === themeId) || THEME_OPTIONS[0];

  const togglePopover = () => {
    const popover = popoverRef.current;
    const trigger = triggerRef.current;

    if (!popover || !trigger) return;

    if (popover.matches(":popover-open")) {
      popover.hidePopover();
      return;
    }

    (
      popover as unknown as {
        showPopover: (opts?: { source?: HTMLElement }) => void;
      }
    ).showPopover({ source: trigger });
  };

  const selectTheme = (nextThemeId: ThemeId) => {
    applyTheme(nextThemeId);
    setThemeId(nextThemeId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, nextThemeId);
    }
    popoverRef.current?.hidePopover();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Theme: ${currentTheme.label}`}
        aria-controls={popoverId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={togglePopover}
        className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium text-foreground shadow-sm transition ${
          isOpen
            ? "border-black/[0.08] bg-foreground/[0.05] dark:border-white/[0.10]"
            : "border-black/[0.06] bg-surface hover:bg-foreground/[0.03] dark:border-white/[0.08]"
        }`}
      >
        <ThemeAccent themeId={currentTheme.id} />
        <span className="whitespace-nowrap text-sm">{currentTheme.label}</span>
      </button>

      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className="theme-picker-popover"
        onToggle={(event) => {
          const toggleEvent = event as unknown as ToggleEvent;
          setIsOpen(toggleEvent.newState === "open");
        }}
      >
        <div className="w-[min(21rem,calc(100vw-1rem))] rounded-2xl bg-surface p-2.5 text-foreground shadow-[0_24px_48px_rgba(15,23,42,0.12)] ring-1 ring-black/[0.08] dark:shadow-[0_24px_48px_rgba(0,0,0,0.34)] dark:ring-white/[0.08]">
          <div className="px-2 pb-2 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted/70">
              Themes
            </p>
          </div>

          <div className="space-y-1">
            {THEME_OPTIONS.map((theme) => {
              const active = theme.id === themeId;

              return (
                <button
                  key={theme.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectTheme(theme.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${
                    active
                      ? "bg-foreground/[0.06]"
                      : "hover:bg-foreground/[0.04]"
                  }`}
                >
                  <span className="text-sm font-medium text-foreground">{theme.label}</span>

                  <div className="ml-4 flex items-center gap-3">
                    <ThemePalette themeId={theme.id} />
                    {active ? (
                      <div className="flex h-6 w-6 items-center justify-center text-muted">
                        <svg
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 10.5l3 3 7-7" />
                        </svg>
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
