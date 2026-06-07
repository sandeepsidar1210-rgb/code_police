"use client";

/**
 * ============================================================================
 * SELF-HEALING - STATUS BADGE COMPONENT
 * ============================================================================
 * Animated status indicator for healing sessions.
 */

import type { HealingStatus } from "@/types";

const statusConfig: Record<
    HealingStatus,
    { label: string; color: string; bgColor: string; pulse: boolean }
> = {
    queued: {
        label: "Queued",
        color: "text-zinc-400",
        bgColor: "bg-zinc-400/20",
        pulse: false,
    },
    cloning: {
        label: "Cloning",
        color: "text-blue-400",
        bgColor: "bg-blue-400/20",
        pulse: true,
    },
    scanning: {
        label: "Scanning",
        color: "text-yellow-400",
        bgColor: "bg-yellow-400/20",
        pulse: true,
    },
    testing: {
        label: "Testing",
        color: "text-violet-400",
        bgColor: "bg-violet-400/20",
        pulse: true,
    },
    fixing: {
        label: "Fixing",
        color: "text-orange-400",
        bgColor: "bg-orange-400/20",
        pulse: true,
    },
    pushing: {
        label: "Pushing",
        color: "text-cyan-400",
        bgColor: "bg-cyan-400/20",
        pulse: true,
    },
    completed: {
        label: "Completed",
        color: "text-emerald-400",
        bgColor: "bg-emerald-400/20",
        pulse: false,
    },
    partial_success: {
        label: "Partial Fix",
        color: "text-amber-400",
        bgColor: "bg-amber-400/20",
        pulse: false,
    },
    failed: {
        label: "Failed",
        color: "text-red-400",
        bgColor: "bg-red-400/20",
        pulse: false,
    },
};

export function StatusBadge({ status }: { status: HealingStatus }) {
    const config = statusConfig[status] || statusConfig.queued;

    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}
        >
            <span
                className={`w-1.5 h-1.5 rounded-full bg-current ${config.pulse ? "animate-pulse" : ""
                    }`}
            />
            {config.label}
        </span>
    );
}
