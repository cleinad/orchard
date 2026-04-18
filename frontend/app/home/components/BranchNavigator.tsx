"use client";

import { useEffect } from 'react';
import type { BranchChip } from '@/app/home/components/conversationTree';

export interface BranchNavigatorItem {
  sourceMessageId: string;
  preview: string;
  chips: BranchChip[];
}

interface BranchNavigatorProps {
  items: BranchNavigatorItem[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onJumpToMessage: (sourceMessageId: string) => void;
  onSelectBranch: (sourceMessageId: string, branchId: string | null) => void;
}

function summarizePreview(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return 'Assistant reply';
  }

  if (normalized.length <= 96) {
    return normalized;
  }

  return `${normalized.slice(0, 95).trimEnd()}…`;
}

function branchPointLabel(count: number) {
  return count === 1 ? '1 branch point' : `${count} branch points`;
}

export default function BranchNavigator({
  items,
  isOpen,
  onToggle,
  onClose,
  onJumpToMessage,
  onSelectBranch,
}: BranchNavigatorProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close branch navigator"
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
          onClick={onClose}
        />
      )}

      <div className="pointer-events-none sticky top-4 z-40 h-0 px-4 sm:top-5 sm:px-6">
        <div className="pointer-events-auto ml-auto w-fit">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls="branch-navigator-overlay"
            className="flex items-center gap-3 rounded-full border border-border-subtle bg-background/90 px-3.5 py-2 text-left shadow-[0_10px_30px_rgba(0,0,0,0.08)] backdrop-blur-sm transition hover:border-foreground/[0.12] hover:bg-background"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/[0.05] text-foreground">
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 5.25a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zm0 13.5a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zm9-6.75a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zM10.1 6.3l5.1 4.3M10.1 17.7l5.1-4.3"
                />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold tracking-[0.18em] text-muted">
                Branches
              </span>
              <span className="block text-sm font-medium text-foreground">
                {branchPointLabel(items.length)}
              </span>
            </span>
          </button>

          {isOpen && (
            <div
              id="branch-navigator-overlay"
              className="fixed inset-x-4 bottom-4 z-40 max-h-[75vh] overflow-hidden rounded-[1.5rem] border border-border-subtle bg-background/95 shadow-[0_20px_60px_rgba(0,0,0,0.14)] backdrop-blur-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%+0.75rem)] sm:w-[24rem]"
            >
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-muted">
                    Branch Navigator
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {branchPointLabel(items.length)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-foreground/[0.04] hover:text-foreground"
                  aria-label="Close branch navigator"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 6l12 12M18 6L6 18"
                    />
                  </svg>
                </button>
              </div>

              <div className="max-h-[calc(75vh-4.5rem)] overflow-y-auto px-3 py-3">
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <section
                      key={item.sourceMessageId}
                      className="rounded-2xl border border-border-subtle bg-surface/70 p-3"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onJumpToMessage(item.sourceMessageId);
                          onClose();
                        }}
                        className="w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold tracking-[0.18em] text-muted">
                            Fork {index + 1}
                          </span>
                          <span className="text-[11px] text-muted">Jump</span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-foreground">
                          {summarizePreview(item.preview)}
                        </p>
                      </button>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.chips.map((chip) => (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => {
                              onSelectBranch(item.sourceMessageId, chip.branchId);
                              onClose();
                            }}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                              chip.isActive
                                ? 'bg-foreground text-background'
                                : chip.kind === 'pending'
                                  ? 'border border-dashed border-foreground/[0.18] bg-background text-foreground'
                                  : 'bg-foreground/[0.05] text-muted hover:bg-foreground/[0.08] hover:text-foreground'
                            }`}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
