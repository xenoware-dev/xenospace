import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

export interface IndicatorBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Tracks the box of the active nav item — the one React Router marks with
 * `aria-current="page"` — inside a container, so a single pill can slide to it
 * on every navigation instead of each row toggling its own background.
 *
 * Returns `null` while nothing in the container is active; the caller then
 * hides the pill rather than parking it at the origin.
 */
export function useActiveIndicator<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);
  const [box, setBox] = useState<IndicatorBox | null>(null);
  // The first measurement applies without a transition, or the pill would slide
  // in from the container's top-left corner on mount.
  const [ready, setReady] = useState(false);
  const { pathname } = useLocation();

  const measure = useCallback(() => {
    const container = containerRef.current;
    const active = container?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!container || !active) {
      setBox(null);
      return;
    }
    /*
     * Bounding boxes, not offsetTop: offsets are relative to the nearest
     * positioned ancestor, and a tooltip wrapper around a rail icon is one —
     * which parked the rail's pill at the top of the rail instead of under the
     * active icon. The container's scroll offset is added back so the pill
     * stays aligned inside a scrolled list.
     */
    const outer = container.getBoundingClientRect();
    const inner = active.getBoundingClientRect();
    setBox({
      top: inner.top - outer.top + container.scrollTop,
      left: inner.left - outer.left + container.scrollLeft,
      width: inner.width,
      height: inner.height,
    });
  }, []);

  useLayoutEffect(measure, [measure, pathname]);

  // Re-measure whenever layout can shift: the navigator collapsing, a badge
  // appearing, the window resizing, the web font landing.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const child of Array.from(container.children)) observer.observe(child);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return { containerRef, box, ready, measure };
}

/** Inline style that places an indicator over the measured box. */
export function indicatorStyle(box: IndicatorBox | null): React.CSSProperties {
  return {
    transform: `translate3d(${box?.left ?? 0}px, ${box?.top ?? 0}px, 0)`,
    width: box?.width ?? 0,
    height: box?.height ?? 0,
  };
}
