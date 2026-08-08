export const THREAD_PANEL_MIN_WIDTH_PX = 200;
export const THREAD_PANEL_DEFAULT_WIDTH_PX = 460;
export const THREAD_PANEL_MAX_WIDTH_PX = 720;

export function clampThreadPanelWidthPx(value: number) {
  if (!Number.isFinite(value)) {
    return THREAD_PANEL_DEFAULT_WIDTH_PX;
  }

  return Math.min(
    THREAD_PANEL_MAX_WIDTH_PX,
    Math.max(THREAD_PANEL_MIN_WIDTH_PX, Math.round(value))
  );
}
