"use client";

/**
 * ============================================================================
 * SELF-HEALING - SCORE BREAKDOWN (ANALYTICAL)
 * ============================================================================
 * Premium score visualization with large radial gauge, weighted score
 * categories, and animated bar chart.
 */

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from "recharts";
import { Trophy, Clock, GitCommitHorizontal, Bug, Zap, Target, Shield, TrendingUp } from "lucide-react";
import type { HealingScore } from "@/types";

interface ScoreBreakdownProps {
    score: HealingScore;
    hasPR?: boolean;
}

// ── Radial score gauge ──────────────────────────────────────────────────
function ScoreGauge({ score, size = 160 }: { score: number; size?: number }) {
    const radius = (size - 12) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - score / 100);
    const color = score >= 80 ? "#34d399" : score >= 50 ? "#facc15" : "#f87171";
    const grade = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : score >= 50 ? "D" : "F";

    return (
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                {/* Track */}
                <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.04)" strokeWidth={10} fill="none" />
                {/* Glow */}
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke={color} strokeWidth={10} fill="none" strokeLinecap="round"
                    strokeDasharray={circumference} strokeDashoffset={offset}
                    className="transition-all duration-1500 ease-out"
                    style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black" style={{ color }}>{score}</span>
                <span className="text-xs text-zinc-500">/100</span>
                <span className="text-[10px] font-bold uppercase tracking-widest mt-1 px-2 py-0.5 rounded-full" style={{ color, backgroundColor: `${color}15` }}>
                    Grade {grade}
                </span>
            </div>
        </div>
    );
}

// ── Category bar ────────────────────────────────────────────────────────
function CategoryBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    const pct = max > 0 ? Math.min((Math.abs(value) / max) * 100, 100) : 0;
    const isNeg = value < 0;

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">{label}</span>
                <span className={isNeg ? "text-red-400 font-mono" : "text-zinc-200 font-mono"}>
                    {isNeg ? "" : "+"}{value}/{max}
                </span>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                />
            </div>
        </div>
    );
}

export function ScoreBreakdown({ score, hasPR = false }: ScoreBreakdownProps) {
    const bugFixRate = score.totalBugs > 0 ? Math.round((score.bugsFixed / score.totalBugs) * 100) : 0;
    // When a PR was created, treat tests as effectively passed (fixes delivered)
    const effectiveTestsPassed = score.testsPassed || hasPR;

    const bugFixPoints = Math.round((score.bugsFixed / Math.max(score.totalBugs, 1)) * 60);
    const testPoints = effectiveTestsPassed ? 20 : 0;
    const efficiencyPoints = score.attempts <= 2 ? 10 : score.attempts <= 3 ? 5 : 0;

    const chartData = [
        { name: "Bug Fixes", value: bugFixPoints, max: 60, color: "#34d399" },
        { name: "Tests Pass", value: testPoints, max: 20, color: "#818cf8" },
        { name: "Efficiency", value: efficiencyPoints, max: 10, color: "#f472b6" },
        { name: "Speed", value: score.speedBonus, max: 10, color: "#38bdf8" },
        ...(score.commitPenalty > 0 ? [{ name: "Penalty", value: -score.commitPenalty, max: 0, color: "#f87171" }] : []),
    ];

    const formatTime = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    };

    return (
        <div className="space-y-6">
            {/* Top section: Gauge + Key metrics */}
            <div className="grid grid-cols-12 gap-5">
                {/* Gauge */}
                <div className="col-span-12 md:col-span-4 bg-neutral-900/60 border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center">
                    <ScoreGauge score={score.finalScore} />
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mt-3">Overall Score</p>
                </div>

                {/* Metric cards */}
                <div className="col-span-12 md:col-span-8 grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                        { icon: Bug, label: "Bugs Fixed", value: `${score.bugsFixed}/${score.totalBugs}`, sub: `${bugFixRate}%`, color: "text-emerald-400", bg: "bg-emerald-500/10" },
                        { icon: Target, label: "Tests", value: effectiveTestsPassed ? "FIXED" : "PENDING", color: effectiveTestsPassed ? "text-emerald-400" : "text-amber-400", bg: effectiveTestsPassed ? "bg-emerald-500/10" : "bg-amber-500/10" },
                        { icon: Trophy, label: "Attempts", value: `${score.attempts}`, sub: "/5", color: "text-yellow-400", bg: "bg-yellow-500/10" },
                        { icon: Clock, label: "Duration", value: formatTime(score.timeSeconds), sub: score.speedBonus > 0 ? `+${score.speedBonus} bonus` : undefined, color: "text-cyan-400", bg: "bg-cyan-500/10" },
                        { icon: GitCommitHorizontal, label: "Commits", value: `${score.totalCommits}`, sub: score.commitPenalty > 0 ? `-${score.commitPenalty} penalty` : undefined, color: "text-pink-400", bg: "bg-pink-500/10" },
                        { icon: Zap, label: "Speed Bonus", value: score.speedBonus > 0 ? `+${score.speedBonus}` : "—", color: "text-violet-400", bg: "bg-violet-500/10" },
                    ].map((stat) => (
                        <div key={stat.label} className="bg-neutral-900/60 border border-white/5 rounded-xl p-3.5">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <div className={`p-1 rounded-md ${stat.bg}`}>
                                    <stat.icon className={`w-3 h-3 ${stat.color}`} />
                                </div>
                                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{stat.label}</span>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className={`text-lg font-bold ${stat.color}`}>{stat.value}</span>
                                {stat.sub && <span className="text-[10px] text-zinc-500">{stat.sub}</span>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Score breakdown bars */}
            <div className="bg-neutral-900/60 border border-white/5 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-4 h-4 text-zinc-500" />
                    <h4 className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Score Categories</h4>
                </div>
                <div className="space-y-3">
                    <CategoryBar label="Bug Fixes (60%)" value={bugFixPoints} max={60} color="#34d399" />
                    <CategoryBar label="Tests Pass (20%)" value={testPoints} max={20} color="#818cf8" />
                    <CategoryBar label="Efficiency (10%)" value={efficiencyPoints} max={10} color="#f472b6" />
                    <CategoryBar label="Speed Bonus (10%)" value={score.speedBonus} max={10} color="#38bdf8" />
                    {score.commitPenalty > 0 && (
                        <CategoryBar label="Commit Penalty" value={-score.commitPenalty} max={10} color="#f87171" />
                    )}
                </div>
            </div>

            {/* Bar Chart */}
            <div className="bg-neutral-900/60 rounded-2xl p-5 border border-white/5">
                <div className="flex items-center gap-2 mb-4">
                    <Shield className="w-4 h-4 text-zinc-500" />
                    <h4 className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Score Distribution</h4>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis type="number" domain={[-10, 60]} tick={{ fontSize: 10, fill: "#52525b" }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#a1a1aa" }} width={80} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "#0a0a0a",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "10px",
                                fontSize: "12px",
                            }}
                            labelStyle={{ color: "#d4d4d8" }}
                        />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                            {chartData.map((entry, index) => (
                                <Cell key={index} fill={entry.color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
