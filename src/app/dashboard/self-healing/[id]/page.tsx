"use client";

/**
 * ============================================================================
 * SELF-HEALING - SESSION DETAIL PAGE
 * ============================================================================
 * Live dashboard showing timeline, bug table, score breakdown, and log viewer.
 * This is THE PRIMARY JUDGING TOOL for RIFT 2026.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import {
    ArrowLeft,
    GitBranch,
    GitPullRequest,
    ExternalLink,
    Loader2,
    Terminal,
    AlertTriangle,
    XCircle,
    Download,
} from "lucide-react";
import { StatusBadge } from "@/components/self-healing/StatusBadge";
import { HealingTimeline } from "@/components/self-healing/HealingTimeline";
import { BugTable } from "@/components/self-healing/BugTable";
import { ScoreBreakdown } from "@/components/self-healing/ScoreBreakdown";
import { AttestationLog } from "@/components/self-healing/AttestationLog";
import { FileTree } from "@/components/self-healing/FileTree";
import type {
    HealingStatus,
    HealingBug,
    HealingAttempt,
    HealingScore,
    HealingEvent,
} from "@/types";

interface SessionDetail {
    id: string;
    repoUrl: string;
    repoOwner: string;
    repoName: string;
    branchName: string;
    status: HealingStatus;
    currentAttempt: number;
    maxAttempts: number;
    bugs: HealingBug[];
    attempts: HealingAttempt[];
    score: HealingScore | null;
    startedAt: string;
    completedAt?: string;
    updatedAt?: string;
    error?: string;
    prUrl?: string;
    prNumber?: number;
}

export default function SessionDetailPage() {
    const { id } = useParams();
    const { isSignedIn } = useAuth();
    const [session, setSession] = useState<SessionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<"timeline" | "files" | "bugs" | "score" | "attestations" | "logs">(
        "timeline"
    );
    const logsEndRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const [isStale, setIsStale] = useState(false);
    const [markingFailed, setMarkingFailed] = useState(false);

    // Fetch session details
    const fetchSession = useCallback(async () => {
        if (!id) return;
        try {
            const res = await fetch(`/api/self-healing/sessions/${id}`);
            if (res.ok) {
                const data = await res.json();
                const fetched = data.session;
                // Normalize fields that may be undefined in Firestore
                fetched.bugs = fetched.bugs || [];
                fetched.attempts = fetched.attempts || [];
                fetched.score = fetched.score || null;

                setSession((prev) => {
                    if (!prev) return fetched;
                    // Merge: keep SSE-added bugs that aren't in DB yet
                    const dbBugIds = new Set(fetched.bugs.map((b: HealingBug) => b.id));
                    const sseBugs = prev.bugs.filter((b) => !dbBugIds.has(b.id) && !b.id.startsWith('bug-'));
                    // Also keep client-generated bugs (from SSE) if DB has fewer
                    const clientBugs = prev.bugs.filter((b) => b.id.startsWith('bug-'));
                    const mergedBugs = fetched.bugs.length >= prev.bugs.length
                        ? fetched.bugs
                        : [...fetched.bugs, ...clientBugs.filter((cb) => !fetched.bugs.some((fb: HealingBug) => fb.filePath === cb.filePath && fb.line === cb.line))];
                    return {
                        ...fetched,
                        bugs: mergedBugs,
                        attempts: fetched.attempts.length >= prev.attempts.length ? fetched.attempts : prev.attempts,
                    };
                });
            }
        } catch (err) {
            console.error("Failed to fetch session:", err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (isSignedIn && id) {
            fetchSession();
        }
    }, [isSignedIn, id, fetchSession]);

    // SSE streaming
    useEffect(() => {
        if (!id || !isSignedIn) return;

        const eventSource = new EventSource(`/api/self-healing/stream/${id}`);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
            try {
                const healingEvent: HealingEvent = JSON.parse(event.data);

                switch (healingEvent.type) {
                    case "status":
                        setSession((prev) =>
                            prev
                                ? {
                                    ...prev,
                                    status: healingEvent.data.status as HealingStatus,
                                }
                                : prev
                        );
                        setLogs((prev) => [
                            ...prev,
                            `[${healingEvent.data.status}] ${healingEvent.data.message}`,
                        ]);
                        break;

                    case "log":
                        setLogs((prev) => [
                            ...prev,
                            `${healingEvent.data.level === "error" ? "❌" : healingEvent.data.level === "warn" ? "⚠️" : "ℹ️"} ${healingEvent.data.message}`,
                        ]);
                        break;

                    case "bug_found":
                        setSession((prev) => {
                            if (!prev) return prev;
                            const newBug: HealingBug = {
                                id: `bug-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                category: healingEvent.data.category as HealingBug["category"],
                                filePath: healingEvent.data.filePath as string,
                                line: healingEvent.data.line as number,
                                message: healingEvent.data.message as string,
                                severity: "high",
                                fixed: false,
                            };
                            const existingBugs = prev.bugs || [];
                            return { ...prev, bugs: [...existingBugs, newBug] };
                        });
                        break;

                    case "fix_applied":
                        setSession((prev) => {
                            if (!prev) return prev;
                            const fixFilePath = healingEvent.data.filePath as string;
                            const fixBugId = healingEvent.data.bugId as string;
                            const desc = (healingEvent.data.description as string) || "";
                            // Extract line number from description like "Fixed LINTING error at line 10"
                            const lineMatch = desc.match(/line (\d+)/);
                            const fixLine = lineMatch ? parseInt(lineMatch[1], 10) : null;

                            const updatedBugs = (prev.bugs || []).map((b) => {
                                if (b.fixed) return b;
                                // Match by server bugId OR by filePath + line
                                if (
                                    b.id === fixBugId ||
                                    (b.filePath === fixFilePath && fixLine && b.line === fixLine)
                                ) {
                                    return { ...b, fixed: true, fixedAtAttempt: prev.currentAttempt || 1 };
                                }
                                return b;
                            });
                            return { ...prev, bugs: updatedBugs };
                        });
                        setLogs((prev) => [
                            ...prev,
                            `🔧 Fixed: ${healingEvent.data.filePath} - ${healingEvent.data.description}`,
                        ]);
                        break;

                    case "test_result":
                        setLogs((prev) => [
                            ...prev,
                            (healingEvent.data.passed as boolean)
                                ? `🧪 Test PASSED ✅ (attempt ${healingEvent.data.attempt as number})`
                                : (healingEvent.data.errorCount as number) > 0
                                    ? `🧪 Test exited with ${healingEvent.data.errorCount as number} error(s) — scanning for fixes (attempt ${healingEvent.data.attempt as number})`
                                    : `🧪 Tests need fixes — AI scanner analyzing source code (attempt ${healingEvent.data.attempt as number})`,
                        ]);
                        break;

                    case "attempt_complete":
                        setSession((prev) => {
                            if (!prev) return prev;
                            const newAttempt: HealingAttempt = {
                                attempt: healingEvent.data.attempt as number,
                                status: healingEvent.data.status as HealingAttempt["status"],
                                testOutput: "",
                                bugsFound: healingEvent.data.bugsFound as number,
                                bugsFixed: healingEvent.data.bugsFixed as number,
                                durationMs: healingEvent.data.durationMs as number,
                                timestamp: new Date().toISOString(),
                            };
                            return {
                                ...prev,
                                attempts: [...prev.attempts, newAttempt],
                                currentAttempt: (healingEvent.data.attempt as number) + 1,
                            };
                        });
                        break;

                    case "score":
                        setSession((prev) =>
                            prev
                                ? {
                                    ...prev,
                                    score: healingEvent.data as unknown as HealingScore,
                                }
                                : prev
                        );
                        // Auto-switch to score tab
                        setActiveTab("score");
                        break;

                    case "error":
                        setLogs((prev) => [
                            ...prev,
                            `💀 Error: ${healingEvent.data.error}`,
                        ]);
                        break;
                }
            } catch {
                // Ignore parse errors
            }
        };

        eventSource.addEventListener("done", () => {
            eventSource.close();
            // Refresh session data from DB
            fetchSession();
        });

        eventSource.onerror = () => {
            // Will auto-reconnect
        };

        return () => {
            eventSource.close();
        };
    }, [id, isSignedIn, fetchSession]);

    // Auto-scroll logs
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    const isActive = session
        ? !["completed", "failed", "partial_success"].includes(session.status)
        : false;

    // Detect stale/orphaned sessions (server restarted while healing was running)
    useEffect(() => {
        if (!session || !isActive) {
            setIsStale(false);
            return;
        }
        const updatedAt = session.updatedAt
            ? new Date(session.updatedAt).getTime()
            : new Date(session.startedAt).getTime();
        const staleCutoff = Date.now() - 2 * 60 * 1000; // 2 minutes
        setIsStale(updatedAt < staleCutoff);
    }, [session, isActive]);

    // Poll Firestore while session is active (recovers state after navigation)
    useEffect(() => {
        if (!isActive || isStale) return;
        const interval = setInterval(() => {
            fetchSession();
        }, 5000);
        return () => clearInterval(interval);
    }, [isActive, isStale, fetchSession]);

    // Mark an orphaned session as failed
    const handleMarkFailed = async () => {
        if (!id) return;
        setMarkingFailed(true);
        try {
            const res = await fetch(`/api/self-healing/sessions/${id}/fail`, {
                method: "POST",
            });
            if (res.ok) {
                await fetchSession();
                setIsStale(false);
            }
        } catch (err) {
            console.error("Failed to mark session as failed:", err);
        } finally {
            setMarkingFailed(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
            </div>
        );
    }

    if (!session) {
        return (
            <div className="max-w-4xl mx-auto px-6 py-12 text-center">
                <p className="text-zinc-500">Session not found.</p>
                <Link
                    href="/dashboard/self-healing"
                    className="text-emerald-400 text-sm mt-2 inline-block hover:underline"
                >
                    ← Back to Self-Healing
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="space-y-2">
                    <Link
                        href="/dashboard/self-healing"
                        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Back to Self-Healing
                    </Link>

                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                            <GitBranch className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-zinc-200">
                                {session.repoOwner}/{session.repoName}
                            </h1>
                            <p className="text-xs text-zinc-500 mt-0.5">
                                Branch: <code className="text-zinc-400">{session.branchName}</code>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <StatusBadge status={session.status} />
                    <a
                        href={session.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </a>
                </div>
            </div>

            {/* PR Link Banner */}
            {session.prUrl && (
                <a
                    href={session.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/15 transition-colors group"
                >
                    <GitPullRequest className="w-5 h-5 text-emerald-400" />
                    <div className="flex-1">
                        <span className="text-sm font-medium text-emerald-300">
                            Pull Request {session.prNumber ? `#${session.prNumber}` : "Created"}
                        </span>
                        <span className="text-xs text-zinc-500 ml-2">
                            {session.branchName} → main
                        </span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
                </a>
            )}

            {/* Download Result JSON */}
            {!isActive && session.score && (
                <button
                    onClick={() => {
                        const result = {
                            sessionId: session.id,
                            repository: `${session.repoOwner}/${session.repoName}`,
                            branch: session.branchName,
                            status: session.status,
                            startedAt: session.startedAt,
                            completedAt: session.completedAt || new Date().toISOString(),
                            summary: {
                                totalBugsFound: session.score!.totalBugs,
                                bugsFixed: session.score!.bugsFixed,
                                fixRate: session.score!.totalBugs > 0
                                    ? `${Math.round((session.score!.bugsFixed / session.score!.totalBugs) * 100)}%`
                                    : "N/A",
                                testsPassed: session.score!.testsPassed,
                                attemptsUsed: session.score!.attempts,
                                totalCommits: session.score!.totalCommits,
                                durationSeconds: session.score!.timeSeconds,
                                finalScore: session.score!.finalScore,
                            },
                            pullRequest: session.prUrl
                                ? { url: session.prUrl, number: session.prNumber || null }
                                : null,
                            bugs: session.bugs.map((b) => ({
                                category: b.category,
                                filePath: b.filePath,
                                line: b.line,
                                message: b.message,
                                severity: b.severity,
                                fixed: b.fixed,
                                fixedAtAttempt: b.fixedAtAttempt || null,
                            })),
                            attempts: session.attempts.map((a) => ({
                                attempt: a.attempt,
                                status: a.status,
                                bugsFound: a.bugsFound,
                                bugsFixed: a.bugsFixed,
                                durationMs: a.durationMs,
                                commitSha: a.commitSha || null,
                            })),
                            score: session.score,
                        };

                        const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `result-${session.repoName}-${session.id.slice(0, 8)}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }}
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-violet-500/10 border border-violet-500/20 rounded-xl hover:bg-violet-500/20 transition-colors group"
                >
                    <Download className="w-4 h-4 text-violet-400 group-hover:text-violet-300 transition-colors" />
                    <span className="text-sm font-medium text-violet-300 group-hover:text-violet-200 transition-colors">
                        Download Result JSON
                    </span>
                </button>
            )}

            {/* Stats Overview */}
            {session.bugs.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        {
                            label: "Bugs Fixed",
                            value: `${session.bugs.filter((b) => b.fixed).length}/${session.bugs.length}`,
                            color: session.bugs.every((b) => b.fixed) ? "text-emerald-400" : "text-amber-400",
                            bg: session.bugs.every((b) => b.fixed) ? "bg-emerald-500/10 border-emerald-500/20" : "bg-amber-500/10 border-amber-500/20",
                        },
                        {
                            label: "Files Affected",
                            value: `${new Set(session.bugs.map((b) => b.filePath)).size}`,
                            color: "text-blue-400",
                            bg: "bg-blue-500/10 border-blue-500/20",
                        },
                        {
                            label: "Attempts Used",
                            value: `${session.attempts.length}/${session.maxAttempts}`,
                            color: "text-violet-400",
                            bg: "bg-violet-500/10 border-violet-500/20",
                        },
                        {
                            label: "Score",
                            value: session.score ? `${session.score.finalScore}/100` : "—",
                            color: session.score
                                ? session.score.finalScore >= 80
                                    ? "text-emerald-400"
                                    : session.score.finalScore >= 50
                                        ? "text-yellow-400"
                                        : "text-red-400"
                                : "text-zinc-500",
                            bg: session.score
                                ? session.score.finalScore >= 80
                                    ? "bg-emerald-500/10 border-emerald-500/20"
                                    : "bg-yellow-500/10 border-yellow-500/20"
                                : "bg-white/5 border-white/5",
                        },
                    ].map((stat) => (
                        <div
                            key={stat.label}
                            className={`rounded-xl border p-3.5 ${stat.bg} backdrop-blur-sm`}
                        >
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
                                {stat.label}
                            </div>
                            <div className={`text-xl font-bold ${stat.color}`}>
                                {stat.value}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Active progress bar */}
            {isActive && !isStale && (
                <div className="relative h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full animate-pulse"
                        style={{
                            width: `${Math.max(
                                10,
                                (session.currentAttempt / session.maxAttempts) * 100
                            )}%`,
                        }}
                    />
                </div>
            )}

            {/* Interrupted/Stale Session Banner */}
            {isStale && (
                <div className="relative bg-gradient-to-r from-amber-950/50 via-neutral-900/80 to-orange-950/50 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-5">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-amber-500/20 rounded-lg mt-0.5">
                                <AlertTriangle className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-amber-200">
                                    Session Interrupted
                                </h3>
                                <p className="text-xs text-zinc-400 mt-1 max-w-lg">
                                    The server was restarted while this healing session was running.
                                    The background process has been lost. You can mark this session
                                    as failed and start a new one.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleMarkFailed}
                            disabled={markingFailed}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                            {markingFailed ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <XCircle className="w-3.5 h-3.5" />
                            )}
                            Mark as Failed
                        </button>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-neutral-900/50 rounded-xl p-1 border border-white/5">
                {[
                    { key: "timeline" as const, label: "Timeline", count: session.attempts.length },
                    { key: "files" as const, label: "📁 Files", count: new Set(session.bugs.map((b) => b.filePath)).size },
                    { key: "bugs" as const, label: "Bugs", count: session.bugs.length },
                    { key: "score" as const, label: "Score", count: null },
                    { key: "attestations" as const, label: "⛓️ On-Chain", count: null },
                    { key: "logs" as const, label: "Logs", count: logs.length },
                ].map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-1 px-4 py-2.5 rounded-lg text-xs font-medium transition-all ${activeTab === tab.key
                            ? "bg-white/10 text-zinc-200"
                            : "text-zinc-500 hover:text-zinc-300"
                            }`}
                    >
                        {tab.label}
                        {tab.count !== null && tab.count > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 bg-white/10 rounded-md text-[10px]">
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
                {activeTab === "timeline" && (
                    <HealingTimeline
                        attempts={session.attempts}
                        currentAttempt={session.currentAttempt}
                        maxAttempts={session.maxAttempts}
                        isActive={isActive}
                    />
                )}

                {activeTab === "files" && <FileTree bugs={session.bugs} />}

                {activeTab === "bugs" && <BugTable bugs={session.bugs} />}

                {activeTab === "score" && (
                    session.score ? (
                        <ScoreBreakdown score={session.score} hasPR={!!session.prUrl} />
                    ) : (
                        <div className="text-center py-12">
                            <p className="text-zinc-500 text-sm">
                                {isActive
                                    ? "Score will be calculated when the session completes..."
                                    : "No score available for this session."}
                            </p>
                        </div>
                    )
                )}

                {activeTab === "attestations" && (
                    <AttestationLog sessionId={session.id} />
                )}

                {activeTab === "logs" && (
                    <div className="bg-neutral-950/60 rounded-xl border border-white/5 p-4">
                        <div className="flex items-center gap-2 mb-3 text-xs text-zinc-500">
                            <Terminal className="w-3.5 h-3.5" />
                            <span>Live Output</span>
                            {isActive && (
                                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            )}
                        </div>
                        <div className="font-mono text-xs space-y-0.5 max-h-[500px] overflow-y-auto">
                            {logs.length === 0 ? (
                                <p className="text-zinc-600">Waiting for events...</p>
                            ) : (
                                logs.map((log, i) => (
                                    <div
                                        key={i}
                                        className={`py-0.5 ${log.includes("❌") || log.includes("💀")
                                            ? "text-red-400"
                                            : log.includes("✅") || log.includes("🎉")
                                                ? "text-emerald-400"
                                                : log.includes("⚠️")
                                                    ? "text-yellow-400"
                                                    : log.includes("🔧")
                                                        ? "text-cyan-400"
                                                        : "text-zinc-400"
                                            }`}
                                    >
                                        {log}
                                    </div>
                                ))
                            )}
                            <div ref={logsEndRef} />
                        </div>
                    </div>
                )}
            </div>

            {/* Error message */}
            {session.error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                    <p className="text-sm text-red-400">{session.error}</p>
                </div>
            )}
        </div>
    );
}
