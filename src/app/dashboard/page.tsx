"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import useSWR from "swr";
import { useState, useEffect } from "react";
import {
  Shield,
  ArrowRight,
  Activity,
  Sparkles,
  HeartPulse,
  GitBranch,
  Bug,
  CheckCircle2,
  Lock,
  Globe,
  Zap,
  TrendingUp,
} from "lucide-react";

/**
 * ============================================================================
 * DASHBOARD HOME PAGE - DUAL FEATURE SHOWCASE
 * ============================================================================
 * Premium dark dashboard showcasing both Code Police and Self-Healing Code
 * features with descriptive cards, stats, and recent activity.
 */

// Types
interface DashboardStats {
  codeReviews: { total: number; thisWeek: number };
  recentActivity: ActivityItem[];
}

interface ActivityItem {
  id: string;
  type: "code-review" | "self-healing";
  title: string;
  description: string;
  timestamp: string;
}

// Fetcher for SWR
const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Time-based greeting (computed client-side only to avoid hydration mismatch)
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

// Activity type configurations
const activityConfig: Record<string, { icon: typeof Shield; dotClass: string; iconColor: string; bgColor: string }> = {
  "code-review": {
    icon: Shield,
    dotClass: "accent-dot-violet",
    iconColor: "text-violet-400",
    bgColor: "bg-violet-500/10",
  },
  "self-healing": {
    icon: Bug,
    dotClass: "accent-dot-emerald",
    iconColor: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
};

export default function DashboardPage() {
  const { user } = useUser();
  const firstName = user?.firstName || "there";

  // Compute greeting client-side only to prevent hydration mismatch
  const [greeting, setGreeting] = useState("Welcome");
  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  // Initialize user in Firestore on first dashboard load
  useSWR(
    user ? "/api/user/init" : null,
    (url: string) => fetch(url, { method: "POST" }).then((res) => res.json()),
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  // Fetch real-time stats
  const { data, isLoading } = useSWR<{ stats: DashboardStats }>(
    "/api/dashboard/stats",
    fetcher,
    { refreshInterval: 30000 }
  );

  const stats = data?.stats;

  return (
    <div className="p-6 lg:p-8 space-y-10 max-w-6xl mx-auto">
      {/* Premium Welcome Section */}
      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-violet-400 animate-float" />
          <span className="text-xs uppercase tracking-widest text-zinc-500 font-medium">
            Dashboard
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold">
          <span className="text-gradient">{greeting}, </span>
          <span className="text-gradient-violet">{firstName}</span>
        </h1>
        <p className="text-sm text-zinc-500 mt-2">
          Your AI-powered code intelligence platform
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          FEATURE SHOWCASE — Two descriptive feature cards
          ═══════════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest">
            AI Agents
          </h2>
          <div className="h-px flex-1 ml-4 bg-gradient-to-r from-zinc-800 to-transparent" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ─── CODE POLICE CARD ─── */}
          <Link href="/dashboard/code-police" className="group">
            <div className="relative glass rounded-2xl p-6 transition-all duration-300 hover:scale-[1.01] overflow-hidden border border-white/5 hover:border-violet-500/20">
              {/* Top accent */}
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-violet-500/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-violet-500/10 group-hover:bg-violet-500/20 transition-colors">
                    <Shield className="w-6 h-6 text-violet-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-100 group-hover:text-white transition-colors">
                      Code Police
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Lock className="w-3 h-3 text-zinc-500" />
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                        GitHub Auth Required
                      </span>
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-violet-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-300 mt-1" />
              </div>

              <p className="text-sm text-zinc-400 leading-relaxed mb-5">
                AI-powered <span className="text-zinc-200 font-medium">code maintainer</span> that monitors
                your GitHub repositories in real-time. Automatically analyzes every
                commit, detects security vulnerabilities, performance issues, and bugs,
                then creates auto-fix PRs.
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/[0.03] rounded-lg p-3 text-center">
                  <GitBranch className="w-4 h-4 text-violet-400 mx-auto mb-1" />
                  <span className="text-[10px] text-zinc-500 block">Webhook-based</span>
                  <span className="text-xs text-zinc-300 font-medium">Auto Scan</span>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3 text-center">
                  <Shield className="w-4 h-4 text-violet-400 mx-auto mb-1" />
                  <span className="text-[10px] text-zinc-500 block">Security</span>
                  <span className="text-xs text-zinc-300 font-medium">& Bugs</span>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3 text-center">
                  <CheckCircle2 className="w-4 h-4 text-violet-400 mx-auto mb-1" />
                  <span className="text-[10px] text-zinc-500 block">Auto-Fix</span>
                  <span className="text-xs text-zinc-300 font-medium">PRs</span>
                </div>
              </div>

              {/* Stats bar */}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-xs text-zinc-400">
                    {isLoading ? "..." : `${stats?.codeReviews.total ?? 0} reviews`}
                  </span>
                </div>
                <span className="text-xs text-zinc-600">
                  {isLoading ? "" : `+${stats?.codeReviews.thisWeek ?? 0} this week`}
                </span>
              </div>
            </div>
          </Link>

          {/* ─── SELF-HEALING CODE CARD ─── */}
          <Link href="/dashboard/self-healing" className="group">
            <div className="relative glass rounded-2xl p-6 transition-all duration-300 hover:scale-[1.01] overflow-hidden border border-white/5 hover:border-emerald-500/20">
              {/* Top accent */}
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                    <HeartPulse className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-100 group-hover:text-white transition-colors">
                      Self-Healing Code
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Globe className="w-3 h-3 text-zinc-500" />
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                        Any Public Repo URL
                      </span>
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-emerald-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-300 mt-1" />
              </div>

              <p className="text-sm text-zinc-400 leading-relaxed mb-5">
                AI agent that <span className="text-zinc-200 font-medium">automatically heals broken code</span>.
                Enter any GitHub URL — the agent clones it into a sandbox, runs tests,
                finds bugs, writes fixes, commits with{" "}
                <code className="text-emerald-400 text-xs bg-emerald-500/10 px-1.5 py-0.5 rounded">[AI-AGENT]</code>{" "}
                prefix, and iterates up to 5 times.
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/[0.03] rounded-lg p-3 text-center">
                  <Bug className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                  <span className="text-[10px] text-zinc-500 block">Detect</span>
                  <span className="text-xs text-zinc-300 font-medium">& Fix Bugs</span>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3 text-center">
                  <Zap className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                  <span className="text-[10px] text-zinc-500 block">5 Iterations</span>
                  <span className="text-xs text-zinc-300 font-medium">Auto Retry</span>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3 text-center">
                  <GitBranch className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                  <span className="text-[10px] text-zinc-500 block">Auto PR</span>
                  <span className="text-xs text-zinc-300 font-medium">Creation</span>
                </div>
              </div>

              {/* Rules bar */}
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/5">
                <code className="text-[10px] text-emerald-400/70 bg-emerald-500/5 px-2 py-1 rounded-md font-mono">
                  TEAMNAME_LEADERNAME_AI_Fix
                </code>
                <span className="text-[10px] text-zinc-600">•</span>
                <span className="text-[10px] text-zinc-500">Sandbox execution</span>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          COMPLIANCE & RULES SECTION
          ═══════════════════════════════════════════════════════════════════ */}
      

      {/* ═══════════════════════════════════════════════════════════════════
          RECENT ACTIVITY
          ═══════════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-widest">
            Recent Activity
          </h2>
          <div className="h-px flex-1 ml-4 bg-gradient-to-r from-zinc-800 to-transparent" />
        </div>
        <div className="glass rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="p-5 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 animate-pulse">
                  <div className="w-9 h-9 rounded-lg bg-zinc-800/60" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-zinc-800/60 rounded" />
                    <div className="h-3 w-48 bg-zinc-800/40 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div className="divide-y divide-white/5">
              {stats.recentActivity.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} />
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-800/50 mb-3">
                <Activity className="w-5 h-5 text-zinc-500" />
              </div>
              <p className="text-zinc-400 text-sm font-medium">No activity yet</p>
              <p className="text-zinc-600 text-xs mt-1">
                Connect a repo to Code Police or start a Self-Healing session
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Activity Row
function ActivityRow({ activity }: { activity: ActivityItem }) {
  const config = activityConfig[activity.type] || activityConfig["code-review"];
  const Icon = config.icon;

  // Compute relative time client-side only to prevent hydration mismatch
  const [timeLabel, setTimeLabel] = useState("");
  useEffect(() => {
    const formatTime = (timestamp: string) => {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    };
    setTimeLabel(formatTime(activity.timestamp));
  }, [activity.timestamp]);

  return (
    <div className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors group cursor-pointer">
      <div className={`p-2 rounded-lg ${config.bgColor} transition-transform duration-200 group-hover:scale-105`}>
        <Icon className={`w-4 h-4 ${config.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className={`accent-dot ${config.dotClass}`} />
          <p className="text-sm text-zinc-200 font-medium truncate group-hover:text-white transition-colors">
            {activity.title}
          </p>
        </div>
        <p className="text-xs text-zinc-500 truncate mt-0.5">{activity.description}</p>
      </div>
      <span className="text-xs text-zinc-600 whitespace-nowrap" suppressHydrationWarning>
        {timeLabel}
      </span>
    </div>
  );
}
