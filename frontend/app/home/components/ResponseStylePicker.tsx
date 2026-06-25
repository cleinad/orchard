"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import {
  DEFAULT_RESPONSE_STYLE,
  RESPONSE_STYLE_LENGTH_DESCRIPTIONS,
  RESPONSE_STYLE_LENGTH_LABELS,
  RESPONSE_STYLE_LENGTH_OPTIONS,
  RESPONSE_STYLE_LEVEL_DESCRIPTIONS,
  RESPONSE_STYLE_LEVEL_LABELS,
  RESPONSE_STYLE_LEVEL_OPTIONS,
  getResponseStyleSummary,
  isDefaultResponseStyle,
  type ResponseStyle,
  type ResponseStyleLength,
  type ResponseStyleLevel,
} from '@/lib/response-style';
import './chat-model-picker.css';

type ResponseStylePopoverElement = HTMLDivElement & {
  hidePopover: () => void;
  matches: (selectors: string) => boolean;
};

interface ResponseStylePickerProps {
  value: ResponseStyle;
  disabled?: boolean;
  onChange: (value: ResponseStyle) => void;
}

function getOptionIndex<T extends string>(options: readonly T[], value: T) {
  const index = options.indexOf(value);
  return index >= 0 ? index : 0;
}

function getSliderProgress<T extends string>(options: readonly T[], value: T) {
  const index = getOptionIndex(options, value);
  return `${(index / (options.length - 1)) * 100}%`;
}

export default function ResponseStylePicker({
  value,
  disabled = false,
  onChange,
}: ResponseStylePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<ResponseStylePopoverElement | null>(null);
  const popoverId = `response-style-picker-${useId()}`;
  const lengthId = `${popoverId}-length`;
  const levelId = `${popoverId}-level`;
  const [isOpen, setIsOpen] = useState(false);
  const [showSessionNote, setShowSessionNote] = useState(
    value.sessionNote.trim().length > 0
  );

  const active = !isDefaultResponseStyle(value);
  const summary = getResponseStyleSummary(value);

  useEffect(() => {
    if (value.sessionNote.trim().length > 0) {
      setShowSessionNote(true);
    }
  }, [value.sessionNote]);

  const togglePopover = () => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;

    if (!trigger || !popover || disabled) {
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

  const updateLength = (length: ResponseStyleLength) => {
    onChange({ ...value, length });
  };

  const updateLevel = (level: ResponseStyleLevel) => {
    onChange({ ...value, level });
  };

  const updateSessionNote = (sessionNote: string) => {
    onChange({ ...value, sessionNote });
  };

  const resetStyle = () => {
    onChange(DEFAULT_RESPONSE_STYLE);
    setShowSessionNote(false);
  };

  const lengthSliderStyle = {
    '--response-style-progress': getSliderProgress(
      RESPONSE_STYLE_LENGTH_OPTIONS,
      value.length
    ),
  } as CSSProperties;
  const levelSliderStyle = {
    '--response-style-progress': getSliderProgress(
      RESPONSE_STYLE_LEVEL_OPTIONS,
      value.level
    ),
  } as CSSProperties;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Response style: ${summary}`}
        aria-controls={popoverId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={togglePopover}
        disabled={disabled}
        className={`inline-flex h-8 min-w-[6.75rem] max-w-[8.5rem] items-center justify-between gap-2 rounded-full border px-3 text-left font-sans font-medium transition sm:min-w-[8.5rem] ${
          isOpen || active
            ? 'border-foreground/[0.08] bg-foreground/[0.055] text-foreground'
            : 'border-transparent bg-background text-foreground/88 hover:bg-foreground/[0.035] hover:text-foreground'
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="truncate text-[13px] text-foreground">
          {summary}
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
        className="response-style-picker-popover"
        onToggle={(event) => {
          const toggleEvent = event as unknown as ToggleEvent;
          setIsOpen(toggleEvent.newState === 'open');
        }}
      >
        <div className="w-[min(22rem,calc(100vw-1rem))] rounded-2xl bg-background p-4 font-sans text-foreground shadow-[0_16px_36px_rgba(15,23,42,0.12)] ring-1 ring-black/[0.06] dark:shadow-[0_18px_40px_rgba(0,0,0,0.28)] dark:ring-white/[0.06]">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[13px] font-semibold leading-5 text-foreground">
              Response style
            </p>
            {active && (
              <button
                type="button"
                onClick={resetStyle}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-muted transition hover:bg-foreground/[0.04] hover:text-foreground"
              >
                Reset
              </button>
            )}
          </div>

          <div className="mt-4 space-y-5">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <label
                    id={lengthId}
                    className="text-[12px] font-semibold leading-4 text-foreground"
                  >
                    Length
                  </label>
                  <p className="mt-0.5 text-[11px] leading-4 text-foreground/55">
                    {RESPONSE_STYLE_LENGTH_DESCRIPTIONS[value.length]}
                  </p>
                </div>
                <span className="text-[13px] font-semibold leading-5 text-foreground">
                  {RESPONSE_STYLE_LENGTH_LABELS[value.length]}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={RESPONSE_STYLE_LENGTH_OPTIONS.length - 1}
                step={1}
                value={getOptionIndex(RESPONSE_STYLE_LENGTH_OPTIONS, value.length)}
                aria-labelledby={lengthId}
                className="response-style-slider"
                style={lengthSliderStyle}
                onChange={(event) => {
                  updateLength(
                    RESPONSE_STYLE_LENGTH_OPTIONS[Number(event.currentTarget.value)]
                  );
                }}
              />
              <div className="grid grid-cols-4 gap-1.5 text-center text-[11px] font-medium text-foreground/55">
                {RESPONSE_STYLE_LENGTH_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => updateLength(option)}
                    className={`h-7 truncate rounded-md px-1 transition-colors ${
                      value.length === option
                        ? 'font-semibold text-foreground'
                        : 'hover:bg-foreground/[0.035] hover:text-foreground'
                    }`}
                  >
                    {RESPONSE_STYLE_LENGTH_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <label
                    id={levelId}
                    className="text-[12px] font-semibold leading-4 text-foreground"
                  >
                    Level
                  </label>
                  <p className="mt-0.5 text-[11px] leading-4 text-foreground/55">
                    {RESPONSE_STYLE_LEVEL_DESCRIPTIONS[value.level]}
                  </p>
                </div>
                <span className="text-[13px] font-semibold leading-5 text-foreground">
                  {RESPONSE_STYLE_LEVEL_LABELS[value.level]}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={RESPONSE_STYLE_LEVEL_OPTIONS.length - 1}
                step={1}
                value={getOptionIndex(RESPONSE_STYLE_LEVEL_OPTIONS, value.level)}
                aria-labelledby={levelId}
                className="response-style-slider"
                style={levelSliderStyle}
                onChange={(event) => {
                  updateLevel(
                    RESPONSE_STYLE_LEVEL_OPTIONS[Number(event.currentTarget.value)]
                  );
                }}
              />
              <div className="grid grid-cols-4 gap-1.5 text-center text-[11px] font-medium text-foreground/55">
                {RESPONSE_STYLE_LEVEL_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => updateLevel(option)}
                    className={`h-7 truncate rounded-md px-1 transition-colors ${
                      value.level === option
                        ? 'font-semibold text-foreground'
                        : 'hover:bg-foreground/[0.035] hover:text-foreground'
                    }`}
                  >
                    {RESPONSE_STYLE_LEVEL_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-border-subtle pt-3.5">
              {showSessionNote ? (
                <label className="block">
                  <span className="text-[12px] font-semibold leading-4 text-foreground">
                    Session note
                  </span>
                  <textarea
                    value={value.sessionNote}
                    onChange={(event) => updateSessionNote(event.target.value)}
                    placeholder="Give examples in every response..."
                    rows={3}
                    className="mt-2 w-full resize-none rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[13px] leading-relaxed text-foreground outline-none transition placeholder:text-muted/55 focus:border-foreground/[0.18]"
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSessionNote(true)}
                  className="h-8 w-full rounded-lg px-2 text-left text-[12px] font-medium text-foreground/70 transition hover:bg-foreground/[0.035] hover:text-foreground"
                >
                  Add session note
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
