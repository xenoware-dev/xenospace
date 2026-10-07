import { useEffect, useMemo, useRef, useState } from 'react';
import {
  forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation,
  type Simulation, type SimulationLinkDatum, type SimulationNodeDatum,
} from 'd3-force';
import type { KbGraph } from '@xenospace/shared';
import { cn } from '@/lib/cn.js';
import { EmptyState } from './ui/Empty.jsx';
import { Graph as GraphIcon } from './icons.jsx';

/**
 * Knowledge graph.
 *
 * A force-directed view of the `[[wiki link]]` structure, the way Obsidian
 * presents a vault. d3-force runs the layout; rendering is plain SVG driven by
 * React state, which keeps the nodes real DOM elements that can be focused and
 * described rather than pixels on a canvas.
 */

interface Node extends SimulationNodeDatum {
  id: string;
  title: string;
  degree: number;
  folder: string | null;
  tags: string[];
}

interface Link extends SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
}

/** A stable colour per folder, so clusters read as groups. */
const FOLDER_COLORS = [
  'var(--series-1)', 'var(--series-3)', 'var(--series-7)', 'var(--series-5)',
  'var(--series-4)', 'var(--series-2)', 'var(--series-6)', 'var(--series-8)',
];

export function KnowledgeGraph({
  graph,
  selectedId,
  onSelect,
  className,
}: {
  graph: KbGraph;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<Simulation<Node, Link> | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 800, height: 520 });

  const folders = useMemo(
    () => [...new Set(graph.nodes.map((node) => node.folder ?? 'Unfiled'))].sort(),
    [graph.nodes],
  );
  const folderColor = (folder: string | null) =>
    FOLDER_COLORS[folders.indexOf(folder ?? 'Unfiled') % FOLDER_COLORS.length]!;

  // Track the container size so the layout centres correctly at any width.
  useEffect(() => {
    const element = svgRef.current?.parentElement;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: Math.max(360, rect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (graph.nodes.length === 0) return;

    const simNodes: Node[] = graph.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      degree: node.inbound + node.outbound,
      folder: node.folder,
      tags: node.tags,
    }));
    const simLinks: Link[] = graph.edges.map((edge) => ({ source: edge.source, target: edge.target }));

    const simulation = forceSimulation<Node, Link>(simNodes)
      .force('link', forceLink<Node, Link>(simLinks).id((node) => node.id).distance(70).strength(0.35))
      // Repulsion scaled by connectivity, so hubs claim more room than leaves.
      .force('charge', forceManyBody<Node>().strength((node) => -120 - node.degree * 18))
      .force('center', forceCenter(size.width / 2, size.height / 2))
      .force('collide', forceCollide<Node>().radius((node) => radiusFor(node.degree) + 6))
      .alphaDecay(0.045);

    // React state is updated on each tick rather than mutating the DOM, which
    // keeps the render declarative at this node count (a few hundred at most).
    simulation.on('tick', () => setNodes([...simNodes]));
    simulationRef.current = simulation;

    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [graph, size.width, size.height]);

  const positions = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  /** Neighbours of the hovered or selected node, for the highlight pass. */
  const focusId = hovered ?? selectedId ?? null;
  const connected = useMemo(() => {
    if (!focusId) return new Set<string>();
    const set = new Set<string>([focusId]);
    for (const edge of graph.edges) {
      if (edge.source === focusId) set.add(edge.target);
      if (edge.target === focusId) set.add(edge.source);
    }
    return set;
  }, [focusId, graph.edges]);

  if (graph.nodes.length === 0) {
    return (
      <EmptyState
        icon={<GraphIcon size={20} />}
        title="Nothing to graph yet"
        message="Create a few notes and link them with [[wiki links]] to see the structure."
      />
    );
  }

  return (
    <div className={cn('relative h-full min-h-90 w-full overflow-hidden', className)}>
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="img"
        aria-label={`Knowledge graph with ${graph.nodes.length} notes and ${graph.edges.length} links`}
        className="touch-none select-none"
      >
        {/* ------------------------------------------------------- edges */}
        <g>
          {graph.edges.map((edge, index) => {
            const source = positions.get(edge.source);
            const target = positions.get(edge.target);
            if (!source?.x || !target?.x) return null;
            const active = !focusId || (connected.has(edge.source) && connected.has(edge.target));
            return (
              <line
                key={`${edge.source}-${edge.target}-${index}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={active ? 'var(--line-strong)' : 'var(--line-subtle)'}
                strokeWidth={active ? 1.25 : 0.75}
                opacity={focusId && !active ? 0.25 : 0.7}
              />
            );
          })}
        </g>

        {/* ------------------------------------------------------- nodes */}
        <g>
          {nodes.map((node) => {
            const radius = radiusFor(node.degree);
            const isFocus = node.id === focusId;
            const dimmed = Boolean(focusId) && !connected.has(node.id);
            const color = folderColor(node.folder);

            return (
              <g
                key={node.id}
                transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
                opacity={dimmed ? 0.25 : 1}
                className="cursor-pointer transition-opacity"
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(node.id)}
                role="button"
                tabIndex={0}
                aria-label={`${node.title}, ${node.degree} links`}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(node.id);
                  }
                }}
              >
                {/* A ring marks the selected note without changing its size. */}
                {(isFocus || node.id === selectedId) && (
                  <circle r={radius + 4} fill="none" stroke={color} strokeWidth={1.5} opacity={0.5} />
                )}
                <circle
                  r={radius}
                  fill={color}
                  stroke="var(--surface-1)"
                  strokeWidth={1.5}
                  className="transition-[r]"
                />
                {/* Labels only above a threshold, or the graph becomes a wall
                    of overlapping text. */}
                {(node.degree >= 2 || isFocus || node.id === selectedId) && (
                  <text
                    y={radius + 11}
                    textAnchor="middle"
                    className="pointer-events-none"
                    style={{
                      fontSize: 9.5,
                      fill: isFocus ? 'var(--ink-primary)' : 'var(--ink-muted)',
                      fontWeight: isFocus ? 600 : 400,
                      paintOrder: 'stroke',
                      stroke: 'var(--surface-1)',
                      strokeWidth: 3,
                      strokeLinejoin: 'round',
                    }}
                  >
                    {node.title.length > 26 ? `${node.title.slice(0, 24)}…` : node.title}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* ------------------------------------------------------- legend */}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-1 rounded-[var(--radius-md)] bg-[var(--surface-1)]/85 px-2.5 py-2 backdrop-blur-sm ring-1 ring-[var(--line-subtle)]">
        <p className="text-xs font-medium text-[var(--ink-muted)]">Folders</p>
        <ul className="flex flex-col gap-0.5">
          {folders.slice(0, 6).map((folder) => (
            <li key={folder} className="flex items-center gap-1.5 text-[10px]">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: folderColor(folder === 'Unfiled' ? null : folder) }} />
              <span className="text-[var(--ink-secondary)]">{folder}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="pointer-events-none absolute right-3 bottom-3 rounded-[var(--radius-md)] bg-[var(--surface-1)]/85 px-2.5 py-1.5 text-[10px] text-[var(--ink-muted)] backdrop-blur-sm ring-1 ring-[var(--line-subtle)]">
        {graph.nodes.length} notes · {graph.edges.length} links
        {graph.orphanLinks.length > 0 && ` · ${graph.orphanLinks.length} unresolved`}
      </div>
    </div>
  );
}

/** Node radius grows with connectivity, flattening so hubs stay in frame. */
function radiusFor(degree: number): number {
  return 4 + Math.min(10, Math.sqrt(degree) * 2.6);
}
