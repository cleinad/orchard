type HomePerformanceInstrumentation = {
  counters: Record<string, number>;
  gauges: Record<string, number>;
};

declare global {
  interface Window {
    __orchardHomePerformance?: HomePerformanceInstrumentation;
  }
}

export function recordHomePerformanceEvent(name: string) {
  if (typeof window === 'undefined') return;
  const instrumentation = window.__orchardHomePerformance;
  if (!instrumentation) return;
  instrumentation.counters[name] = (instrumentation.counters[name] ?? 0) + 1;
}

export function setHomePerformanceGauge(name: string, value: number) {
  if (typeof window === 'undefined') return;
  const instrumentation = window.__orchardHomePerformance;
  if (!instrumentation) return;
  instrumentation.gauges[name] = value;
}
