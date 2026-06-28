'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type SidePanelSection = 'new' | 'workspaces' | 'temporary' | 'all';

interface SidePanelContextValue {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  // Open the panel and queue a scroll to a named section
  openWithScroll: (section: SidePanelSection) => void;
  scrollRequest: SidePanelSection | null;
  clearScrollRequest: () => void;
}

const SidePanelContext = createContext<SidePanelContextValue | null>(null);

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrollRequest, setScrollRequest] = useState<SidePanelSection | null>(null);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const close = useCallback(() => setIsOpen(false), []);

  const openWithScroll = useCallback((section: SidePanelSection) => {
    setScrollRequest(section);
    setIsOpen(true);
  }, []);

  const clearScrollRequest = useCallback(() => setScrollRequest(null), []);

  return (
    <SidePanelContext.Provider value={{ isOpen, toggle, close, openWithScroll, scrollRequest, clearScrollRequest }}>
      {children}
    </SidePanelContext.Provider>
  );
}

export function useSidePanel(): SidePanelContextValue {
  const ctx = useContext(SidePanelContext);
  if (!ctx) throw new Error('useSidePanel must be used within SidePanelProvider');
  return ctx;
}
