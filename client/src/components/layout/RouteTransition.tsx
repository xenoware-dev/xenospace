import { useEffect, useRef, useState, type RefObject } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'

/** How long the outgoing view fades before the incoming one is mounted. */
const LEAVE_MS = 180

interface RouteTransitionProps {
  /** Scroll container to send back to the top when the view swaps. */
  scrollRef?: RefObject<HTMLElement | null>
}

/**
 * Cross-fades routed pages so switching section from the rail or the navigator
 * settles instead of snapping. The painted page is held one beat behind the
 * router: on navigation the current element fades out, then the new one is
 * mounted with the shared enter animation.
 */
export function RouteTransition({ scrollRef }: RouteTransitionProps) {
  const outlet = useOutlet()
  const { pathname } = useLocation()

  // The outlet element is recreated every render, so the timer below reads it
  // from a ref rather than depending on it (which would restart the timer).
  const latestOutlet = useRef(outlet)
  useEffect(() => {
    latestOutlet.current = outlet
  })

  const [view, setView] = useState(() => ({ key: pathname, node: outlet }))
  const [stage, setStage] = useState<'enter' | 'leave'>('enter')

  useEffect(() => {
    if (pathname === view.key) return

    setStage('leave')
    const timer = window.setTimeout(() => {
      setView({ key: pathname, node: latestOutlet.current })
      setStage('enter')
      scrollRef?.current?.scrollTo({ top: 0 })
    }, LEAVE_MS)

    return () => window.clearTimeout(timer)
  }, [pathname, view.key, scrollRef])

  return (
    // Keying on the path remounts the wrapper, which replays the enter animation.
    <div key={view.key} data-stage={stage} className="route-view">
      {view.node}
    </div>
  )
}
