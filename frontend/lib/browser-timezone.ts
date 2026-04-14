export function getBrowserTimeZone() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const normalized = typeof timeZone === 'string' ? timeZone.trim() : '';
    return normalized || undefined;
  } catch {
    return undefined;
  }
}
