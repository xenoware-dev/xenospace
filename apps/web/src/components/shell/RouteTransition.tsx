import { useEffect, useRef, useState, type RefObject } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';

/** How long the outgoing view fades before the incoming one mounts. */
const LEAVE_MS = 160;

/**
 * Cross-fades routed pages, so switching section settles instead of snapping.
 * The painted page is held one beat behind the router: on navigation the
 * current view fades out, then the new one mounts with the shared enter motion.
 *
 * Only the path counts as a navigation — a query-string change (a filter, a
 * `?new=1` dialog) must not fade the page it is changing.
 */
export function RouteTransition({ scrollRef }: { scrollRef?: RefObject<HTMLElement | null> }) {
  const outlet = useOutlet();
  const { pathname } = useLocation();

  // The outlet element is recreated every render; the timer reads it from a
  // ref rather than depending on it, which would restart the timer.
  const latest = useRef(outlet);
  useEffect(() => {
    latest.current = outlet;
  });

  const [view, setView] = useState(() => ({ key: pathname, node: outlet }));
  const [stage, setStage] = useState<'enter' | 'leave'>('enter');

  useEffect(() => {
    if (pathname === view.key) return;
    setStage('leave');
    const timer = window.setTimeout(() => {
      setView({ key: pathname, node: latest.current });
      setStage('enter');
      scrollRef?.current?.scrollTo({ top: 0 });
    }, LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [pathname, view.key, scrollRef]);

  // Same path, new outlet (e.g. a search param changed): render it live.
  const node = pathname === view.key ? outlet : view.node;

  return (
    <div key={view.key} data-stage={stage} className="route-view h-full">
      {node}
    </div>
  );
}
