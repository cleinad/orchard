import { useCallback, useRef, useEffect } from 'react';

interface UseAudioVisualizationProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
}

export function useAudioVisualization({
  analyser,
  isActive,
}: UseAudioVisualizationProps) {
  const lineRef = useRef<SVGPolylineElement | null>(null);
  const glowRef = useRef<SVGPolylineElement | null>(null);
  const visualRef = useRef<HTMLDivElement | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef(0);

  const animate = useCallback(() => {
    const data = dataRef.current;
    const line = lineRef.current;
    const glow = glowRef.current;
    const visual = visualRef.current;
    if (!analyser || !data || !line || !glow || !visual) {
      return;
    }

    analyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const value = (data[i] - 128) / 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / data.length);
    const intensity = Math.min(1, rms * 3.2);
    const baseAmplitude = 6 + intensity * 18;
    const width = 240;
    const height = 60;
    const mid = height / 2;
    const segments = 48;
    phaseRef.current += 0.08 + intensity * 0.18;

    const points: string[] = [];
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const wave =
        Math.sin(t * Math.PI * 4 + phaseRef.current) +
        0.55 * Math.sin(t * Math.PI * 9 - phaseRef.current * 1.2);
      const falloff = Math.sin(Math.PI * t);
      const y = mid + wave * baseAmplitude * falloff;
      const x = t * width;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }

    const pointString = points.join(' ');
    line.setAttribute('points', pointString);
    glow.setAttribute('points', pointString);
    visual.style.setProperty('--mic-glow', (0.18 + intensity * 0.75).toFixed(2));

    rafRef.current = requestAnimationFrame(animate);
  }, [analyser]);

  useEffect(() => {
    if (isActive && analyser) {
      dataRef.current = new Uint8Array(analyser.fftSize) as Uint8Array;
      rafRef.current = requestAnimationFrame(animate);
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (visualRef.current) {
        visualRef.current.style.setProperty('--mic-glow', '0');
      }
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isActive, analyser, animate]);

  return {
    lineRef,
    glowRef,
    visualRef,
  };
}
