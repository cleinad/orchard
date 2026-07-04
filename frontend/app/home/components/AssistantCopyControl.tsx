"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  ASSISTANT_COPY_FORMAT_LABELS,
  ASSISTANT_COPY_FORMAT_STORAGE_KEY,
  ASSISTANT_COPY_FORMATS,
  DEFAULT_ASSISTANT_COPY_FORMAT,
  appendPlainSourcesForCopy,
  formatAssistantMarkdownForCopy,
  isAssistantCopyFormat,
  type AssistantCopyFormat,
} from '@/app/home/components/messageCopy';
import type { Message } from '@/app/home/types';

const ASSISTANT_COPY_FORMAT_EVENT = 'novus-assistant-copy-format-change';

function readAssistantCopyFormat() {
  if (typeof window === 'undefined') {
    return DEFAULT_ASSISTANT_COPY_FORMAT;
  }

  const storedFormat = window.localStorage.getItem(ASSISTANT_COPY_FORMAT_STORAGE_KEY);
  return isAssistantCopyFormat(storedFormat) ? storedFormat : DEFAULT_ASSISTANT_COPY_FORMAT;
}

function saveAssistantCopyFormat(format: AssistantCopyFormat) {
  window.localStorage.setItem(ASSISTANT_COPY_FORMAT_STORAGE_KEY, format);
  window.dispatchEvent(new CustomEvent(ASSISTANT_COPY_FORMAT_EVENT, { detail: format }));
}

function normalizePlainCopyText(text: string) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getPlainTextFromContentRoot(
  root: HTMLElement,
  options: { includeCitationMarkers: boolean }
) {
  const clone = root.cloneNode(true) as HTMLElement;

  clone.querySelectorAll('[data-selection-exclude="true"], .thread-highlight-overlay')
    .forEach((element) => element.remove());

  clone.querySelectorAll<HTMLElement>('[data-testid="search-citation"]').forEach((button) => {
    const sourceId = button.dataset.sourceId;
    const marker =
      options.includeCitationMarkers && sourceId ? `[${sourceId}]` : '';
    button.replaceWith(button.ownerDocument.createTextNode(marker));
  });

  const sandbox = root.ownerDocument.createElement('div');
  sandbox.style.position = 'fixed';
  sandbox.style.left = '-9999px';
  sandbox.style.top = '0';
  sandbox.style.width = `${Math.max(root.clientWidth, 320)}px`;
  sandbox.style.visibility = 'hidden';
  sandbox.appendChild(clone);
  root.ownerDocument.body.appendChild(sandbox);

  const text = normalizePlainCopyText(clone.innerText || clone.textContent || '');
  sandbox.remove();
  return text;
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function CopyIcon({ checked }: { checked: boolean }) {
  return checked ? (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      className="h-3 w-3 transition-transform duration-150"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M4 9.25 7.15 12.25 14 5.5" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="currentColor"
    >
      <path d="M16 1H4C2.9 1 2 1.9 2 3v14h2V3h12V1Z" />
      <path d="M8 5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2H8Zm0 2h11v14H8V7Z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
    >
      <path d="m4.5 6.5 3.5 3 3.5-3" />
    </svg>
  );
}

function SmallCheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

export default function AssistantCopyControl({
  contentRootRef,
  message,
}: {
  contentRootRef: RefObject<HTMLDivElement | null>;
  message: Message;
}) {
  const [copyFormat, setCopyFormat] = useState<AssistantCopyFormat>(readAssistantCopyFormat);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const copiedResetTimerRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleFormatChange = (event: Event) => {
      const nextFormat = event instanceof CustomEvent ? event.detail : null;
      if (isAssistantCopyFormat(nextFormat)) {
        setCopyFormat(nextFormat);
      }
    };

    window.addEventListener(ASSISTANT_COPY_FORMAT_EVENT, handleFormatChange);
    return () => window.removeEventListener(ASSISTANT_COPY_FORMAT_EVENT, handleFormatChange);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (
        menuRef.current
        && event.target instanceof Node
        && !menuRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (copiedResetTimerRef.current) {
        window.clearTimeout(copiedResetTimerRef.current);
      }
    };
  }, []);

  const markCopied = useCallback(() => {
    setCopied(true);
    if (copiedResetTimerRef.current) {
      window.clearTimeout(copiedResetTimerRef.current);
    }
    copiedResetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedResetTimerRef.current = null;
    }, 1600);
  }, []);

  const getCopyText = useCallback(
    (format: AssistantCopyFormat) => {
      if (format === 'markdown' || format === 'markdown-sources') {
        return formatAssistantMarkdownForCopy(
          message.content,
          message.searchMetadata,
          format
        );
      }

      const root = contentRootRef.current;
      const body = root
        ? getPlainTextFromContentRoot(root, {
            includeCitationMarkers: format === 'plain-sources',
          })
        : formatAssistantMarkdownForCopy(message.content, message.searchMetadata, 'plain');

      return format === 'plain-sources'
        ? appendPlainSourcesForCopy(body, message.searchMetadata)
        : body;
    },
    [contentRootRef, message.content, message.searchMetadata]
  );

  const copyAs = useCallback(
    async (format: AssistantCopyFormat) => {
      const text = getCopyText(format);
      if (!text) return;

      try {
        await writeClipboardText(text);
        markCopied();
      } catch {
        setCopied(false);
      }
    },
    [getCopyText, markCopied]
  );

  const handleFormatSelect = useCallback(
    (format: AssistantCopyFormat) => {
      setCopyFormat(format);
      saveAssistantCopyFormat(format);
      setMenuOpen(false);
      void copyAs(format);
    },
    [copyAs]
  );

  return (
    <div ref={menuRef} className="relative flex items-center font-sans text-[11px] font-medium">
      <div className="inline-flex h-6 overflow-hidden rounded-md border border-border-subtle bg-surface/80 text-muted shadow-sm shadow-black/[0.015]">
        <button
          type="button"
          onClick={() => void copyAs(copyFormat)}
          className="inline-flex h-full min-w-[4.35rem] items-center justify-center gap-1 px-2 transition-colors hover:bg-foreground/[0.035] hover:text-foreground"
          aria-label={`Copy response as ${ASSISTANT_COPY_FORMAT_LABELS[copyFormat]}`}
        >
          <CopyIcon checked={copied} />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className="flex h-full w-5 items-center justify-center border-l border-border-subtle transition-colors hover:bg-foreground/[0.035] hover:text-foreground"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Choose copy format"
        >
          <ChevronDownIcon />
        </button>
      </div>

      {menuOpen && (
        <div
          role="menu"
          aria-label="Copy format"
          className="absolute bottom-full left-0 z-40 mb-1.5 w-48 rounded-md border border-border-subtle bg-surface p-1 text-foreground shadow-lg shadow-black/10"
        >
          <div className="px-2 pb-1 pt-0.5 text-[10px] font-medium text-muted">
            Copy format
          </div>
          {ASSISTANT_COPY_FORMATS.map((format) => {
            const active = copyFormat === format;
            return (
              <button
                key={format}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => handleFormatSelect(format)}
                className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] transition-colors ${
                  active
                    ? 'bg-foreground/[0.06] text-foreground'
                    : 'text-muted hover:bg-foreground/[0.035] hover:text-foreground'
                }`}
              >
                <span className="flex h-3.5 w-3.5 items-center justify-center">
                  {active ? <SmallCheckIcon /> : null}
                </span>
                <span>{ASSISTANT_COPY_FORMAT_LABELS[format]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
