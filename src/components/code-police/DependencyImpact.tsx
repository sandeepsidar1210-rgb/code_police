"use client";

import { useMemo } from "react";
import { TerminalWindow, RiskChip } from "@/components/ui/terminal";

/**
 * ============================================================================
 * DEPENDENCY IMPACT VISUALIZATION
 * ============================================================================
 * Renders a PR's "blast radius" as a layered, dependency-free SVG graph plus a
 * terminal-styled summary. Changed files sit on the left; affected files fan
 * out to the right by dependency distance.
 *
 * Designed for open-source maintainers: at a glance, see what a PR touches and
 * what it ripples into, alongside the merge-conflict pre-check verdict.
 */

export interface ImpactData {
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  changedFiles: string[];
  affectedFiles: Array<{ path: string; depth: number }>;
  directDependents: string[];
  edges: Array<{ from: string; to: string }>;
  mergeable?: boolean | null;
  conflictRisk?: "none" | "low" | "high";
  likelyConflicts?: string[];
}

const short = (p: string) => {
  const parts = p.split("/");
  return parts.length <= 2 ? p : ".../" + parts.slice(-2).join("/");
};

export function DependencyImpact({ data }: { data: ImpactData }) {
  const { columns, positions, width, height } = useLayout(data);

  return (
    <TerminalWindow title="dependency-impact ~ blast-radius">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <RiskChip level={data.riskLevel} label={`risk ${data.riskScore}/100`} />
        {data.conflictRisk && (
          <RiskChip
            level={data.conflictRisk === "none" ? "low" : data.conflictRisk}
            label={
              data.mergeable === false
                ? "not mergeable"
                : data.conflictRisk === "none"
                ? "merges clean"
                : `conflict ${data.conflictRisk}`
            }
          />
        )}
        <span className="font-mono text-xs text-[var(--term-fg-dim)]">
          {data.changedFiles.length} changed → {data.affectedFiles.length} affected
        </span>
      </div>

      {data.affectedFiles.length === 0 ? (
        <p className="font-mono text-sm text-[var(--term-green-bright)]">
          {"> "} self-contained change — nothing else imports these files.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="min-w-full"
            role="img"
            aria-label="Dependency impact graph"
          >
            {/* edges */}
            {data.edges.slice(0, 120).map((e, i) => {
              const from = positions.get(e.to); // changed/closer node is the target
              const to = positions.get(e.from); // dependent is the source
              if (!from || !to) return null;
              return (
                <path
                  key={i}
                  d={`M ${from.x + 70} ${from.y} C ${(from.x + to.x) / 2 + 70} ${from.y}, ${
                    (from.x + to.x) / 2
                  } ${to.y}, ${to.x} ${to.y}`}
                  fill="none"
                  stroke="rgba(57,197,207,0.25)"
                  strokeWidth={1}
                />
              );
            })}
            {/* nodes */}
            {columns.flatMap((col) =>
              col.map((node) => {
                const pos = positions.get(node.path)!;
                const changed = node.depth === 0;
                return (
                  <g key={node.path} transform={`translate(${pos.x}, ${pos.y})`}>
                    <rect
                      x={-8}
                      y={-12}
                      width={150}
                      height={24}
                      rx={5}
                      fill={changed ? "rgba(249,115,22,0.18)" : "rgba(57,197,207,0.08)"}
                      stroke={changed ? "#f97316" : "rgba(57,197,207,0.4)"}
                      strokeWidth={1}
                    />
                    <text
                      x={2}
                      y={4}
                      fontSize={10}
                      fontFamily="var(--font-mono), monospace"
                      fill={changed ? "#fdba74" : "#c9d1d9"}
                    >
                      {short(node.path).slice(0, 22)}
                    </text>
                  </g>
                );
              })
            )}
          </svg>
        </div>
      )}

      {data.likelyConflicts && data.likelyConflicts.length > 0 && (
        <div className="mt-4 rounded border border-[var(--term-red)]/40 bg-[var(--term-red)]/5 p-3">
          <p className="font-mono text-xs term-glow-red mb-1">! likely merge conflicts</p>
          <ul className="font-mono text-xs text-[var(--term-fg-dim)] space-y-0.5">
            {data.likelyConflicts.slice(0, 8).map((c) => (
              <li key={c}>- {c}</li>
            ))}
          </ul>
        </div>
      )}
    </TerminalWindow>
  );
}

interface Node {
  path: string;
  depth: number;
}

/** Compute a simple layered layout: column = depth, row = index in column. */
function useLayout(data: ImpactData) {
  return useMemo(() => {
    const byDepth = new Map<number, Node[]>();
    for (const c of data.changedFiles) {
      const arr = byDepth.get(0) ?? [];
      arr.push({ path: c, depth: 0 });
      byDepth.set(0, arr);
    }
    for (const f of data.affectedFiles) {
      const arr = byDepth.get(f.depth) ?? [];
      arr.push({ path: f.path, depth: f.depth });
      byDepth.set(f.depth, arr);
    }

    const depths = [...byDepth.keys()].sort((a, b) => a - b);
    const columns = depths.map((d) => (byDepth.get(d) ?? []).slice(0, 12));

    const colWidth = 210;
    const rowHeight = 40;
    const positions = new Map<string, { x: number; y: number }>();

    columns.forEach((col, ci) => {
      col.forEach((node, ri) => {
        positions.set(node.path, { x: 20 + ci * colWidth, y: 30 + ri * rowHeight });
      });
    });

    const maxRows = Math.max(1, ...columns.map((c) => c.length));
    const width = Math.max(420, 40 + columns.length * colWidth);
    const height = Math.max(120, 40 + maxRows * rowHeight);

    return { columns, positions, width, height };
  }, [data]);
}
