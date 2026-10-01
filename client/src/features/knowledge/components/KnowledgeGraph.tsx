import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useForceGraph } from '@/features/knowledge/lib/use-force-graph'
import { cn } from '@/lib/utils'
import type { ArticleGraph, GraphNode } from '@/types/knowledge'

interface KnowledgeGraphProps {
  graph: ArticleGraph
  /** The article the reader is on, drawn as the anchor of a local graph. */
  focusId?: string | null
  height?: number
  className?: string
}

const MIN_ZOOM = 0.3
const MAX_ZOOM = 3
/** Below this zoom only hubs keep their label, or the view becomes a word soup. */
const LABEL_ZOOM = 0.85
/** A node with at least this many links keeps its label at any zoom. */
const HUB_DEGREE = 3

/**
 * Node size carries how connected an article is. The square root is what
 * keeps it honest: area, not radius, tracks the degree, so a hub with nine
 * links reads as three times the one with one rather than nine times.
 */
function radiusOf(degree: number) {
  return Math.min(4.5 + Math.sqrt(degree) * 3, 18)
}

interface Viewport {
  x: number
  y: number
  k: number
}

/**
 * The link graph, laid out live.
 *
 * Everything here is greyscale but one accent, the way the rest of the app
 * is: size carries connectedness, a ring carries "nothing links here", and
 * the single `--data` accent is spent on the article you are reading. Nothing
 * is encoded in hue alone — every node is labelled, and the whole graph is
 * repeated as a plain list for readers who are not using a pointer.
 */
export function KnowledgeGraph({
  graph,
  focusId = null,
  height = 480,
  className,
}: KnowledgeGraphProps) {
  const navigate = useNavigate()
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 800, height })
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, k: 1 })
  const [hovered, setHovered] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const panRef = useRef<{ x: number; y: number; view: Viewport } | null>(null)

  // The layout needs real pixels, not a percentage, so the panel is measured.
  useEffect(() => {
    const element = svgRef.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width || 800, height })
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [height])

  const nodes = useMemo(
    () => graph.nodes.map((node) => ({ id: node.id, degree: node.degree })),
    [graph.nodes]
  )
  const edges = useMemo(
    () => graph.edges.map((edge) => ({ source: edge.source, target: edge.target })),
    [graph.edges]
  )

  const { positions, isSettling, holdNode, releaseNode, restart } = useForceGraph({
    nodes,
    edges,
    width: size.width,
    height: size.height,
    radiusOf,
  })

  const byId = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes]
  )

  /** Where each node sits this frame, so an edge can find both its ends. */
  const placed = useMemo(
    () => new Map(positions.map((position) => [position.id, position])),
    [positions]
  )

  /** Who lights up with a node: itself and whatever it is linked to. */
  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>()

    for (const edge of graph.edges) {
      if (!map.has(edge.source)) map.set(edge.source, new Set())
      if (!map.has(edge.target)) map.set(edge.target, new Set())
      map.get(edge.source)!.add(edge.target)
      map.get(edge.target)!.add(edge.source)
    }

    return map
  }, [graph.edges])

  const highlighted = useMemo(() => {
    if (!hovered) return null
    return new Set([hovered, ...(neighbours.get(hovered) ?? [])])
  }, [hovered, neighbours])

  /** Pointer pixels into the graph's own coordinates, through the viewport. */
  const toGraphSpace = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }

      return {
        x: (event.clientX - rect.left - view.x) / view.k,
        y: (event.clientY - rect.top - view.y) / view.k,
      }
    },
    [view]
  )

  /** Zooms about a fixed point, so the spot under the cursor stays put. */
  const zoomAt = useCallback((factor: number, originX: number, originY: number) => {
    setView((current) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.k * factor))
      const scale = k / current.k

      return {
        k,
        x: originX - (originX - current.x) * scale,
        y: originY - (originY - current.y) * scale,
      }
    })
  }, [])

  const onWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return

      event.preventDefault()
      zoomAt(
        event.deltaY < 0 ? 1.12 : 1 / 1.12,
        event.clientX - rect.left,
        event.clientY - rect.top
      )
    },
    [zoomAt]
  )

  // React attaches wheel handlers passively, so preventDefault on the JSX
  // prop alone would not stop the page scrolling behind the graph.
  useEffect(() => {
    const element = svgRef.current
    if (!element) return

    const handler = (event: WheelEvent) => event.preventDefault()
    element.addEventListener('wheel', handler, { passive: false })

    return () => element.removeEventListener('wheel', handler)
  }, [])

  useEffect(() => {
    if (!dragging && !panRef.current) return

    const onMove = (event: PointerEvent) => {
      if (dragging) {
        const point = toGraphSpace(event)
        holdNode(dragging, point.x, point.y)
        return
      }

      const pan = panRef.current
      if (!pan) return

      setView({
        ...pan.view,
        x: pan.view.x + (event.clientX - pan.x),
        y: pan.view.y + (event.clientY - pan.y),
      })
    }

    const onUp = () => {
      if (dragging) releaseNode(dragging)
      setDragging(null)
      panRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, toGraphSpace, holdNode, releaseNode])

  const open = useCallback((node: GraphNode) => navigate(`/knowledge-base/${node.slug}`), [navigate])

  if (!graph.nodes.length) {
    return (
      <div
        className={cn(
          'glass-tile text-muted-foreground flex items-center justify-center rounded-2xl p-8 text-center text-sm',
          className
        )}
        style={{ height }}
      >
        Nothing to draw yet — the graph fills in as articles link to each other.
      </div>
    )
  }

  return (
    <div className={cn('glass-tile relative overflow-hidden rounded-2xl', className)}>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        role="img"
        aria-label={`Knowledge graph: ${graph.stats.nodes} articles, ${graph.stats.edges} links`}
        className={cn('block touch-none select-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
        onWheel={onWheel}
        onPointerDown={(event) => {
          // A press on the background pans; a press on a node is caught by
          // the node itself and never reaches here.
          panRef.current = { x: event.clientX, y: event.clientY, view }
          setHovered(null)
        }}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <g className="text-border">
            {graph.edges.map((edge) => {
              const source = placed.get(edge.source)
              const target = placed.get(edge.target)
              if (!source || !target) return null

              const lit = !highlighted || (highlighted.has(edge.source) && highlighted.has(edge.target))

              return (
                <line
                  key={`${edge.source}-${edge.target}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="currentColor"
                  strokeWidth={edge.mutual ? 2 : 1}
                  strokeOpacity={lit ? (edge.mutual ? 0.9 : 0.55) : 0.12}
                  strokeLinecap="round"
                />
              )
            })}
          </g>

          {positions.map((position) => {
            const node = byId.get(position.id)
            if (!node) return null

            const radius = radiusOf(node.degree)
            const isFocus = node.isFocus || node.id === focusId
            const isHovered = hovered === node.id
            const dimmed = !!highlighted && !highlighted.has(node.id)
            const isOrphan = node.degree === 0
            const showLabel =
              isHovered || isFocus || view.k >= LABEL_ZOOM || node.degree >= HUB_DEGREE

            return (
              <g
                key={node.id}
                transform={`translate(${position.x},${position.y})`}
                opacity={dimmed ? 0.2 : 1}
                className="transition-opacity duration-[var(--motion-control)]"
                onPointerEnter={() => setHovered(node.id)}
                onPointerLeave={() => setHovered((current) => (current === node.id ? null : current))}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  setDragging(node.id)
                }}
                onClick={() => open(node)}
                style={{ cursor: 'pointer' }}
              >
                <title>
                  {node.title}
                  {` — ${node.degree} link${node.degree === 1 ? '' : 's'}`}
                  {node.category ? ` · ${node.category.name}` : ''}
                </title>

                {/* A halo marks the article being read without spending a
                    second hue on it. */}
                {isFocus && (
                  <circle r={radius + 6} className="fill-data/15 stroke-data/50" strokeWidth={1} />
                )}

                <circle
                  r={radius}
                  strokeWidth={isOrphan ? 1.5 : 1}
                  className={cn(
                    'transition-[fill] duration-[var(--motion-control)]',
                    isFocus
                      ? 'fill-data stroke-data'
                      : isOrphan
                        ? // Nothing links here and it links nowhere: drawn hollow,
                          // so the gap is visible without relying on colour.
                          'fill-canvas stroke-muted-foreground/60'
                        : isHovered
                          ? 'fill-foreground stroke-foreground'
                          : 'fill-muted-foreground/70 stroke-muted-foreground/70'
                  )}
                />

                {showLabel && (
                  <text
                    y={radius + 13}
                    textAnchor="middle"
                    className={cn(
                      'pointer-events-none text-[10px]',
                      isHovered || isFocus ? 'fill-foreground' : 'fill-muted-foreground'
                    )}
                  >
                    {node.title.length > 28 ? `${node.title.slice(0, 27)}…` : node.title}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          onClick={() => zoomAt(1.25, size.width / 2, height / 2)}
          aria-label="Zoom in"
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          onClick={() => zoomAt(1 / 1.25, size.width / 2, height / 2)}
          aria-label="Zoom out"
        >
          <Minus className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          onClick={() => setView({ x: 0, y: 0, k: 1 })}
          aria-label="Reset the view"
        >
          <Maximize2 className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          onClick={restart}
          aria-label="Re-run the layout"
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>

      <div className="text-muted-foreground/70 pointer-events-none absolute bottom-3 left-3 text-[11px]">
        {graph.stats.nodes} article{graph.stats.nodes === 1 ? '' : 's'} · {graph.stats.edges} link
        {graph.stats.edges === 1 ? '' : 's'}
        {graph.stats.orphans > 0 && ` · ${graph.stats.orphans} unlinked`}
        {isSettling && ' · settling'}
      </div>

      {/* The same graph as text. A force layout is unusable without a pointer,
          so the connections are also readable in order. */}
      <ul className="sr-only">
        {graph.nodes.map((node) => (
          <li key={node.id}>
            {node.title} — {node.degree} link{node.degree === 1 ? '' : 's'}
            {node.degree > 0 &&
              `: ${[...(neighbours.get(node.id) ?? [])]
                .map((id) => byId.get(id)?.title ?? '')
                .filter(Boolean)
                .join(', ')}`}
          </li>
        ))}
      </ul>
    </div>
  )
}
