"use client";

/**
 * ============================================================================
 * SELF-HEALING - HEALING FORM COMPONENT (RIFT 2026)
 * ============================================================================
 * GitHub URL, Team Name, Leader Name inputs with branch preview.
 */

import { useState, useMemo } from "react";
import { GitBranch, Loader2, Zap, Users, User, ChevronDown, ChevronUp, ScrollText } from "lucide-react";

interface HealingFormProps {
    onSubmit: (repoUrl: string, teamName: string, leaderName: string, targetBranch: string, customRules?: string) => Promise<void>;
    isLoading: boolean;
}

export function HealingForm({ onSubmit, isLoading }: HealingFormProps) {
    const [repoUrl, setRepoUrl] = useState("");
    const [teamName, setTeamName] = useState("");
    const [leaderName, setLeaderName] = useState("");
    const [targetBranch, setTargetBranch] = useState("main");
    const [customRules, setCustomRules] = useState("");
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const validateUrl = (url: string): boolean => {
        const githubPattern = /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;
        return githubPattern.test(url.trim());
    };

    // Preview the branch name
    const branchPreview = useMemo(() => {
        if (!teamName.trim() || !leaderName.trim()) return null;
        const team = teamName.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
        const leader = leaderName.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
        return `${team}_${leader}_AI_Fix`;
    }, [teamName, leaderName]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!repoUrl.trim()) {
            setError("Please enter a GitHub repository URL");
            return;
        }

        if (!validateUrl(repoUrl)) {
            setError("Invalid GitHub URL. Expected format: https://github.com/owner/repo");
            return;
        }

        if (!teamName.trim()) {
            setError("Please enter your team name");
            return;
        }

        if (!leaderName.trim()) {
            setError("Please enter the team leader name");
            return;
        }

        try {
            await onSubmit(
                repoUrl.trim(),
                teamName.trim(),
                leaderName.trim(),
                targetBranch.trim() || "main",
                customRules.trim() || undefined,
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to start healing");
        }
    };

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
            <div className="relative group">
                {/* Glow effect */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 via-violet-500/20 to-cyan-500/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative bg-neutral-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                            <GitBranch className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-zinc-200">
                                Analyze Repository
                            </h3>
                            <p className="text-xs text-zinc-500">
                                Enter details below. The AI agent will clone, analyze, fix, and push automatically.
                            </p>
                        </div>
                    </div>

                    {/* GitHub URL */}
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                            GitHub Repository URL
                        </label>
                        <input
                            type="url"
                            value={repoUrl}
                            onChange={(e) => { setRepoUrl(e.target.value); setError(null); }}
                            placeholder="https://github.com/owner/repository"
                            className="w-full px-4 py-3 bg-neutral-950/60 border border-white/10 rounded-xl text-zinc-200 placeholder-zinc-600 
                               focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50
                               transition-all duration-200 text-sm"
                            disabled={isLoading}
                            id="repo-url-input"
                        />
                    </div>

                    {/* Team Name & Leader Name side by side */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-1.5">
                                <Users className="w-3 h-3" /> Team Name
                            </label>
                            <input
                                type="text"
                                value={teamName}
                                onChange={(e) => { setTeamName(e.target.value); setError(null); }}
                                placeholder="e.g. TECH CHAOS"
                                className="w-full px-4 py-3 bg-neutral-950/60 border border-white/10 rounded-xl text-zinc-200 placeholder-zinc-600 
                                   focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50
                                   transition-all duration-200 text-sm"
                                disabled={isLoading}
                                id="team-name-input"
                            />
                        </div>
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-1.5">
                                <User className="w-3 h-3" /> Team Leader Name
                            </label>
                            <input
                                type="text"
                                value={leaderName}
                                onChange={(e) => { setLeaderName(e.target.value); setError(null); }}
                                placeholder="e.g. Anurag Mishra"
                                className="w-full px-4 py-3 bg-neutral-950/60 border border-white/10 rounded-xl text-zinc-200 placeholder-zinc-600 
                                   focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50
                                   transition-all duration-200 text-sm"
                                disabled={isLoading}
                                id="leader-name-input"
                            />
                        </div>
                    </div>

                    {/* Target Branch */}
                    <div>
                        <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-1.5">
                            <GitBranch className="w-3 h-3" /> Target Branch
                        </label>
                        <input
                            type="text"
                            value={targetBranch}
                            onChange={(e) => { setTargetBranch(e.target.value); setError(null); }}
                            placeholder="main"
                            className="w-full px-4 py-3 bg-neutral-950/60 border border-white/10 rounded-xl text-zinc-200 placeholder-zinc-600 
                               focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50
                               transition-all duration-200 text-sm font-mono"
                            disabled={isLoading}
                            id="target-branch-input"
                        />
                        <p className="text-[10px] text-zinc-600 mt-1">The branch to clone and run tests against. Defaults to <code className="text-zinc-500">main</code>.</p>
                    </div>

                    {/* Branch name preview */}
                    {branchPreview && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
                            <GitBranch className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                            <span className="text-xs text-zinc-500">Branch:</span>
                            <code className="text-xs text-emerald-300 font-mono">{branchPreview}</code>
                            <span className="text-zinc-600 text-[10px]">← from <code className="text-zinc-500">{targetBranch || "main"}</code></span>
                        </div>
                    )}

                    {/* Advanced: Custom Rules (collapsible) */}
                    <div className="border border-white/5 rounded-xl overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-300 bg-neutral-950/40 hover:bg-neutral-950/60 transition-colors duration-200"
                        >
                            <span className="flex items-center gap-2">
                                <ScrollText className="w-3.5 h-3.5" />
                                Custom Rules for AI Agent
                                <span className="text-[10px] text-zinc-600 font-normal">(optional)</span>
                            </span>
                            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        {showAdvanced && (
                            <div className="px-4 pb-4 pt-2 bg-neutral-950/20">
                                <textarea
                                    value={customRules}
                                    onChange={(e) => setCustomRules(e.target.value)}
                                    placeholder={`e.g.\n- Do not remove any console.log statements\n- Prefer async/await over .then() chains\n- All functions must have docstrings\n- Ignore styling issues, focus only on logic bugs`}
                                    rows={4}
                                    className="w-full px-3 py-2.5 bg-neutral-950/60 border border-white/10 rounded-lg text-zinc-200 placeholder-zinc-600 
                                       focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50
                                       transition-all duration-200 text-xs font-mono resize-y min-h-[80px]"
                                    disabled={isLoading}
                                    id="custom-rules-input"
                                />
                                <p className="text-[10px] text-zinc-600 mt-1.5">These instructions will guide the AI scanner and fix engineer. Leave empty for default behavior.</p>
                            </div>
                        )}
                    </div>

                    {/* Submit button */}
                    <button
                        type="submit"
                        disabled={isLoading || !repoUrl.trim() || !teamName.trim() || !leaderName.trim()}
                        className="w-full px-6 py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 
                             text-white font-medium rounded-xl transition-all duration-200 
                             disabled:opacity-40 disabled:cursor-not-allowed
                             flex items-center justify-center gap-2 text-sm
                             shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
                        id="start-healing-btn"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Running Agent...
                            </>
                        ) : (
                            <>
                                <Zap className="w-4 h-4" />
                                Run Agent
                            </>
                        )}
                    </button>

                    {error && (
                        <p className="text-red-400 text-xs mt-2 flex items-center gap-1.5">
                            <span className="w-1 h-1 bg-red-400 rounded-full" />
                            {error}
                        </p>
                    )}
                </div>
            </div>
        </form>
    );
}
