"use client";

/**
 * ============================================================================
 * SELF-HEALING - BUG TABLE (ANALYTICAL)
 * ============================================================================
 * Filterable bug table with category analytics summary at the top —
 * mini donut breakdown, fix rate per category, and sortable rows.
 */

import { useState, useMemo } from "react";
import { CheckCircle2, XCircle, Filter, Bug, Shield, TrendingUp } from "lucide-react";
import type { HealingBug, BugCategory } from "@/types";

interface BugTableProps {
    bugs: HealingBug[];
}

const categoryColors: Record<BugCategory, { text: string; bg: string; ring: string }> = {
    SYNTAX: { text: "text-red-400", bg: "bg-red-500/10", ring: "#f87171" },
    LINTING: { text: "text-yellow-400", bg: "bg-yellow-500/10", ring: "#facc15" },
    RUNTIME: { text: "text-orange-400", bg: "bg-orange-500/10", ring: "#fb923c" },
    LOGIC: { text: "text-violet-400", bg: "bg-violet-500/10", ring: "#a78bfa" },
    IMPORT: { text: "text-blue-400", bg: "bg-blue-500/10", ring: "#60a5fa" },
    TYPE: { text: "text-cyan-400", bg: "bg-cyan-500/10", ring: "#22d3ee" },
    DEPENDENCY: { text: "text-pink-400", bg: "bg-pink-500/10", ring: "#f472b6" },
};

const categories: BugCategory[] = ["SYNTAX", "LINTING", "RUNTIME", "LOGIC", "IMPORT", "TYPE", "DEPENDENCY"];

export function BugTable({ bugs }: BugTableProps) {
    const [filterCategory, setFilterCategory] = useState<BugCategory | "ALL">("ALL");
    const [filterFixed, setFilterFixed] = useState<"ALL" | "FIXED" | "UNFIXED">("ALL");

    const analytics = useMemo(() => {
        const fixedCount = bugs.filter((b) => b.fixed).length;
        const fixRate = bugs.length > 0 ? Math.round((fixedCount / bugs.length) * 100) : 0;
        const byCat = categories.map((cat) => {
            const catBugs = bugs.filter((b) => b.category === cat);
            const catFixed = catBugs.filter((b) => b.fixed).length;
            return {
                category: cat,
                total: catBugs.length,
                fixed: catFixed,
                rate: catBugs.length > 0 ? Math.round((catFixed / catBugs.length) * 100) : 0,
            };
        }).filter((c) => c.total > 0);

        return { total: bugs.length, fixed: fixedCount, fixRate, byCat };
    }, [bugs]);

    const filteredBugs = bugs.filter((bug) => {
        if (filterCategory !== "ALL" && bug.category !== filterCategory) return false;
        if (filterFixed === "FIXED" && !bug.fixed) return false;
        if (filterFixed === "UNFIXED" && bug.fixed) return false;
        return true;
    });

    if (bugs.length === 0) {
        return (
            <div className="text-center py-16 space-y-3">
                <Bug className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-zinc-500 text-sm">No bugs detected yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Analytics summary */}
            <div className="grid grid-cols-12 gap-4">
                {/* Fix rate overview */}
                <div className="col-span-12 md:col-span-4 bg-neutral-900/60 border border-white/5 rounded-xl p-4 flex items-center gap-4">
                    <div className="relative w-16 h-16 flex-shrink-0">
                        <svg width={64} height={64} className="-rotate-90">
                            <circle cx={32} cy={32} r={26} stroke="rgba(255,255,255,0.05)" strokeWidth={5} fill="none" />
                            <circle
                                cx={32} cy={32} r={26}
                                stroke={analytics.fixRate >= 80 ? "#34d399" : analytics.fixRate >= 50 ? "#facc15" : "#f87171"}
                                strokeWidth={5} fill="none" strokeLinecap="round"
                                strokeDasharray={2 * Math.PI * 26}
                                strokeDashoffset={2 * Math.PI * 26 * (1 - analytics.fixRate / 100)}
                                className="transition-all duration-700"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-sm font-bold text-zinc-100">{analytics.fixRate}%</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-zinc-200">
                            {analytics.fixed}/{analytics.total} Fixed
                        </div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Overall Fix Rate</div>
                    </div>
                </div>

                {/* Category breakdown */}
                <div className="col-span-12 md:col-span-8 grid grid-cols-3 md:grid-cols-4 gap-2">
                    {analytics.byCat.map((cat) => {
                        const colors = categoryColors[cat.category];
                        return (
                            <button
                                key={cat.category}
                                onClick={() => setFilterCategory(filterCategory === cat.category ? "ALL" : cat.category)}
                                className={`${colors.bg} border rounded-lg p-2.5 text-left transition-all hover:scale-[1.02] ${filterCategory === cat.category ? "border-white/20 ring-1 ring-white/10" : "border-transparent"
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className={`text-[10px] font-bold tracking-wider ${colors.text}`}>{cat.category}</span>
                                    <span className="text-[10px] text-zinc-500">{cat.rate}%</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-lg font-bold ${colors.text}`}>{cat.total}</span>
                                    <span className="text-[10px] text-zinc-600">{cat.fixed}✓</span>
                                </div>
                                {/* Mini bar */}
                                <div className="w-full h-1 bg-white/5 rounded-full mt-1.5 overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${cat.rate}%`, backgroundColor: colors.ring }} />
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <Filter className="w-3.5 h-3.5" />
                    <span>Filter:</span>
                </div>
                <button
                    onClick={() => setFilterCategory("ALL")}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${filterCategory === "ALL" ? "bg-white/10 text-zinc-200" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                        }`}
                >
                    All ({bugs.length})
                </button>
                <div className="flex gap-1.5 ml-auto">
                    <button
                        onClick={() => setFilterFixed(filterFixed === "FIXED" ? "ALL" : "FIXED")}
                        className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 transition-colors ${filterFixed === "FIXED" ? "bg-emerald-500/10 text-emerald-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                            }`}
                    >
                        <CheckCircle2 className="w-3 h-3" /> Fixed
                    </button>
                    <button
                        onClick={() => setFilterFixed(filterFixed === "UNFIXED" ? "ALL" : "UNFIXED")}
                        className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 transition-colors ${filterFixed === "UNFIXED" ? "bg-red-500/10 text-red-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                            }`}
                    >
                        <XCircle className="w-3 h-3" /> Unfixed
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-white/5">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-white/5 bg-neutral-900/60">
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium w-10">
                                <Shield className="w-3.5 h-3.5" />
                            </th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Category</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">File</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium w-16">Line</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium">Message</th>
                            <th className="text-left px-4 py-3 text-zinc-500 font-medium w-24">Fixed At</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredBugs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center py-10 text-zinc-600">
                                    No bugs match the current filter
                                </td>
                            </tr>
                        ) : (
                            filteredBugs.map((bug) => {
                                const colors = categoryColors[bug.category] || { text: "text-zinc-400", bg: "bg-zinc-500/10", ring: "#71717a" };
                                return (
                                    <tr key={bug.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                        <td className="px-4 py-3">
                                            {bug.fixed ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                            ) : (
                                                <XCircle className="w-4 h-4 text-red-400/60" />
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider ${colors.text} ${colors.bg}`}>
                                                {bug.category}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-zinc-300 font-mono text-[11px] max-w-[200px] truncate">
                                            {bug.filePath}
                                        </td>
                                        <td className="px-4 py-3 text-zinc-400 font-mono">{bug.line}</td>
                                        <td className="px-4 py-3 text-zinc-400 max-w-xs truncate">{bug.message}</td>
                                        <td className="px-4 py-3">
                                            {bug.fixedAtAttempt ? (
                                                <span className="flex items-center gap-1 text-emerald-400/80">
                                                    <TrendingUp className="w-3 h-3" />
                                                    Attempt {bug.fixedAtAttempt}
                                                </span>
                                            ) : (
                                                <span className="text-zinc-600">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
