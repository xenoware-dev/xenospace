import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

export interface IndicatorBox {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Tracks the box of the active nav item (the one React Router marks with
 * `aria-current="page"`) inside a container, so a single pill can slide to it
 * on every navigation instead of each row toggling its own background.
 *
 * Returns `null` while nothing in the container is active — the caller then
 * hides the pill rather than parking it at the origin.
 */
export function useActiveIndicator<T extends HTMLElement>() {
  const containerRef = useRef<T>(null)
  const [box, setBox] = useState<IndicatorBox | null>(null)
  // The first measurement is applied without a transition, otherwise the pill
  // would slide in from the container's top-left on mount.
  const [ready, setReady] = useState(false)
  const { pathname } = useLocation()

  const measure = useCallback(() => {
    const container = containerRef.current
    const active = container?.querySelector<HTMLElement>('[aria-current="page"]')

    if (!container || !active) {
      setBox(null)
      return
    }

    setBox({
      top: active.offsetTop,
      left: active.offsetLeft,
      width: active.offsetWidth,
      height: active.offsetHeight,
    })
  }, [])

  useLayoutEffect(measure, [measure, pathname])

  // Re-measure whenever the layout can shift: the navigator collapsing, a
  // role-gated group appearing, the window resizing, fonts landing.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(measure)
    observer.observe(container)
    for (const child of Array.from(container.children)) observer.observe(child)

    return () => observer.disconnect()
  }, [measure])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return { containerRef, box, ready, measure }
}
