'use client';
import { useEffect, useRef, type RefObject } from 'react';
import type { PublicReadingSignal } from '@future-flow/contracts';
export function PublicReadingProgress({
  slug,
  available,
  container,
  emit,
}: {
  slug: string;
  available: boolean;
  container: RefObject<HTMLDivElement | null>;
  emit: (signal: PublicReadingSignal) => Promise<void>;
}) {
  const activeMs = useRef(0);
  useEffect(() => {
    activeMs.current = 0;
  }, [slug]);
  useEffect(() => {
    if (!available) return;
    let previous = performance.now();
    function measure() {
      const now = performance.now(),
        elapsed = Math.min(2000, now - previous);
      previous = now;
      const element = container.current;
      if (!element || document.visibilityState !== 'visible') return;
      const rect = element.getBoundingClientRect();
      if (
        rect.height <= 0 ||
        rect.bottom <= 0 ||
        rect.top >= window.innerHeight
      )
        return;
      activeMs.current += elapsed;
      const depth = Math.max(
        0,
        Math.min(1, (window.innerHeight - rect.top) / rect.height),
      );
      for (const [threshold, signal] of [
        [0.25, 'depth_25'],
        [0.5, 'depth_50'],
        [0.75, 'depth_75'],
      ] as const)
        if (depth >= threshold) void emit(signal);
      if (depth >= 1 && activeMs.current >= 30000) void emit('end_reached');
    }
    const timer = setInterval(measure, 1000);
    return () => clearInterval(timer);
  }, [available, container, emit]);
  return null;
}
