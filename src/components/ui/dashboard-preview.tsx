"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import useSWR from "swr";
import {
    Shield,
    Presentation,
    Coins,
    Database,
    ArrowRight,
    Activity,
    Sparkles,
    TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";

/**
 * ============================================================================
 * DASHBOARD PREVIEW - LANDING PAGE COMPONENT
 * ============================================================================
 * Shows a preview of the dashboard with real data for logged-in users
 * and dummy data for visitors.
 */

interface DashboardStats {
    codeReviews: { total: number; thisWeek: number };
    pitchDecks: { total: number; completed: number };
    equityProjects: { total: number; transfers: number };
    databaseQueries: { connections: number; queries: number };
}

// Dummy data for non-logged-in users
const dummyStats: DashboardStats = {
    codeReviews: { total: 247, thisWeek: 12 },
    pitchDecks: { total: 89, completed: 76 },
    equityProjects: { total: 34, transfers: 156 },
    databaseQueries: { connections: 8, queries: 1240 },
};

// Fetcher for SWR
const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Agent cards configuration
const agents = [
    {
        id: "code-police",
        name: "Code Police",
        description: "AI-powered code review",
        icon: Shield,
        iconBg: "bg-violet-500/10",
        iconColor: "text-violet-400",
        glowClass: "hover:shadow-[0_0_40px_-8px_rgba(139,92,246,0.5)]",
    },
    {
        id: "pitch-deck",
        name: "Pitch Deck",
        description: "Generate stunning decks",
        icon: Presentation,
        iconBg: "bg-cyan-500/10",
        iconColor: "text-cyan-400",
        glowClass: "hover:shadow-[0_0_40px_-8px_rgba(6,182,212,0.5)]",
    },
    {
        id: "equity",
        name: "Equity",
        description: "Token management",
        icon: Coins,
        iconBg: "bg-emerald-500/10",
        iconColor: "text-emerald-400",
        glowClass: "hover:shadow-[0_0_40px_-8px_rgba(16,185,129,0.5)]",
    },
    {
        id: "database",
        name: "Database",
        description: "Chat with your DB",
        icon: Database,
        iconBg: "bg-orange-500/10",
        iconColor: "text-orange-400",
        glowClass: "hover:shadow-[0_0_40px_-8px_rgba(249,115,22,0.5)]",
    },
];

// Stat card configurations
const statConfigs = [
    {
        key: "reviews",
        label: "Code Reviews",
        icon: Shield,
        iconBg: "bg-violet-500/10",
        iconColor: "text-violet-400",
        borderColor: "border-l-violet-500/30",
    },
    {
        key: "decks",
        label: "Pitch Decks",
        icon: Presentation,
        iconBg: "bg-cyan-500/10",
        iconColor: "text-cyan-400",
        borderColor: "border-l-cyan-500/30",
    },
    {
        key: "projects",
        label: "Equity Projects",
        icon: Coins,
        iconBg: "bg-emerald-500/10",
        iconColor: "text-emerald-400",
        borderColor: "border-l-emerald-500/30",
    },
    {
        key: "connections",
        label: "DB Connections",
        icon: Database,
        iconBg: "bg-orange-500/10",
        iconColor: "text-orange-400",
        borderColor: "border-l-orange-500/30",
    },
];

export function DashboardPreview() {
    const { isSignedIn, user } = useUser();

    // Only fetch real data if user is signed in
    const { data } = useSWR<{ stats: DashboardStats }>(
        isSignedIn ? "/api/dashboard/stats" : null,
        fetcher,
        { refreshInterval: 30000 }
    );

    const stats = isSignedIn && data?.stats ? data.stats : dummyStats;
    const userName = user?.firstName || "Founder";

    // Stat values array for mapping
    const statValues = [
        { value: stats.codeReviews.total, sub: `+${stats.codeReviews.thisWeek} this week` },
        { value: stats.pitchDecks.total, sub: `${stats.pitchDecks.completed} completed` },
        { value: stats.equityProjects.total, sub: `${stats.equityProjects.transfers} transactions` },
        { value: stats.databaseQueries.connections, sub: `${stats.databaseQueries.queries} queries` },
    ];

    return (
        <section className="relative py-20 px-4">
            {/* Section Header */}
            <div className="max-w-6xl mx-auto mb-12 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="space-y-4"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20">
                        <Sparkles className="w-4 h-4 text-violet-400" />
                        <span className="text-sm text-violet-300 font-medium">Live Dashboard Preview</span>
                    </div>
                    <h2 className="text-3xl md:text-4xl font-bold text-white">
                        {isSignedIn ? (
                            <>Welcome back, <span className="text-gradient-violet">{userName}</span></>
                        ) : (
                            <>Your AI Command Center</>
                        )}
                    </h2>
                    <p className="text-zinc-400 max-w-2xl mx-auto">
                        {isSignedIn
                            ? "Here's a quick look at your workspace activity"
                            : "See what your personalized dashboard will look like"}
                    </p>
                </motion.div>
            </div>

            {/* Dashboard Preview Container */}
            <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                viewport={{ once: true }}
                className="max-w-6xl mx-auto"
            >
                {/* Browser Frame */}
                <div className="rounded-2xl overflow-hidden border border-white/10 bg-neutral-950/50 backdrop-blur-xl shadow-2xl">
                    {/* Browser Header */}
                    <div className="flex items-center gap-2 px-4 py-3 bg-neutral-900/80 border-b border-white/5">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-500/80" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                            <div className="w-3 h-3 rounded-full bg-green-500/80" />
                        </div>
                        <div className="flex-1 flex justify-center">
                            <div className="px-4 py-1 rounded-md bg-neutral-800/50 text-xs text-zinc-400 font-mono">
                                protocolzero.dev/dashboard
                            </div>
                        </div>
                        <div className="w-16" />
                    </div>

                    {/* Dashboard Content */}
                    <div className="p-6 lg:p-8 space-y-6 bg-gradient-to-b from-neutral-950 to-neutral-900/50">
                        {/* Welcome Row */}
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                                    <span className="text-xs text-emerald-400 font-medium">All systems active</span>
                                </div>
                                <h3 className="text-xl font-semibold text-white">
                                    {isSignedIn ? `${userName}'s Workspace` : "Your Workspace"}
                                </h3>
                            </div>
                            {!isSignedIn && (
                                <div className="px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300">
                                    Demo Mode
                                </div>
                            )}
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {statConfigs.map((config, index) => (
                                <motion.div
                                    key={config.key}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.4, delay: 0.1 * index }}
                                    viewport={{ once: true }}
                                    className={`glass rounded-xl p-4 border-l-2 ${config.borderColor} hover:scale-[1.02] transition-transform duration-300`}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={`p-1.5 rounded-lg ${config.iconBg}`}>
                                            <config.icon className={`w-3.5 h-3.5 ${config.iconColor}`} />
                                        </div>
                                        <span className="text-xs text-zinc-400">{config.label}</span>
                                    </div>
                                    <p className="text-2xl font-bold text-white tabular-nums">
                                        {statValues[index].value.toLocaleString()}
                                    </p>
                                    <p className="text-xs text-zinc-500 mt-0.5">{statValues[index].sub}</p>
                                </motion.div>
                            ))}
                        </div>

                        {/* Agents Grid */}
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-widest">AI Agents</h4>
                                <div className="h-px flex-1 bg-gradient-to-r from-zinc-800 to-transparent" />
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                {agents.map((agent, index) => (
                                    <motion.div
                                        key={agent.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.4, delay: 0.1 * index }}
                                        viewport={{ once: true }}
                                    >
                                        <Link
                                            href="/dashboard"
                                            className={`group glass rounded-xl p-4 flex items-center gap-3 transition-all duration-300 hover:scale-[1.02] ${agent.glowClass}`}
                                        >
                                            <div className={`p-2 rounded-lg ${agent.iconBg} transition-transform duration-300 group-hover:scale-110`}>
                                                <agent.icon className={`w-4 h-4 ${agent.iconColor}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h5 className="text-sm font-medium text-zinc-100 group-hover:text-white transition-colors truncate">
                                                    {agent.name}
                                                </h5>
                                                <p className="text-xs text-zinc-500 truncate">{agent.description}</p>
                                            </div>
                                            <ArrowRight className={`w-4 h-4 ${agent.iconColor} opacity-0 group-hover:opacity-100 transition-all duration-300`} />
                                        </Link>
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        {/* Activity Preview */}
                        <div className="glass rounded-xl p-4">
                            <div className="flex items-center gap-3 mb-3">
                                <Activity className="w-4 h-4 text-zinc-400" />
                                <span className="text-xs font-medium text-zinc-400">Recent Activity</span>
                            </div>
                            <div className="space-y-2">
                                {[
                                    { type: "code-review", text: "Code review completed", time: "2m ago", color: "bg-violet-500" },
                                    { type: "pitch-deck", text: "Pitch deck generated", time: "15m ago", color: "bg-cyan-500" },
                                    { type: "equity", text: "Token transfer initiated", time: "1h ago", color: "bg-emerald-500" },
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.02] transition-colors">
                                        <div className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
                                        <span className="text-sm text-zinc-300 flex-1">{item.text}</span>
                                        <span className="text-xs text-zinc-600">{item.time}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* CTA Below Dashboard */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                    viewport={{ once: true }}
                    className="flex justify-center mt-8"
                >
                    <Link
                        href={isSignedIn ? "/dashboard" : "/sign-up"}
                        className="group inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-semibold hover:from-violet-500 hover:to-cyan-500 transition-all duration-300 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-105"
                    >
                        <span>{isSignedIn ? "Go to Dashboard" : "Start Building Now"}</span>
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </motion.div>
            </motion.div>
        </section>
    );
}

export default DashboardPreview;
