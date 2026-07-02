'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

type SidePanelSection = 'new' | 'workspaces' | 'temporary' | 'all';

const SIDE_PANEL_WIDTH_STORAGE_KEY = 'keen-side-panel-width-v1';
export const SIDE_PANEL_COLLAPSED_WIDTH_PX = 56;
export const SIDE_PANEL_MIN_WIDTH_PX = 200;
export const SIDE_PANEL_DEFAULT_WIDTH_PX = 349;
export const SIDE_PANEL_MAX_WIDTH_PX = 600;

export function clampSidePanelWidthPx(value: number) {
  if (!Number.isFinite(value)) {
    return SIDE_PANEL_DEFAULT_WIDTH_PX;
  }

  return Math.min(SIDE_PANEL_MAX_WIDTH_PX, Math.max(SIDE_PANEL_MIN_WIDTH_PX, Math.round(value)));
}

interface SidePanelContextValue {
  isOpen: boolean;
  widthPx: number;
  setWidthPx: (widthPx: number) => void;
  toggle: () => void;
  open: () => void;
  close: () => void;
  // Open the panel and queue a scroll to a named section
  openWithScroll: (section: SidePanelSection) => void;
  scrollRequest: SidePanelSection | null;
  clearScrollRequest: () => void;
}

const SidePanelContext = createContext<SidePanelContextValue | null>(null);

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [widthPx, setWidthPxState] = useState(SIDE_PANEL_DEFAULT_WIDTH_PX);
  const [scrollRequest, setScrollRequest] = useState<SidePanelSection | null>(null);
  const [hasLoadedWidth, setHasLoadedWidth] = useState(false);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const setWidthPx = useCallback((nextWidthPx: number) => {
    setWidthPxState(clampSidePanelWidthPx(nextWidthPx));
  }, []);

  const openWithScroll = useCallback((section: SidePanelSection) => {
    setScrollRequest(section);
    setIsOpen(true);
  }, []);

  const clearScrollRequest = useCallback(() => setScrollRequest(null), []);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDE_PANEL_WIDTH_STORAGE_KEY);
    const parsed = stored === null ? Number.NaN : Number(stored);

    if (stored !== null) {
      setWidthPxState(clampSidePanelWidthPx(parsed));
    }

    setHasLoadedWidth(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedWidth) {
      return;
    }

    window.localStorage.setItem(SIDE_PANEL_WIDTH_STORAGE_KEY, String(widthPx));
  }, [hasLoadedWidth, widthPx]);

  return (
    <SidePanelContext.Provider
      value={{
        isOpen,
        widthPx,
        setWidthPx,
        toggle,
        open,
        close,
        openWithScroll,
        scrollRequest,
        clearScrollRequest,
      }}
    >
      {children}
    </SidePanelContext.Provider>
  );
}

export function useSidePanel(): SidePanelContextValue {
  const ctx = useContext(SidePanelContext);
  if (!ctx) throw new Error('useSidePanel must be used within SidePanelProvider');
  return ctx;
}
