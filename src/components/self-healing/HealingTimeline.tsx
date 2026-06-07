"use client";

/**
 * ============================================================================
 * SELF-HEALING - HEALING TIMELINE (ANALYTICAL)
 * ============================================================================
 * Rich vertical timeline with per-attempt analytics — duration bars,
 * bug count badges, fix success rates, and commit info.
 */

import {
    CheckCircle2,
    XCircle,
    Loader2,
    GitCommitHorizontal,
    Bug,
    Wrench,
    Timer,
    ChevronDown,
} from "lucide-react";
import type { HealingAttempt } from "@/types";

interface HealingTimelineProps {
    attempts: HealingAttempt[];
    currentAttempt: number;
    maxAttempts: number;
    isActive: boolean;
}

export function HealingTimeline({
    attempts,
    currentAttempt,
    maxAttempts,
    isActive,
}: HealingTimelineProps) {
    const maxDuration = Math.max(...attempts.map((a) => a.durationMs || 0), 1);

    return (
        <div className="space-y-0">
            {/* Attempts header */}
            <div className="flex items-center justify-between mb-4 px-1">
                <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
                    {attempts.length} of {maxAttempts} Attempts
                </span>
                {attempts.length > 0 && (
                    <span className="text-xs text-zinc-600">
                        Total: {formatDuration(attempts.reduce((sum, a) => sum + (a.durationMs || 0), 0))}
                    </span>
                )}
            </div>

            {attempts.map((attempt, idx) => {
                const fixRate = attempt.bugsFound > 0
                    ? Math.round((attempt.bugsFixed / attempt.bugsFound) * 100)
                    : 0;
                const durationPct = maxDuration > 0 ? (attempt.durationMs / maxDuration) * 100 : 0;
                // Determine visual status based on actual progress, not raw pass/fail
                const hasProgress = attempt.bugsFixed > 0;
                const visualStatus = attempt.status === "passed"
                    ? "passed"
                    : hasProgress
                        ? fixRate >= 80 ? "strong" : "improving"
                        : "improving";

                return (
                    <div key={attempt.attempt} className="relative flex gap-4">
                        {/* Connector */}
                        {idx < attempts.length - 1 && (
                            <div className="absolute left-[19px] top-[44px] bottom-0 w-px bg-white/8" />
                        )}
                        {idx === attempts.length - 1 && isActive && (
                            <div className="absolute left-[19px] top-[44px] bottom-0 w-px bg-gradient-to-b from-emerald-500/30 to-transparent" />
                        )}

                        {/* Status icon */}
                        <div className="flex-shrink-0 mt-1 z-10">
                            {visualStatus === "passed" ? (
                                <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                </div>
                            ) : visualStatus === "strong" ? (
                                <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                                    <Wrench className="w-5 h-5 text-emerald-400" />
                                </div>
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                                    <Wrench className="w-5 h-5 text-amber-400" />
                                </div>
                            )}
                        </div>

                        {/* Content card */}
                        <div className="flex-1 pb-5">
                            <div className="bg-neutral-900/60 border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors">
                                {/* Header */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-sm font-bold text-zinc-200">
                                            Attempt {attempt.attempt}
                                        </h4>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${visualStatus === "passed"
                                                ? "text-emerald-400 bg-emerald-500/10"
                                                : visualStatus === "strong"
                                                    ? "text-emerald-400 bg-emerald-500/10"
                                                    : "text-amber-400 bg-amber-500/10"
                                            }`}>
                                            {visualStatus === "passed" ? "TESTS PASSED" : visualStatus === "strong" ? `${fixRate}% RESOLVED` : "IMPROVING"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-zinc-500">
                                        <Timer className="w-3 h-3" />
                                        {formatDuration(attempt.durationMs)}
                                    </div>
                                </div>

                                {/* Analytics row */}
                                <div className="grid grid-cols-3 gap-3 mb-3">
                                    <div className="bg-white/[0.02] rounded-lg p-2.5">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <Bug className="w-3 h-3 text-red-400" />
                                            <span className="text-[10px] text-zinc-500 uppercase">Found</span>
                                        </div>
                                        <span className="text-lg font-bold text-zinc-200">{attempt.bugsFound}</span>
                                    </div>
                                    <div className="bg-white/[0.02] rounded-lg p-2.5">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <Wrench className="w-3 h-3 text-emerald-400" />
                                            <span className="text-[10px] text-zinc-500 uppercase">Fixed</span>
                                        </div>
                                        <span className="text-lg font-bold text-emerald-400">{attempt.bugsFixed}</span>
                                    </div>
                                    <div className="bg-white/[0.02] rounded-lg p-2.5">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                                            <span className="text-[10px] text-zinc-500 uppercase">Fix Rate</span>
                                        </div>
                                        <span className={`text-lg font-bold ${fixRate >= 80 ? "text-emerald-400" : fixRate >= 50 ? "text-amber-400" : "text-amber-400"}`}>
                                            {fixRate}%
                                        </span>
                                    </div>
                                </div>

                                {/* Duration bar */}
                                <div className="mb-3">
                                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-700 ${visualStatus === "passed"
                                                    ? "bg-emerald-500/60"
                                                    : visualStatus === "strong"
                                                        ? "bg-gradient-to-r from-amber-500/60 to-emerald-500/60"
                                                        : "bg-amber-500/50"
                                                }`}
                                            style={{ width: `${durationPct}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Commit info */}
                                {attempt.commitSha && (
                                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                                        <GitCommitHorizontal className="w-3.5 h-3.5" />
                                        <code className="text-zinc-400 font-mono">{attempt.commitSha.slice(0, 7)}</code>
                                        <span className="text-zinc-600 truncate max-w-[250px]">{attempt.commitMessage}</span>
                                    </div>
                                )}

                                {/* Test output */}
                                {attempt.testOutput && (
                                    <details className="mt-3 group/details">
                                        <summary className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors">
                                            <ChevronDown className="w-3 h-3 transition-transform group-open/details:rotate-180" />
                                            Test output
                                        </summary>
                                        <pre className="mt-2 p-3 bg-neutral-950/80 rounded-lg text-xs text-zinc-400 overflow-x-auto max-h-40 overflow-y-auto font-mono border border-white/5">
                                            {attempt.testOutput.slice(0, 2000)}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Active runner */}
            {isActive && currentAttempt > attempts.length && (
                <div className="relative flex gap-4">
                    <div className="flex-shrink-0 mt-1">
                        <div className="w-10 h-10 rounded-full bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                        </div>
                    </div>
                    <div className="flex-1 pb-5">
                        <div className="bg-neutral-900/50 border border-violet-500/20 rounded-xl p-4">
                            <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-zinc-300">
                                    Attempt {currentAttempt}/{maxAttempts}
                                </h4>
                                <span className="text-[10px] px-2 py-0.5 rounded-full text-violet-400 bg-violet-500/10 font-medium animate-pulse">
                                    RUNNING
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function formatDuration(ms: number): string {
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}
