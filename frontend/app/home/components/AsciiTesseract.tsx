'use client';

import { useEffect, useRef } from 'react';

type Point3 = {
  x: number;
  y: number;
  z: number;
};

type HyperPoint = Point3 & {
  w: number;
};

type ProjectedPoint = Point3 & {
  depth: number;
};

type ScreenPoint = {
  x: number;
  y: number;
  depth: number;
};

type TriangleSample = {
  depth: number;
  light: number;
};

const LOOP_DURATION_MS = 30_000;
const TARGET_FPS = 4;
const DESKTOP_COLUMNS = 40;
const MOBILE_COLUMNS = 32;
const GLYPH_RAMP = " .·,:;i1tfLCG08@";

const VERTICES: HyperPoint[] = Array.from({ length: 16 }, (_, index) => ({
  x: index & 1 ? 1 : -1,
  y: index & 2 ? 1 : -1,
  z: index & 4 ? 1 : -1,
  w: index & 8 ? 1 : -1,
}));

const EDGES = VERTICES.flatMap((_, index) =>
  [0, 1, 2, 3]
    .map((axis) => index ^ (1 << axis))
    .filter((target) => index < target)
    .map((target) => [index, target] as const)
);

const FACES = createFaces();

function createFaces(): number[][] {
  const faces: number[][] = [];

  for (let firstAxis = 0; firstAxis < 4; firstAxis += 1) {
    for (let secondAxis = firstAxis + 1; secondAxis < 4; secondAxis += 1) {
      const fixedAxes = [0, 1, 2, 3].filter(
        (axis) => axis !== firstAxis && axis !== secondAxis
      );

      for (let firstFixedBit = 0; firstFixedBit <= 1; firstFixedBit += 1) {
        for (let secondFixedBit = 0; secondFixedBit <= 1; secondFixedBit += 1) {
          const base =
            (firstFixedBit << fixedAxes[0]) |
            (secondFixedBit << fixedAxes[1]);

          faces.push([
            base,
            base | (1 << firstAxis),
            base | (1 << firstAxis) | (1 << secondAxis),
            base | (1 << secondAxis),
          ]);
        }
      }
    }
  }

  return faces;
}

function rotatePlane(
  first: number,
  second: number,
  angle: number
): [number, number] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  return [first * cosine - second * sine, first * sine + second * cosine];
}

function projectVertex(vertex: HyperPoint, phase: number): ProjectedPoint {
  let { x, y, z, w } = vertex;

  [x, w] = rotatePlane(x, w, phase + 0.48);
  [y, z] = rotatePlane(y, z, -phase + 0.7);
  [z, w] = rotatePlane(z, w, phase + 0.18);
  [x, y] = rotatePlane(x, y, phase + 0.32);

  const fourthDimension = 3.5 / (4.7 - w);
  x *= fourthDimension;
  y *= fourthDimension;
  z *= fourthDimension;

  const perspective = 3.2 / (4.2 - z);

  return {
    x: x * perspective,
    y: y * perspective,
    z,
    depth: z,
  };
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = clamp((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
}

function distanceToSegment(
  x: number,
  y: number,
  first: ScreenPoint,
  second: ScreenPoint
) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const lengthSquared = dx * dx + dy * dy;
  const progress =
    lengthSquared === 0
      ? 0
      : clamp(((x - first.x) * dx + (y - first.y) * dy) / lengthSquared);
  const closestX = first.x + dx * progress;
  const closestY = first.y + dy * progress;

  return {
    distance: Math.hypot(x - closestX, y - closestY),
    depth: first.depth + (second.depth - first.depth) * progress,
  };
}

function sampleTriangle(
  x: number,
  y: number,
  first: ScreenPoint,
  second: ScreenPoint,
  third: ScreenPoint
): TriangleSample | null {
  const denominator =
    (second.y - third.y) * (first.x - third.x) +
    (third.x - second.x) * (first.y - third.y);

  if (Math.abs(denominator) < 0.0001) return null;

  const firstWeight =
    ((second.y - third.y) * (x - third.x) +
      (third.x - second.x) * (y - third.y)) /
    denominator;
  const secondWeight =
    ((third.y - first.y) * (x - third.x) +
      (first.x - third.x) * (y - third.y)) /
    denominator;
  const thirdWeight = 1 - firstWeight - secondWeight;

  if (
    firstWeight < -0.001 ||
    secondWeight < -0.001 ||
    thirdWeight < -0.001
  ) {
    return null;
  }

  const area = Math.abs(denominator) * 0.5;

  return {
    depth:
      first.depth * firstWeight +
      second.depth * secondWeight +
      third.depth * thirdWeight,
    light: clamp(area / 18_000, 0.15, 1),
  };
}

function sampleFrontFace(
  x: number,
  y: number,
  screenVertices: ScreenPoint[]
): TriangleSample | null {
  let nearest: TriangleSample | null = null;

  for (const face of FACES) {
    const first = screenVertices[face[0]];
    const second = screenVertices[face[1]];
    const third = screenVertices[face[2]];
    const fourth = screenVertices[face[3]];
    const sample =
      sampleTriangle(x, y, first, second, third) ??
      sampleTriangle(x, y, first, third, fourth);

    if (sample && (!nearest || sample.depth > nearest.depth)) {
      nearest = sample;
    }
  }

  return nearest;
}

function glyphFor(value: number) {
  const index = Math.min(
    GLYPH_RAMP.length - 1,
    Math.floor(clamp(value) * GLYPH_RAMP.length)
  );

  return GLYPH_RAMP[index];
}

export default function AsciiTesseract() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animationFrame: number | null = null;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let reducedMotion = motionQuery.matches;
    let palette = { foreground: '', accent: '' };
    let lastFrameTime = 0;
    const startTime = performance.now();

    const updatePalette = () => {
      const styles = getComputedStyle(canvas);
      palette = {
        foreground: styles.getPropertyValue('--foreground').trim(),
        accent: styles.getPropertyValue('--accent').trim(),
      };
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(bounds.width));
      height = Math.max(1, Math.floor(bounds.height));
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const render = (time: number) => {
      const elapsed = reducedMotion ? 0 : Math.max(time - startTime, 0);
      const phase =
        ((elapsed % LOOP_DURATION_MS) / LOOP_DURATION_MS) * Math.PI * 2;
      const projected = VERTICES.map((vertex) =>
        projectVertex(vertex, phase)
      );
      const minimumDepth = Math.min(...projected.map((point) => point.depth));
      const maximumDepth = Math.max(...projected.map((point) => point.depth));
      const depthRange = Math.max(0.001, maximumDepth - minimumDepth);
      const projectionBounds = projected.reduce(
        (bounds, point) => ({
          x: Math.max(bounds.x, Math.abs(point.x)),
          y: Math.max(bounds.y, Math.abs(point.y)),
        }),
        { x: 1, y: 1 }
      );
      const scale = Math.min(
        (width * 0.43) / projectionBounds.x,
        (height * 0.43) / projectionBounds.y
      );
      const screenVertices: ScreenPoint[] = projected.map((point) => ({
        x: width / 2 + point.x * scale,
        y: height / 2 + point.y * scale,
        depth: (point.depth - minimumDepth) / depthRange,
      }));
      const columns = width < 520 ? MOBILE_COLUMNS : DESKTOP_COLUMNS;
      const cellWidth = width / columns;
      const rows = Math.max(24, Math.round(height / (cellWidth * 1.55)));
      const cellHeight = height / rows;
      const edgeWidth = Math.max(cellWidth, cellHeight) * 1.16;

      context.clearRect(0, 0, width, height);
      context.font = `450 ${Math.min(cellHeight * 0.88, cellWidth * 1.55)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';

      for (let row = 0; row < rows; row += 1) {
        const y = (row + 0.5) * cellHeight;

        for (let column = 0; column < columns; column += 1) {
          const x = (column + 0.5) * cellWidth;
          const face = sampleFrontFace(x, y, screenVertices);
          let edgeField = 0;
          let edgeDepth = 0;

          for (const [firstIndex, secondIndex] of EDGES) {
            const edge = distanceToSegment(
              x,
              y,
              screenVertices[firstIndex],
              screenVertices[secondIndex]
            );
            const proximity =
              1 - smoothstep(edgeWidth * 0.12, edgeWidth, edge.distance);
            const depthLight = 0.5 + edge.depth * 0.5;
            const strength = proximity * depthLight;

            if (strength > edgeField) {
              edgeField = strength;
              edgeDepth = edge.depth;
            }
          }

          if (face && edgeDepth + 0.055 < face.depth) {
            edgeField *= 0.28;
          }

          const faceField = face
            ? 0.12 + face.depth * 0.14 + face.light * 0.055
            : 0;
          const geometryField = Math.max(faceField, edgeField);

          if (geometryField < 0.025) continue;

          const normalizedX = x / width;
          const normalizedY = y / height;
          const flow =
            0.5 +
            Math.sin(
              normalizedX * Math.PI * 5.5 -
                normalizedY * Math.PI * 4 +
                phase * 2
            ) *
              0.5;
          const ripple =
            0.5 +
            Math.cos(
              Math.hypot(normalizedX - 0.5, normalizedY - 0.5) *
                Math.PI *
                10 -
                phase * 3
            ) *
              0.5;
          const field =
            geometryField *
            (0.48 + flow * 0.34 + ripple * 0.18);
          const glyph = glyphFor(field);

          if (glyph === ' ') continue;

          const accentBand =
            edgeField > 0.24 &&
            Math.abs(
              Math.sin(
                normalizedX * Math.PI * 3 -
                  normalizedY * Math.PI * 2 +
                  phase
              )
            ) < 0.11;

          context.fillStyle = accentBand
            ? palette.accent
            : palette.foreground;
          context.globalAlpha = face && edgeField < 0.16 ? 0.58 : 0.92;
          context.fillText(glyph, x, y);
        }
      }

      context.globalAlpha = 1;
    };

    const animate = (time: number) => {
      if (time - lastFrameTime >= 1000 / TARGET_FPS) {
        render(time);
        lastFrameTime = time;
      }
      animationFrame = requestAnimationFrame(animate);
    };

    const updateMotionPreference = () => {
      reducedMotion = motionQuery.matches;

      if (reducedMotion && animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }

      render(performance.now());

      if (!reducedMotion && animationFrame === null) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      render(performance.now());
    });
    const themeObserver = new MutationObserver(() => {
      updatePalette();
      render(performance.now());
    });

    resize();
    updatePalette();
    render(performance.now());

    if (!reducedMotion) {
      animationFrame = requestAnimationFrame(animate);
    }

    resizeObserver.observe(canvas);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    motionQuery.addEventListener('change', updateMotionPreference);

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      motionQuery.removeEventListener('change', updateMotionPreference);
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="ascii-tesseract"
      className="ascii-tesseract h-[clamp(18rem,36vh,25rem)] w-[min(100%,40rem)] sm:h-[clamp(24rem,48vh,34rem)] sm:w-[min(100%,52rem)]"
    />
  );
}
