'use client';

import { useEffect, type ReactNode } from 'react';
import { SidePanelProvider, useSidePanel } from '@/app/home/components/SidePanelContext';

// Registers Cmd/Ctrl+B to toggle the sidebar. Lives here so the shortcut
// survives route changes between /home and /home/[conversationId].
function SidePanelShortcut() {
  const { toggle } = useSidePanel();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat
        || event.shiftKey
        || event.altKey
        || (!event.ctrlKey && !event.metaKey)
        || event.key.toLowerCase() !== 'b'
      ) {
        return;
      }
      event.preventDefault();
      toggle();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  return null;
}

export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <SidePanelProvider>
      <SidePanelShortcut />
      {children}
    </SidePanelProvider>
  );
}
