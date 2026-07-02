"use client";

import { useId, useLayoutEffect, useRef, useState } from 'react';
import type {
  ChatModelEffortOverrides,
  ChatModelEffortLevel,
  ChatModelId,
  ChatModelListItem,
  ChatModelProvider,
  ChatModelThinkingOverrides,
} from '@/lib/chat-models';
import './chat-model-picker.css';

type ModelPickerPopoverElement = HTMLDivElement & {
  hidePopover: () => void;
  matches: (selectors: string) => boolean;
};

const MAIN_PANEL_WIDTH_PX = 288;
const EFFORT_PANEL_WIDTH_PX = 240;
const MIN_EFFORT_PANEL_WIDTH_PX = 192;
const PANEL_GAP_PX = 4;
const VIEWPORT_GUTTER_PX = 8;
const POPOVER_OFFSET_PX = 6;
const DRILLDOWN_BREAKPOINT_PX = 560;

interface ChatModelPickerProps {
  chatModels: ChatModelListItem[];
  selectedModelId: ChatModelId;
  modelEffortOverrides: ChatModelEffortOverrides;
  thinkingEnabledOverrides: ChatModelThinkingOverrides;
  disabled?: boolean;
  onChange: (modelId: ChatModelId) => void;
  onEffortChange: (modelId: ChatModelId, effort: ChatModelEffortLevel) => void;
  onThinkingEnabledChange: (modelId: ChatModelId, enabled: boolean) => void;
}

const EFFORT_LABELS: Record<ChatModelEffortLevel, string> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  max: 'Max',
};

const BRAND_ICONS: Partial<Record<Exclude<ChatModelProvider, 'auto' | 'google'>, {
  color: string;
  path: string;
  viewBox?: string;
}>> = {
  openai: {
    color: 'var(--foreground)',
    path: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
  },
  anthropic: {
    color: '#D97757',
    path: 'm105.01 322.07 29.14-16.35.49-1.42-.49-.79h-1.42l-4.87-.3-16.65-.45-14.44-.6-13.99-.75-3.52-.75-3.3-4.35.34-2.17 2.96-1.99 4.24.37 9.37.64 14.06.97 10.2.6 15.11 1.57h2.4l.34-.97-.82-.6-.64-.6-14.55-9.86-15.75-10.42-8.25-6-4.46-3.04-2.25-2.85-.97-6.22 4.05-4.46 5.44.37 1.39.37 5.51 4.24 11.77 9.11 15.37 11.32 2.25 1.87.9-.64.11-.45-1.01-1.69-8.36-15.11-8.92-15.37-3.97-6.37-1.05-3.82c-.37-1.57-.64-2.89-.64-4.5l4.61-6.26 2.55-.82 6.15.82 2.59 2.25 3.82 8.74 6.19 13.76 9.6 18.71 2.81 5.55 1.5 5.14.56 1.57h.97v-.9l.79-10.54 1.46-12.94 1.42-16.65.49-4.69 2.32-5.62 4.61-3.04 3.6 1.72 2.96 4.24-.41 2.74-1.76 11.44-3.45 17.92-2.25 12h1.31l1.5-1.5 6.07-8.06 10.2-12.75 4.5-5.06 5.25-5.59 3.37-2.66h6.37l4.69 6.97-2.1 7.2-6.56 8.32-5.44 7.05-7.8 10.5-4.87 8.4.45.67 1.16-.11 17.62-3.75 9.52-1.72 11.36-1.95 5.14 2.4.56 2.44-2.02 4.99-12.15 3-14.25 2.85-21.22 5.02-.26.19.3.37 9.56.9 4.09.22h10.01l18.64 1.39 4.87 3.22 2.92 3.94-.49 3-7.5 3.82-10.12-2.4-23.62-5.62-8.1-2.02h-1.12v.67l6.75 6.6 12.37 11.17 15.49 14.4.79 3.56-1.99 2.81-2.1-.3-13.61-10.24-5.25-4.61-11.89-10.01h-.79v1.05l2.74 4.01 14.47 21.75.75 6.67-1.05 2.17-3.75 1.31-4.12-.75-8.47-11.89-8.74-13.39-7.05-12-.86.49-4.16 44.81-1.95 2.29-4.5 1.72-3.75-2.85-1.99-4.61 1.99-9.11 2.4-11.89 1.95-9.45 1.76-11.74 1.05-3.9-.07-.26-.86.11-8.85 12.15-13.46 18.19-10.65 11.4-2.55 1.01-4.42-2.29.41-4.09 2.47-3.64 14.74-18.75 8.89-11.62 5.74-6.71-.04-.97h-.34l-39.15 25.42-6.97.9-3-2.81.37-4.61 1.42-1.5 11.77-8.1-.04.04z',
    viewBox: '75 223 155 149',
  },
  deepseek: {
    color: '#5786FE',
    path: 'M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45',
  },
  alibaba: {
    color: '#6950EF',
    path: 'M23.919 14.545 20.817 9.17l1.47-2.544a.56.56 0 0 0 0-.566l-1.633-2.83a.57.57 0 0 0-.49-.283h-6.207L12.487.402a.57.57 0 0 0-.49-.284H8.732a.56.56 0 0 0-.49.284L5.139 5.775h-2.94a.56.56 0 0 0-.49.284L.077 8.887a.56.56 0 0 0 0 .567L3.18 14.83l-1.47 2.545a.56.56 0 0 0 0 .566l1.634 2.83a.57.57 0 0 0 .49.283h6.205l1.47 2.545a.57.57 0 0 0 .49.284h3.266a.57.57 0 0 0 .49-.284l3.104-5.375h2.94a.57.57 0 0 0 .49-.283l1.634-2.828a.55.55 0 0 0-.004-.568M8.733.686l1.634 2.828-1.634 2.828H21.8L20.164 9.17H7.425L5.63 6.06Zm1.306 19.801-6.205-.002 1.634-2.83h3.265L2.201 6.344h3.267q3.182 5.517 6.367 11.032zm10.124-5.66L18.53 12l-6.532 11.315-1.634-2.83c2.129-3.673 4.25-7.351 6.373-11.028h3.592l3.102 5.374z',
  },
  moonshot: {
    color: '#5D6BFF',
    path: 'm1.053 16.91 9.538 2.55a21 20.981 0 0 0 .06 2.031l5.956 1.592a12 11.99 0 0 1-15.554-6.172m-1.02-5.79 11.352 3.035a21 20.981 0 0 0-.469 2.01l10.817 2.89a12 11.99 0 0 1-1.845 2.004L.658 15.918a12 11.99 0 0 1-.625-4.796m1.593-5.146L13.573 9.17a21 20.981 0 0 0-1.01 1.874l11.297 3.02a21 20.981 0 0 1-.67 2.362l-11.55-3.087L.125 10.26a12 11.99 0 0 1 1.499-4.285ZM6.067 1.58l11.285 3.016a21 20.981 0 0 0-1.688 1.719l7.824 2.091a21 20.981 0 0 1 .513 2.664L2.107 5.218a12 11.99 0 0 1 3.96-3.638M21.68 4.866 7.222 1.003A12 11.99 0 0 1 21.68 4.866',
  },
};

function ProviderIcon({
  provider,
  className = 'h-4 w-4',
}: {
  provider: ChatModelProvider;
  className?: string;
}) {
  if (provider === 'auto') {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
        <path d="M12 2.7 14.3 8l5.7 1.7-5.1 2.9.2 5.9-4.4-3.9-5.6 2 2.4-5.4L3.9 6.7l5.9.6Z" fill="#5B8CFF" opacity=".95" />
        <path d="M12 2.7 14.3 8l5.7 1.7-5.1 2.9.2 5.9-4.4-3.9-5.6 2 2.4-5.4L3.9 6.7l5.9.6Z" fill="#8B5CF6" opacity=".72" transform="translate(1.4 1.2) scale(.86)" />
      </svg>
    );
  }

  if (provider === 'google') {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
        <defs>
          <linearGradient id="gemini-icon-gradient" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#34A853" />
            <stop offset="0.28" stopColor="#FBBC04" />
            <stop offset="0.52" stopColor="#EA4335" />
            <stop offset="0.78" stopColor="#4285F4" />
            <stop offset="1" stopColor="#8AB4F8" />
          </linearGradient>
        </defs>
        <path
          d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
          fill="url(#gemini-icon-gradient)"
        />
      </svg>
    );
  }

  const icon = BRAND_ICONS[provider];
  if (!icon) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      style={{ color: icon.color }}
      viewBox={icon.viewBox ?? '0 0 24 24'}
    >
      <path d={icon.path} fill="currentColor" />
    </svg>
  );
}

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 20 20">
      <path d="M5 10.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 20 20">
      <path d="m7.5 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 20 20">
      <path d="m12.5 5-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 20 20">
      <path d="M6.5 8V6.5a3.5 3.5 0 0 1 7 0V8" strokeLinecap="round" />
      <rect x="5.25" y="8" width="9.5" height="7.5" rx="1.6" />
    </svg>
  );
}

export default function ChatModelPicker({
  chatModels,
  selectedModelId,
  modelEffortOverrides,
  thinkingEnabledOverrides,
  disabled = false,
  onChange,
  onEffortChange,
  onThinkingEnabledChange,
}: ChatModelPickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<ModelPickerPopoverElement | null>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  const effortPanelRef = useRef<HTMLDivElement>(null);
  const popoverId = `chat-model-picker-${useId()}`;
  const [isOpen, setIsOpen] = useState(false);
  const [activeEffortModelId, setActiveEffortModelId] =
    useState<ChatModelId | null>(null);
  const [effortPresentation, setEffortPresentation] =
    useState<'side' | 'drilldown'>('side');

  const selectedModel =
    chatModels.find((model) => model.id === selectedModelId)
    ?? chatModels.find((model) => model.available)
    ?? chatModels[0]
    ?? null;
  const isUnavailable = !selectedModel?.available;
  const disabledState = disabled || selectedModel === null;
  const effortMenuModel = activeEffortModelId
    ? chatModels.find((model) => model.id === activeEffortModelId)
    : null;
  const effortMenuConfig =
    effortMenuModel?.available ? effortMenuModel.effort : undefined;
  const getModelEffort = (model: ChatModelListItem) => {
    const effortConfig = model.effort;
    const effortOverride = modelEffortOverrides[model.id] ?? null;

    if (!effortConfig) {
      return 'medium';
    }

    return effortOverride && effortConfig.levels.includes(effortOverride)
      ? effortOverride
      : effortConfig.defaultLevel;
  };
  const getModelThinkingEnabled = (model: ChatModelListItem) => {
    const effortConfig = model.effort;
    const hasOverride = Object.prototype.hasOwnProperty.call(
      thinkingEnabledOverrides,
      model.id
    );

    if (!effortConfig) {
      return true;
    }

    return hasOverride
      ? thinkingEnabledOverrides[model.id] ?? effortConfig.defaultThinkingEnabled
      : effortConfig.defaultThinkingEnabled;
  };
  const effortMenuActiveEffort =
    effortMenuModel ? getModelEffort(effortMenuModel) : 'medium';
  const effortMenuThinkingEnabled =
    effortMenuModel ? getModelThinkingEnabled(effortMenuModel) : true;

  useLayoutEffect(() => {
    const panels = panelsRef.current;
    const effortPanel = effortPanelRef.current;
    const popover = popoverRef.current;

    if (!effortMenuConfig || !effortMenuModel || !panels || !effortPanel || !popover) {
      return;
    }

    const positionEffortPanel = () => {
      const panelsRect = panels.getBoundingClientRect();
      const anchor = panels.querySelector<HTMLElement>(
        `[data-model-id="${effortMenuModel.id}"]`
      );
      const anchorRect = anchor?.getBoundingClientRect();
      const effortPanelHeight = effortPanel.offsetHeight;
      const anchorTop = anchorRect ? anchorRect.top - panelsRect.top : 0;
      const bottomOverflow =
        panelsRect.top
        + anchorTop
        + effortPanelHeight
        - (window.innerHeight - VIEWPORT_GUTTER_PX);
      let top = anchorTop + (bottomOverflow > 0 ? -bottomOverflow : 0);
      const topOverflow = panelsRect.top + top - VIEWPORT_GUTTER_PX;

      if (topOverflow < 0) {
        top -= topOverflow;
      }

      popover.style.setProperty('--chat-model-effort-top', `${Math.round(top)}px`);
    };

    positionEffortPanel();
    window.addEventListener('resize', positionEffortPanel);

    return () => {
      window.removeEventListener('resize', positionEffortPanel);
    };
  }, [
    effortMenuActiveEffort,
    effortMenuConfig,
    effortMenuModel,
    effortMenuThinkingEnabled,
  ]);

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

    const triggerRect = trigger.getBoundingClientRect();
    const panelWidth = Math.min(
      MAIN_PANEL_WIDTH_PX,
      window.innerWidth - VIEWPORT_GUTTER_PX * 2
    );
    const left = Math.min(
      Math.max(triggerRect.right - panelWidth, VIEWPORT_GUTTER_PX),
      window.innerWidth - panelWidth - VIEWPORT_GUTTER_PX
    );
    const right = window.innerWidth - left - panelWidth;
    const bottom = Math.max(
      VIEWPORT_GUTTER_PX,
      window.innerHeight - triggerRect.top + POPOVER_OFFSET_PX
    );
    const rightAvailable =
      window.innerWidth
      - VIEWPORT_GUTTER_PX
      - (left + panelWidth + PANEL_GAP_PX);
    const leftAvailable = left - VIEWPORT_GUTTER_PX - PANEL_GAP_PX;
    const maxEffortSpace = Math.max(rightAvailable, leftAvailable);
    const nextEffortPresentation =
      window.innerWidth <= DRILLDOWN_BREAKPOINT_PX
      || maxEffortSpace < MIN_EFFORT_PANEL_WIDTH_PX
        ? 'drilldown'
        : 'side';
    const effortPlacement =
      rightAvailable >= EFFORT_PANEL_WIDTH_PX || rightAvailable >= leftAvailable
        ? 'right'
        : 'left';
    const availableEffortSpace =
      effortPlacement === 'right'
        ? rightAvailable
        : leftAvailable;
    const effortWidth = Math.min(
      EFFORT_PANEL_WIDTH_PX,
      Math.max(MIN_EFFORT_PANEL_WIDTH_PX, availableEffortSpace)
    );

    setEffortPresentation(nextEffortPresentation);
    popover.style.setProperty('--chat-model-picker-right', `${right}px`);
    popover.style.setProperty('--chat-model-picker-bottom', `${bottom}px`);
    popover.style.setProperty('--chat-model-effort-width', `${effortWidth}px`);
    popover.style.setProperty('--chat-model-effort-top', '0px');
    popover.dataset.effortPlacement = effortPlacement;
    popover.dataset.effortMode = nextEffortPresentation;

    (
      popover as unknown as {
        showPopover: (options?: { source?: HTMLElement }) => void;
      }
    ).showPopover({ source: trigger });
  };

  const selectModel = (model: ChatModelListItem) => {
    if (!model.available) {
      return;
    }

    onChange(model.id);

    if (effortPresentation === 'drilldown' && model.effort) {
      setActiveEffortModelId(model.id);
      return;
    }

    setActiveEffortModelId(model.effort ? model.id : null);
  };

  const selectEffort = (
    effort: ChatModelEffortLevel,
    model: ChatModelListItem
  ) => {
    if (!model.available) {
      return;
    }

    if (model.id !== selectedModelId) {
      onChange(model.id);
    }

    onEffortChange(model.id, effort);
  };

  const isEffortDrilldown =
    effortPresentation === 'drilldown' && Boolean(effortMenuModel && effortMenuConfig);

  const effortControls = effortMenuModel && effortMenuConfig ? (
    <>
      <div className="px-2.5 pb-2 pt-1.5 text-[12px] leading-snug text-muted">
        Higher effort is more thorough, slower, and uses more tokens.
      </div>

      <div role="menu" aria-label="Model effort" className="space-y-0.5">
        {effortMenuConfig.levels.map((effort) => {
          const active = effort === effortMenuActiveEffort;

          return (
            <button
              key={effort}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              onClick={() => selectEffort(effort, effortMenuModel)}
              className={`flex h-9 w-full items-center justify-between rounded-xl px-2.5 text-left transition ${
                active
                  ? 'bg-foreground/[0.055]'
                  : 'hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.035]'
              }`}
            >
              <span className="flex items-center gap-2 text-[13px] font-medium">
                {EFFORT_LABELS[effort]}
                {effort === effortMenuConfig.defaultLevel ? (
                  <span className="rounded bg-foreground/[0.065] px-1.5 py-0.5 text-[10px] text-muted">
                    Default
                  </span>
                ) : null}
              </span>
              {active ? <CheckIcon className="h-3.5 w-3.5 text-accent" /> : null}
            </button>
          );
        })}
      </div>

      {effortMenuConfig.supportsThinkingToggle ? (
        <div className="mt-1 border-t border-border-subtle pt-1">
          <button
            type="button"
            role="switch"
            aria-checked={effortMenuThinkingEnabled}
            onClick={() => onThinkingEnabledChange(
              effortMenuModel.id,
              !effortMenuThinkingEnabled
            )}
            className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.035]"
          >
            <span>
              <span className="block text-[13px] font-medium text-foreground">
                Thinking
              </span>
              <span className="block text-[11px] font-medium text-muted/75">
                Use deeper reasoning when available
              </span>
            </span>
            <span
              className={`relative h-5 w-9 flex-shrink-0 rounded-full transition ${
                effortMenuThinkingEnabled ? 'bg-accent' : 'bg-foreground/[0.16]'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition ${
                  effortMenuThinkingEnabled ? 'left-4' : 'left-0.5'
                }`}
              />
            </span>
          </button>
        </div>
      ) : null}
    </>
  ) : null;

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
        className={`inline-flex h-8 min-w-[8rem] items-center justify-between gap-2 rounded-lg border px-3 text-left font-sans font-medium transition sm:min-w-[9.25rem] ${
          isOpen
            ? 'border-foreground/[0.08] bg-foreground/[0.055] text-foreground'
            : 'border-transparent bg-background text-foreground/88 hover:bg-foreground/[0.035] hover:text-foreground'
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-accent">
            {selectedModel ? <ProviderIcon provider={selectedModel.iconKey} /> : null}
          </span>
          <span className="truncate text-[13px] text-foreground">
            {selectedModel?.label ?? 'No models'}
          </span>
          {isUnavailable ? (
            <span className="hidden text-[10px] font-medium text-muted/80 sm:inline">
              Unavailable
            </span>
          ) : null}
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
          <path d="M5.5 7.5L10 12l4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className="chat-model-picker-popover"
        onToggle={(event) => {
          const toggleEvent = event as unknown as ToggleEvent;
          const nextOpen = toggleEvent.newState === 'open';
          setIsOpen(nextOpen);
          if (!nextOpen) {
            setActiveEffortModelId(null);
          }
        }}
      >
        <div
          ref={panelsRef}
          className="chat-model-picker-panels font-sans text-foreground"
          onMouseLeave={() => {
            if (effortPresentation === 'side') {
              setActiveEffortModelId(null);
            }
          }}
        >
          <div className="w-full rounded-[1.1rem] bg-background p-1.5 shadow-[0_16px_36px_rgba(15,23,42,0.12)] ring-1 ring-black/[0.06] dark:shadow-[0_18px_40px_rgba(0,0,0,0.28)] dark:ring-white/[0.06]">
            {isEffortDrilldown && effortMenuModel ? (
              <>
                <div className="px-1 pb-1">
                  <button
                    type="button"
                    onClick={() => setActiveEffortModelId(null)}
                    className="flex h-8 w-full items-center gap-1 rounded-xl px-1.5 text-left text-[12px] font-medium text-muted transition hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.035]"
                  >
                    <ChevronLeftIcon />
                    Models
                  </button>
                </div>
                <div className="px-2.5 pb-2 pt-0.5">
                  <p className="text-[11px] font-medium text-muted/75">
                    {effortMenuModel.label} effort
                  </p>
                </div>
                {effortControls}
              </>
            ) : (
              <>
                <div className="px-2.5 pb-1.5 pt-1">
                  <p className="text-[11px] font-medium text-muted/75">Model</p>
                </div>

                <div role="menu" aria-label="Chat models" className="space-y-0.5">
                  {chatModels.map((model) => {
                    const active = model.id === selectedModelId;

                    return (
                      <button
                        key={model.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        disabled={!model.available}
                        data-model-id={model.id}
                        onMouseEnter={() => {
                          if (effortPresentation === 'side') {
                            setActiveEffortModelId(
                              model.available && model.effort ? model.id : null
                            );
                          }
                        }}
                        onFocus={() => {
                          if (effortPresentation === 'side') {
                            setActiveEffortModelId(
                              model.available && model.effort ? model.id : null
                            );
                          }
                        }}
                        onClick={() => selectModel(model)}
                        className={`flex min-h-10 w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left transition outline-none ${
                          active
                            ? 'bg-foreground/[0.055]'
                            : 'hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.035]'
                        } disabled:cursor-not-allowed disabled:opacity-45`}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-foreground">
                            <ProviderIcon provider={model.iconKey} />
                          </span>
                          <span className="min-w-0">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-[13px] font-medium text-foreground">
                                {model.label}
                              </span>
                              {model.badge ? (
                                <span className="rounded bg-foreground/[0.055] px-1.5 py-0.5 text-[10px] font-medium text-muted">
                                  {model.badge}
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </span>

                        {!model.available ? (
                          <span className="ml-4 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted">
                            <LockIcon />
                          </span>
                        ) : model.effort ? (
                          <span className="ml-4 flex h-7 flex-shrink-0 items-center gap-1 rounded-full text-muted">
                            {active ? (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/[0.05] text-accent">
                                <CheckIcon />
                              </span>
                            ) : null}
                            <ChevronRightIcon />
                          </span>
                        ) : active ? (
                          <span className="ml-4 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-foreground/[0.05] text-accent">
                            <CheckIcon />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

          </div>

          {!isEffortDrilldown && effortMenuModel && effortMenuConfig ? (
            <div ref={effortPanelRef} className="chat-model-effort-panel rounded-[1.1rem] bg-background p-1.5 shadow-[0_16px_36px_rgba(15,23,42,0.12)] ring-1 ring-black/[0.06] dark:shadow-[0_18px_40px_rgba(0,0,0,0.28)] dark:ring-white/[0.06]">
              {effortControls}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
