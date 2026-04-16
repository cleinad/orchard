"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  DEFAULT_LIGHT_THEME_ID,
  STORAGE_KEY,
  THEME_MODE_BY_ID,
  THEME_OPTIONS,
  type ThemeId,
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
      className="h-2 w-2 flex-shrink-0 rounded-full ring-1 ring-black/[0.08] dark:ring-white/[0.12]"
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
          className="h-2 w-2 rounded-full ring-1 ring-black/[0.08] dark:ring-white/[0.12]"
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
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_LIGHT_THEME_ID);
  const [isHydrated, setIsHydrated] = useState(false);
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
    setIsHydrated(true);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const currentTheme =
    THEME_OPTIONS.find((option) => option.id === themeId) || THEME_OPTIONS[0];
  const currentThemeLabel = isHydrated ? currentTheme.label : "Theme";

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
        aria-label={isHydrated ? `Theme: ${currentTheme.label}` : "Theme"}
        aria-controls={popoverId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={togglePopover}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 font-sans text-[13px] font-medium transition ${
          isOpen
            ? "border-black/[0.08] bg-foreground/[0.055] text-foreground dark:border-white/[0.08]"
            : "border-transparent bg-background text-foreground/82 hover:bg-foreground/[0.035] hover:text-foreground"
        }`}
      >
        {isHydrated ? (
          <ThemeAccent themeId={currentTheme.id} />
        ) : (
          <span
            aria-hidden="true"
            className="h-2 w-2 flex-shrink-0 rounded-full bg-muted/45"
          />
        )}
        <span className="whitespace-nowrap text-[13px] text-foreground">{currentThemeLabel}</span>
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
        <div className="w-[min(18.5rem,calc(100vw-1rem))] rounded-[1.2rem] bg-background p-1.5 font-sans text-foreground shadow-[0_16px_36px_rgba(15,23,42,0.12)] ring-1 ring-black/[0.06] dark:shadow-[0_18px_40px_rgba(0,0,0,0.28)] dark:ring-white/[0.06]">
          <div className="px-2.5 pb-1.5 pt-1">
            <p className="text-[11px] font-medium text-muted/75">
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
                  className={`flex w-full items-center justify-between rounded-[0.95rem] px-3 py-2 text-left transition ${
                    active
                      ? "bg-foreground/[0.055]"
                      : "hover:bg-foreground/[0.04]"
                  }`}
                >
                  <span className="text-[13px] font-medium text-foreground">{theme.label}</span>

                  <div className="ml-4 flex items-center gap-2.5">
                    <ThemePalette themeId={theme.id} />
                    {active ? (
                      <div className="flex h-5 w-5 items-center justify-center text-muted">
                        <svg
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                          className="h-3.5 w-3.5"
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
