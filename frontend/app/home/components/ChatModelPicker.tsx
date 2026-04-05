"use client";

import { useId, useRef, useState } from 'react';
import type {
  ChatModelId,
  ChatModelListItem,
  ChatModelProvider,
} from '@/lib/chat-models';
import './chat-model-picker.css';

type ModelPickerPopoverElement = HTMLDivElement & {
  hidePopover: () => void;
  matches: (selectors: string) => boolean;
};

interface ChatModelPickerProps {
  chatModels: ChatModelListItem[];
  selectedModelId: ChatModelId;
  disabled?: boolean;
  onChange: (modelId: ChatModelId) => void;
}

const PROVIDER_LABELS: Record<ChatModelProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
};

export default function ChatModelPicker({
  chatModels,
  selectedModelId,
  disabled = false,
  onChange,
}: ChatModelPickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<ModelPickerPopoverElement | null>(null);
  const popoverId = `chat-model-picker-${useId()}`;
  const [isOpen, setIsOpen] = useState(false);

  const selectedModel =
    chatModels.find((model) => model.id === selectedModelId)
    ?? chatModels.find((model) => model.available)
    ?? chatModels[0]
    ?? null;
  const isUnavailable = !selectedModel?.available;
  const providerLabel = selectedModel ? PROVIDER_LABELS[selectedModel.provider] : 'Unavailable';
  const disabledState = disabled || selectedModel === null;

  const togglePopover = () => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;

    if (!trigger || !popover || disabledState) {
      return;
    }

    if (popover.matches(':popover-open')) {
      popover.hidePopover();
      return;
    }

    (
      popover as unknown as {
        showPopover: (options?: { source?: HTMLElement }) => void;
      }
    ).showPopover({ source: trigger });
  };

  const selectModel = (modelId: ChatModelId) => {
    onChange(modelId);
    popoverRef.current?.hidePopover();
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={selectedModel ? `Chat model: ${selectedModel.label}` : 'Chat model'}
        aria-controls={popoverId}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={togglePopover}
        disabled={disabledState}
        className={`inline-flex h-8 min-w-[9.5rem] items-center justify-between gap-2 rounded-full border px-3.5 text-left text-xs font-medium transition ${
          isOpen
            ? 'border-foreground/[0.10] bg-foreground/[0.05] text-foreground shadow-sm'
            : 'border-border-subtle bg-background text-foreground shadow-sm hover:border-foreground/[0.08] hover:bg-foreground/[0.025]'
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent/80"
          />
          <span className="truncate">{selectedModel?.label ?? 'No models'}</span>
          <span className="hidden text-[11px] font-medium text-muted sm:inline">
            {isUnavailable ? 'Unavailable' : providerLabel}
          </span>
        </span>

        <svg
          aria-hidden="true"
          className={`h-3.5 w-3.5 flex-shrink-0 text-muted transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 20 20"
        >
          <path
            d="M5.5 7.5L10 12l4.5-4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className="chat-model-picker-popover"
        onToggle={(event) => {
          const toggleEvent = event as unknown as ToggleEvent;
          setIsOpen(toggleEvent.newState === 'open');
        }}
      >
        <div className="w-[min(18rem,calc(100vw-1rem))] rounded-[1.35rem] bg-background p-2 text-foreground shadow-[0_24px_48px_rgba(15,23,42,0.14)] ring-1 ring-black/[0.08] dark:shadow-[0_24px_48px_rgba(0,0,0,0.34)] dark:ring-white/[0.08]">
          <div className="px-2 pb-2 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted/70">
              Chat model
            </p>
          </div>

          <div role="menu" aria-label="Chat models" className="space-y-1">
            {chatModels.map((model) => {
              const active = model.id === selectedModelId;

              return (
                <button
                  key={model.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  disabled={!model.available}
                  onClick={() => selectModel(model.id)}
                  className={`flex w-full items-center justify-between rounded-[1rem] px-3 py-2.5 text-left transition outline-none ${
                    active
                      ? 'bg-foreground/[0.06]'
                      : 'hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04]'
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {model.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {PROVIDER_LABELS[model.provider]}
                    </span>
                  </span>

                  {!model.available ? (
                    <span className="ml-4 flex-shrink-0 text-[11px] font-medium text-muted">
                      Unavailable
                    </span>
                  ) : active ? (
                    <span className="ml-4 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-foreground/[0.05] text-muted">
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        viewBox="0 0 20 20"
                      >
                        <path
                          d="M5 10.5l3 3 7-7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
