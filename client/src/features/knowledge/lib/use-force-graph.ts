import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * A force-directed layout, written here rather than pulled in, because the
 * whole simulation is about sixty lines and a graph library would be the
 * largest dependency in the app for one view.
 *
 * It is the standard three-force model — nodes repel each other, links pull
 * their ends together, and a weak pull toward the middle stops the whole
 * thing drifting off screen — integrated with velocity damping and an `alpha`
 * that cools to a stop. Cooling matters: a layout that simmers forever burns
 * a core and never lets the reader's eye settle.
 */

/** How far apart a linked pair wants to sit. */
const LINK_DISTANCE = 64
/** Negative is repulsion. Scaled by node size, so hubs clear more room. */
const CHARGE = -240
const CENTER_STRENGTH = 0.045
const VELOCITY_DECAY = 0.62
const ALPHA_DECAY = 0.0228
const ALPHA_MIN = 0.004
/** Ticks run up front when the reader has asked for reduced motion. */
const STATIC_TICKS = 320
/** Repulsion is capped at close range so a near-collision cannot fling a node. */
const MIN_DISTANCE_SQ = 36

export interface ForceNodeInput {
  id: string
  degree: number
}

export interface ForceEdgeInput {
  source: string
  target: string
}

export interface ForcePosition {
  id: string
  x: number
  y: number
}

interface SimNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  /** Set while the node is held by the pointer; the forces leave it alone. */
  fx: number | null
  fy: number | null
  radius: number
}

interface UseForceGraphOptions {
  nodes: ForceNodeInput[]
  edges: ForceEdgeInput[]
  width: number
  height: number
  /** Node radius for a given degree, so collision matches what is drawn. */
  radiusOf: (degree: number) => number
}

/**
 * A sunflower spiral of starting positions. Seeding every node at the centre
 * leaves the repulsion perfectly balanced and the graph never unfolds; a
 * spiral breaks that symmetry without looking arranged.
 */
function seedPosition(index: number, cx: number, cy: number) {
  const radius = 12 * Math.sqrt(index + 0.5)
  const angle = index * Math.PI * (3 - Math.sqrt(5))
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function useForceGraph({
  nodes,
  edges,
  width,
  height,
  radiusOf,
}: UseForceGraphOptions) {
  const simRef = useRef<SimNode[]>([])
  const indexRef = useRef(new Map<string, SimNode>())
  const alphaRef = useRef(1)
  const frameRef = useRef<number | null>(null)

  /**
   * A fresh snapshot of where everything is, published once per frame. The
   * simulation mutates its own nodes in place, but what leaves the hook is a
   * new array every tick: a component must never read a mutable ref while it
   * renders, or React is free to decide nothing changed and skip the repaint.
   */
  const [positions, setPositions] = useState<ForcePosition[]>([])
  const [isSettling, setIsSettling] = useState(true)

  const publish = useCallback(() => {
    setPositions(simRef.current.map((node) => ({ id: node.id, x: node.x, y: node.y })))
  }, [])

  const signature = useMemo(
    () => `${nodes.map((node) => node.id).join(',')}|${edges.length}`,
    [nodes, edges]
  )

  // Rebuild only when the graph's shape actually changes. A node already on
  // screen keeps where it is, so filtering does not shuffle the whole layout.
  useEffect(() => {
    const cx = width / 2
    const cy = height / 2
    const previous = indexRef.current
    const next = new Map<string, SimNode>()

    simRef.current = nodes.map((node, index) => {
      const existing = previous.get(node.id)
      const seeded = existing ?? { ...seedPosition(index, cx, cy), vx: 0, vy: 0 }

      const sim: SimNode = {
        id: node.id,
        x: seeded.x,
        y: seeded.y,
        vx: seeded.vx,
        vy: seeded.vy,
        fx: null,
        fy: null,
        radius: radiusOf(node.degree),
      }

      next.set(node.id, sim)
      return sim
    })

    indexRef.current = next
    alphaRef.current = 1
    publish()
    setIsSettling(true)
  }, [signature, width, height, nodes, radiusOf, publish])

  const tick = useCallback(() => {
    const sim = simRef.current
    const index = indexRef.current
    const alpha = alphaRef.current
    const cx = width / 2
    const cy = height / 2

    // Links: a spring that pulls an over-long edge in and pushes a short one
    // out, split evenly between its two ends.
    for (const edge of edges) {
      const source = index.get(edge.source)
      const target = index.get(edge.target)
      if (!source || !target) continue

      const dx = target.x - source.x
      const dy = target.y - source.y
      const distance = Math.sqrt(dx * dx + dy * dy) || 1
      const force = ((distance - LINK_DISTANCE) / distance) * alpha * 0.5

      source.vx += dx * force
      source.vy += dy * force
      target.vx -= dx * force
      target.vy -= dy * force
    }

    // Repulsion, plus the collision that keeps two circles from overlapping.
    // Both are pairwise, so they share one pass.
    for (let i = 0; i < sim.length; i += 1) {
      const a = sim[i]

      for (let j = i + 1; j < sim.length; j += 1) {
        const b = sim[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let distanceSq = dx * dx + dy * dy

        // Two nodes exactly on top of each other have no direction to
        // separate along, so one is nudged off the other.
        if (distanceSq === 0) {
          dx = (i % 7) - 3 || 1
          dy = (j % 5) - 2 || 1
          distanceSq = dx * dx + dy * dy
        }

        const charge = (CHARGE * alpha) / Math.max(distanceSq, MIN_DISTANCE_SQ)
        a.vx += dx * charge
        a.vy += dy * charge
        b.vx -= dx * charge
        b.vy -= dy * charge

        const touching = a.radius + b.radius + 6
        if (distanceSq < touching * touching) {
          const distance = Math.sqrt(distanceSq) || 1
          const push = ((touching - distance) / distance) * 0.3
          a.vx -= dx * push
          a.vy -= dy * push
          b.vx += dx * push
          b.vy += dy * push
        }
      }
    }

    for (const node of sim) {
      if (node.fx !== null && node.fy !== null) {
        node.x = node.fx
        node.y = node.fy
        node.vx = 0
        node.vy = 0
        continue
      }

      node.vx += (cx - node.x) * CENTER_STRENGTH * alpha
      node.vy += (cy - node.y) * CENTER_STRENGTH * alpha

      node.vx *= VELOCITY_DECAY
      node.vy *= VELOCITY_DECAY
      node.x += node.vx
      node.y += node.vy
    }

    alphaRef.current = alpha - alpha * ALPHA_DECAY
  }, [edges, width, height])

  useEffect(() => {
    if (!simRef.current.length) return

    if (prefersReducedMotion()) {
      // No animation: run the layout to rest in one go and paint the result.
      for (let i = 0; i < STATIC_TICKS && alphaRef.current > ALPHA_MIN; i += 1) tick()
      alphaRef.current = 0
      publish()
      setIsSettling(false)
      return
    }

    const run = () => {
      if (alphaRef.current <= ALPHA_MIN) {
        setIsSettling(false)
        frameRef.current = null
        return
      }

      tick()
      publish()
      frameRef.current = requestAnimationFrame(run)
    }

    frameRef.current = requestAnimationFrame(run)

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    // `signature` restarts the loop when the graph changes; `isSettling`
    // restarts it after a drag has reheated a layout that had come to rest.
  }, [signature, isSettling, tick, publish])

  /** Warms the layout back up, after a drag or a reset. */
  const reheat = useCallback((alpha = 0.6) => {
    alphaRef.current = Math.max(alphaRef.current, alpha)
    setIsSettling(true)
  }, [])

  const holdNode = useCallback(
    (id: string, x: number, y: number) => {
      const node = indexRef.current.get(id)
      if (!node) return
      node.fx = x
      node.fy = y
      // Published straight away: the held node must track the pointer even
      // when the layout has already come to rest.
      node.x = x
      node.y = y
      publish()
      reheat(0.35)
    },
    [reheat, publish]
  )

  const releaseNode = useCallback((id: string) => {
    const node = indexRef.current.get(id)
    if (!node) return
    node.fx = null
    node.fy = null
  }, [])

  /** Throws the layout away and starts it over from the spiral. */
  const restart = useCallback(() => {
    const cx = width / 2
    const cy = height / 2

    simRef.current.forEach((node, index) => {
      const seeded = seedPosition(index, cx, cy)
      node.x = seeded.x
      node.y = seeded.y
      node.vx = 0
      node.vy = 0
      node.fx = null
      node.fy = null
    })

    alphaRef.current = 1
    publish()
    setIsSettling(true)
  }, [width, height, publish])

  return {
    /** Where every node is, as of the last published frame. */
    positions,
    isSettling,
    holdNode,
    releaseNode,
    reheat,
    restart,
  }
}
