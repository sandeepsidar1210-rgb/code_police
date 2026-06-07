"use client";

import { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * TERMINAL UI PRIMITIVES
 * ============================================================================
 * A small kit of components for the Code-Police terminal aesthetic. Use these
 * to build the dark, hacker-style dashboard surfaces.
 */

/** A terminal "window" with macOS-style traffic lights and a title bar. */
export function TerminalWindow({
  title = "code-police",
  children,
  className,
  scanlines = true,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  scanlines?: boolean;
}) {
  return (
    <div className={cn("term-window", scanlines && "term-scanlines", className)}>
      <div className="term-titlebar">
        <span className="term-dot term-dot-red" />
        <span className="term-dot term-dot-amber" />
        <span className="term-dot term-dot-green" />
        <span className="ml-2 font-mono">{title}</span>
      </div>
      <div className="term p-4">{children}</div>
    </div>
  );
}

/** A single command-prompt line, optionally with a blinking cursor. */
export function TerminalLine({
  children,
  cursor = false,
  className,
}: {
  children?: ReactNode;
  cursor?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("term-prompt font-mono text-sm leading-relaxed", className)}>
      <span className={cn(cursor && "term-cursor")}>{children}</span>
    </div>
  );
}

export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

/** A risk chip styled per severity. */
export function RiskChip({ level, label }: { level: RiskLevel; label?: string }) {
  const cls: Record<RiskLevel, string> = {
    none: "term-chip-low",
    low: "term-chip-low",
    medium: "term-chip-medium",
    high: "term-chip-high",
    critical: "term-chip-critical",
  };
  return (
    <span className={cn("term-chip font-mono", cls[level])}>
      ● {label ?? level}
    </span>
  );
}

/** Bare terminal panel (no titlebar). */
export function TerminalPanel({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "term rounded-lg border border-[var(--term-border)] p-4 font-mono text-sm",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
