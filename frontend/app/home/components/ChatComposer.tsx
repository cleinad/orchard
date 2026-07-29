import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEventHandler,
  type ClipboardEventHandler,
  type DragEventHandler,
  type FormEventHandler,
  type KeyboardEventHandler,
  type ReactElement,
  type RefObject,
} from 'react';
import Tooltip from '@/app/components/Tooltip';
import ChatModelPicker from '@/app/home/components/ChatModelPicker';
import ResponseStylePicker from '@/app/home/components/ResponseStylePicker';
import type { PendingChatImageAttachment } from '@/app/home/components/chatImageUploads';
import { MAX_CHAT_IMAGE_ATTACHMENTS } from '@/lib/chat-attachments';
import type { SearchMode } from '@/lib/chat-search';
import {
  type ChatModelEffortOverrides,
  type ChatModelEffortLevel,
  type ChatModelId,
  type ChatModelListItem,
  type ChatModelThinkingOverrides,
} from '@/lib/chat-models';
import { getResponseStyleSummary, type ResponseStyle } from '@/lib/response-style';
import { buttonStyles, cx } from '@/app/components/buttonStyles';

interface ChatComposerProps {
  chatModels: ChatModelListItem[];
  input: string;
  isLoading: boolean;
  imageInputDisabledReason: string | null;
  isUploadingImages: boolean;
  pendingImageAttachments: PendingChatImageAttachment[];
  responseStyle: ResponseStyle;
  selectedModelId: ChatModelId;
  modelEffortOverrides: ChatModelEffortOverrides;
  thinkingEnabledOverrides: ChatModelThinkingOverrides;
  searchMode: SearchMode;
  isWideLayout?: boolean;
  searchWarning: string | null;
  imageWarning: string | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onAttachImages: (files: File[]) => void;
  onImageWarning: (message: string | null) => void;
  onRemoveImageAttachment: (id: string) => void;
  onModelChange: (modelId: ChatModelId) => void;
  onModelEffortChange: (modelId: ChatModelId, effort: ChatModelEffortLevel) => void;
  onThinkingEnabledChange: (modelId: ChatModelId, enabled: boolean) => void;
  onResponseStyleChange: (value: ResponseStyle) => void;
  onSearchModeChange: (mode: SearchMode) => void;
  onToggleWideLayout?: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onStop?: () => void;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
}

export default function ChatComposer({
  chatModels,
  input,
  isLoading,
  imageInputDisabledReason,
  isUploadingImages,
  pendingImageAttachments,
  responseStyle,
  selectedModelId,
  modelEffortOverrides,
  thinkingEnabledOverrides,
  searchMode,
  isWideLayout = false,
  searchWarning,
  imageWarning,
  textareaRef,
  onInputChange,
  onAttachImages,
  onImageWarning,
  onRemoveImageAttachment,
  onModelChange,
  onModelEffortChange,
  onThinkingEnabledChange,
  onResponseStyleChange,
  onSearchModeChange,
  onToggleWideLayout,
  onSubmit,
  onStop,
  onKeyDown,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const hasAvailableChatModels = chatModels.some((model) => model.available);
  const selectedModel =
    chatModels.find((model) => model.id === selectedModelId)
    ?? chatModels.find((model) => model.available)
    ?? chatModels[0]
    ?? null;
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const [compactControls, setCompactControls] = useState(false);
  const controlsRowRef = useRef<HTMLDivElement | null>(null);
  const controlsMeasureRef = useRef<HTMLDivElement | null>(null);
  const searchMenuRef = useRef<HTMLDivElement | null>(null);
  const searchModeLabels: Record<SearchMode, string> = {
    auto: 'Auto',
    required: 'Always search',
    off: 'Off',
  };
  const searchModeTooltip: Record<SearchMode, string> = {
    auto: 'Search auto: live sources are used when needed',
    required: 'Always search: replies use live sources',
    off: 'Search off: replies do not use live retrieval',
  };
  useEffect(() => {
    if (!searchMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        searchMenuRef.current
        && event.target instanceof Node
        && !searchMenuRef.current.contains(event.target)
      ) {
        setSearchMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [searchMenuOpen]);

  useLayoutEffect(() => {
    const row = controlsRowRef.current;
    const measure = controlsMeasureRef.current;

    if (!row || !measure) {
      return;
    }

    const updateCompactControls = () => {
      const rowStyle = window.getComputedStyle(row);
      const rowWidth =
        row.clientWidth
        - parseFloat(rowStyle.paddingLeft || '0')
        - parseFloat(rowStyle.paddingRight || '0');
      const expandedWidth = measure.getBoundingClientRect().width;

      setCompactControls(Math.ceil(expandedWidth) > Math.floor(rowWidth));
    };

    updateCompactControls();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateCompactControls);
      return () => window.removeEventListener('resize', updateCompactControls);
    }

    const observer = new ResizeObserver(updateCompactControls);
    observer.observe(row);
    observer.observe(measure);
    window.addEventListener('resize', updateCompactControls);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateCompactControls);
    };
  }, [
    onToggleWideLayout,
    responseStyle,
    selectedModel?.available,
    selectedModel?.label,
  ]);

  const canSubmit = Boolean(input.trim() || pendingImageAttachments.length > 0);
  const isBusy = isLoading || isUploadingImages;
  const attachDisabledReason =
    isUploadingImages
      ? 'Wait for the current image upload to finish.'
      : isLoading
        ? 'Wait for the current response to finish.'
        : imageInputDisabledReason
          ? imageInputDisabledReason
          : pendingImageAttachments.length >= MAX_CHAT_IMAGE_ATTACHMENTS
            ? `Attach up to ${MAX_CHAT_IMAGE_ATTACHMENTS} images at a time.`
            : null;
  const attachDisabled = Boolean(attachDisabledReason);
  const onlyImagesWarning = 'Only image uploads are supported here.';

  const getFilesFromItems = (items: DataTransferItemList | undefined | null) =>
    Array.from(items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

  const getFilesFromTransfer = (
    files: FileList | undefined | null,
    items: DataTransferItemList | undefined | null
  ) => {
    const listedFiles = Array.from(files || []);
    return listedFiles.length > 0 ? listedFiles : getFilesFromItems(items);
  };

  const dedupeFiles = (files: File[]) => {
    const seen = new Set<string>();
    return files.filter((file) => {
      const key = `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };

  const filterImageFiles = (files: File[]) =>
    files.filter((file) => file.type.startsWith('image/'));

  const handleRejectedFiles = (files: File[]) => {
    if (files.length === 0) {
      return false;
    }

    const imageFiles = filterImageFiles(files);
    if (imageFiles.length === 0 || imageFiles.length < files.length) {
      onImageWarning(onlyImagesWarning);
      return true;
    }

    if (attachDisabledReason) {
      onImageWarning(attachDisabledReason);
      return true;
    }

    return false;
  };

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }

    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(
      textareaRef.current.scrollHeight,
      200
    )}px`;
  }, [input, textareaRef]);

  const handleFileInputChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    if (handleRejectedFiles(files)) {
      return;
    }

    onAttachImages(files);
  };

  const handlePaste: ClipboardEventHandler<HTMLFormElement> = (event) => {
    const files = dedupeFiles(
      getFilesFromTransfer(event.clipboardData.files, event.clipboardData.items)
    );

    if (files.length > 0) {
      event.preventDefault();
      if (handleRejectedFiles(files)) {
        return;
      }

      onAttachImages(files);
    }
  };

  const handleDragOver: DragEventHandler<HTMLFormElement> = (event) => {
    if (Array.from(event.dataTransfer.items).some((item) => item.kind === 'file')) {
      event.preventDefault();
      if (!attachDisabledReason) {
        setIsDraggingImage(true);
      }
    }
  };

  const handleDragLeave: DragEventHandler<HTMLFormElement> = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingImage(false);
    }
  };

  const handleDrop: DragEventHandler<HTMLFormElement> = (event) => {
    const files = dedupeFiles(
      getFilesFromTransfer(event.dataTransfer.files, event.dataTransfer.items)
    );

    if (files.length > 0) {
      event.preventDefault();
      if (handleRejectedFiles(files)) {
        setIsDraggingImage(false);
        return;
      }

      onAttachImages(files);
    }

    setIsDraggingImage(false);
  };

  const attachButton = (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      disabled={attachDisabled}
      aria-label="Attach image"
      className={cx(
        'flex h-9 w-9 items-center justify-center rounded-md border border-transparent p-0 hover:border-foreground/[0.08]',
        buttonStyles.transition,
        buttonStyles.focus,
        buttonStyles.ghost,
        buttonStyles.disabled,
        attachDisabledReason ? 'pointer-events-none' : null
      )}
    >
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.5 4.5h11A2.5 2.5 0 0120 7v11a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 18V7a2.5 2.5 0 012.5-2.5z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.5 17.5l4.25-4.25a1.4 1.4 0 012 0l2.75 2.75 1.75-1.75a1.4 1.4 0 012 0l2.25 2.25"
        />
        <circle cx="15.75" cy="8.75" r="1.25" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );

  const renderAttachButton = (): ReactElement => {
    if (!attachDisabledReason) {
      return attachButton;
    }

    return (
      <Tooltip content={attachDisabledReason} side="top">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-md"
          tabIndex={0}
          aria-label={`Attach image disabled: ${attachDisabledReason}`}
        >
          {attachButton}
        </span>
      </Tooltip>
    );
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4">
      <div className="shrink-0 pb-2 pt-2">
        <form
          onSubmit={onSubmit}
          onPaste={handlePaste}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="relative"
        >
          <div
            className={`relative rounded-lg bg-surface shadow-sm ring-1 transition ${
              isDraggingImage ? 'ring-foreground/30' : 'ring-border-subtle'
            }`}
          >
            {pendingImageAttachments.length > 0 && (
              <div className="flex gap-2 overflow-x-auto px-3 pb-1 pt-3">
                {pendingImageAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="group relative h-16 w-16 flex-none overflow-hidden rounded-md bg-foreground/[0.04] ring-1 ring-border-subtle"
                  >
                    <img
                      src={attachment.url}
                      alt={attachment.fileName}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveImageAttachment(attachment.id)}
                      disabled={isBusy}
                      aria-label={`Remove ${attachment.fileName}`}
                      className={cx(
                        'absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 shadow-sm',
                        buttonStyles.transition,
                        buttonStyles.focus,
                        buttonStyles.ghost,
                        buttonStyles.disabled
                      )}
                    >
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Message composer"
              placeholder="Ask a question or add a thought..."
              rows={1}
              disabled={isUploadingImages}
              className="composer-scrollbar w-full min-h-10 min-w-0 resize-none bg-transparent pl-3 pr-[5.5rem] py-2.5 font-sans text-sm leading-relaxed text-foreground placeholder-muted/50 outline-none disabled:cursor-not-allowed disabled:opacity-50 overflow-y-auto"
              style={{ maxHeight: '200px' }}
            />

            <div className="absolute bottom-1.5 right-2 flex flex-none items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
              />
              {renderAttachButton()}
              <button
                type={isLoading ? 'button' : 'submit'}
                onClick={isLoading ? onStop : undefined}
                disabled={isLoading ? !onStop : !canSubmit || isBusy}
                aria-label={isLoading ? 'Stop response' : 'Send message'}
                className={cx(
                  'flex h-7 w-7 items-center justify-center rounded-md p-0',
                  buttonStyles.primary,
                  buttonStyles.focus
                )}
              >
                {isLoading ? (
                  <span className="h-2.5 w-2.5 rounded-[2px] bg-current" />
                ) : <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 10l7-7m0 0l7 7m-7-7v18"
                  />
                </svg>}
              </button>
            </div>
          </div>

          <div
            ref={controlsMeasureRef}
            aria-hidden="true"
            className="pointer-events-none invisible fixed -left-[9999px] top-0 -z-10 flex w-max items-center gap-2 px-1"
          >
            <div className="flex items-center gap-1.5">
              {onToggleWideLayout ? (
                <span className="inline-flex h-8 w-8 rounded-lg border" />
              ) : null}
              <span className="inline-flex h-8 min-w-[6.4rem] items-center justify-between gap-2 rounded-lg border px-3 font-sans font-medium">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate text-[13px]">Search</span>
                </span>
                <span className="h-3.5 w-3.5 flex-shrink-0" />
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="inline-flex h-8 min-w-[6.75rem] max-w-[8.5rem] items-center justify-between gap-2 rounded-lg border px-3 font-sans font-medium sm:min-w-[8.5rem]">
                <span className="truncate text-[13px]">
                  {getResponseStyleSummary(responseStyle)}
                </span>
                <span className="h-3.5 w-3.5 flex-shrink-0" />
              </span>
              <span className="inline-flex h-8 min-w-[9.25rem] items-center justify-between gap-2 rounded-lg border px-3 font-sans font-medium">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate text-[13px]">
                    {selectedModel?.label ?? 'No models'}
                  </span>
                  {!selectedModel?.available ? (
                    <span className="text-[10px] font-medium">
                      Unavailable
                    </span>
                  ) : null}
                </span>
                <span className="h-3.5 w-3.5 flex-shrink-0" />
              </span>
            </div>
          </div>

          <div
            ref={controlsRowRef}
            className="mt-1.5 flex flex-nowrap items-center justify-between gap-2 px-1"
          >
            <div className="flex flex-shrink-0 items-center gap-1.5">
              {onToggleWideLayout && (
                <Tooltip content={isWideLayout ? 'Use focused width' : 'Use wide width'} side="bottom">
                  <button
                    type="button"
                    aria-label={isWideLayout ? 'Use focused width' : 'Use wide width'}
                    aria-pressed={isWideLayout}
                    data-testid="chat-width-toggle"
                    onClick={onToggleWideLayout}
                    className={cx(
                      'inline-flex h-8 w-8 items-center justify-center rounded-lg border',
                      buttonStyles.transition,
                      isWideLayout
                        ? buttonStyles.controlActive
                        : buttonStyles.controlInactiveMuted,
                      buttonStyles.controlShadow,
                      buttonStyles.controlFocus
                    )}
                  >
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                    >
                      {isWideLayout ? (
                        <>
                          <path d="M9 5H5v4" />
                          <path d="M5 5l5.5 5.5" />
                          <path d="M15 19h4v-4" />
                          <path d="M19 19l-5.5-5.5" />
                        </>
                      ) : (
                        <>
                          <path d="M5 9V5h4" />
                          <path d="M5 5l5.5 5.5" />
                          <path d="M19 15v4h-4" />
                          <path d="M19 19l-5.5-5.5" />
                        </>
                      )}
                    </svg>
                  </button>
                </Tooltip>
              )}
              <div ref={searchMenuRef} className="relative">
                <Tooltip content={searchModeTooltip[searchMode]} side="bottom">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={searchMenuOpen}
                    aria-label={`Search mode ${searchModeLabels[searchMode].toLowerCase()}`}
                    onClick={() => setSearchMenuOpen((open) => !open)}
                    className={cx(
                      'inline-flex h-8 items-center justify-between rounded-lg border text-left font-sans font-medium',
                      compactControls
                        ? 'min-w-[3.25rem] gap-1.5 px-2'
                        : 'min-w-[6.4rem] gap-2 px-3',
                      buttonStyles.transition,
                      searchMenuOpen || searchMode === 'required'
                        ? buttonStyles.controlActive
                        : searchMode === 'off'
                          ? buttonStyles.controlInactiveMuted
                          : buttonStyles.controlInactive,
                      buttonStyles.controlShadow,
                      buttonStyles.controlFocus
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center ${
                          searchMode === 'required' ? 'text-accent' : 'text-current'
                        }`}
                      >
                        <svg
                          aria-hidden="true"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 21a9 9 0 100-18 9 9 0 000 18z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3.6 9h16.8M3.6 15h16.8M12 3c2.1 2.25 3.15 5.25 3.15 9S14.1 18.75 12 21M12 3C9.9 5.25 8.85 8.25 8.85 12S9.9 18.75 12 21"
                          />
                        </svg>
                      </span>
                      <span className={cx(
                        'truncate text-[13px]',
                        compactControls ? 'hidden' : 'inline'
                      )}
                      >
                        Search
                      </span>
                    </span>

                    <svg
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 flex-shrink-0 text-muted transition-transform duration-150 ${
                        searchMenuOpen ? 'rotate-180' : ''
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
                </Tooltip>

                {searchMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Search mode"
                    className="absolute bottom-10 left-0 z-30 min-w-[11rem] rounded-[1.1rem] bg-background p-1.5 font-sans text-xs text-foreground shadow-[0_16px_36px_rgba(15,23,42,0.12)] ring-1 ring-black/[0.06] dark:shadow-[0_18px_40px_rgba(0,0,0,0.28)] dark:ring-white/[0.06]"
                  >
                    {(['auto', 'required', 'off'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="menuitemradio"
                        aria-checked={searchMode === mode}
                        onClick={() => {
                          onSearchModeChange(mode);
                          setSearchMenuOpen(false);
                        }}
                        className={cx(
                          'grid h-9 w-full grid-cols-[1fr_0.875rem] items-center gap-3 whitespace-nowrap rounded-xl px-2.5 text-left',
                          buttonStyles.transition,
                          buttonStyles.focus,
                          searchMode === mode
                            ? buttonStyles.menuItemActive
                            : buttonStyles.menuItemInactive
                        )}
                      >
                        <span className="text-[13px] font-medium">{searchModeLabels[mode]}</span>
                        {searchMode === mode && (
                          <span className="h-1.5 w-1.5 justify-self-center rounded-full bg-accent" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
              <ResponseStylePicker
                value={responseStyle}
                onChange={onResponseStyleChange}
              />
              <ChatModelPicker
                chatModels={chatModels}
                selectedModelId={selectedModelId}
                modelEffortOverrides={modelEffortOverrides}
                thinkingEnabledOverrides={thinkingEnabledOverrides}
                disabled={!hasAvailableChatModels}
                onChange={onModelChange}
                onEffortChange={onModelEffortChange}
                onThinkingEnabledChange={onThinkingEnabledChange}
                compact={compactControls}
              />
            </div>
          </div>

          {searchWarning && (
            <div className="mt-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 font-sans text-xs text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              {searchWarning}
            </div>
          )}
          {imageWarning && (
            <div
              data-testid="composer-image-warning"
              className="mt-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 font-sans text-xs text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
            >
              {imageWarning}
            </div>
          )}
        </form>

      </div>
    </div>
  );
}
