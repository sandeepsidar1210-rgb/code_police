'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    RefreshCw,
    Loader2,
    AlertCircle,
    Star,
    GitFork,
    AlertTriangle,
    GitPullRequest,
    Users,
    FileCode,
    BookOpen,
    TestTube,
    Clock,
    TrendingUp,
    TrendingDown,
    Minus,
    Shield,
    Sparkles,
} from 'lucide-react';

import {
    HealthScoreGauge,
    MetricCard,
    MetricGrid,
    ActivityChart,
    LanguageBar,
    InsightPanel,
    ScoreBreakdown,
} from '@/components/code-police/analytics';

import type { FullAnalytics } from '@/lib/agents/code-police/analytics';
import type { AIInsights } from '@/lib/agents/code-police/analytics-ai';

/**
 * ============================================================================
 * CODE POLICE - ANALYTICS DASHBOARD
 * ============================================================================
 * Comprehensive repository analytics with:
 * - Health score visualization
 * - Activity trends
 * - Contributor statistics
 * - PR/Issue metrics
 * - AI-generated insights (minimal token usage)
 */

interface AnalyticsData extends FullAnalytics {
    aiInsights?: AIInsights & { cached: boolean };
}

export default function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const projectId = resolvedParams.id;

    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [projectName, setProjectName] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchAnalytics = async (fresh = false) => {
        if (fresh) setIsRefreshing(true);
        else setIsLoading(true);
        setError(null);

        try {
            // First get project info
            const projectRes = await fetch(`/api/code-police/projects/${projectId}`);
            const projectData = await projectRes.json();

            if (!projectRes.ok) {
                throw new Error(projectData.error || 'Failed to fetch project');
            }

            setProjectName(projectData.project.name);

            // Fetch analytics
            const url = `/api/code-police/analytics?projectId=${projectId}${fresh ? '&fresh=true' : ''}`;
            const res = await fetch(url);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to fetch analytics');
            }

            setAnalytics(data.analytics);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load analytics');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    // Fetch AI insights on demand (saves tokens)
    const fetchAIAnalytics = async () => {
        if (!analytics) return;
        setIsLoadingAI(true);
        try {
            const url = `/api/code-police/analytics?projectId=${projectId}&includeAI=true`;
            const res = await fetch(url);
            const data = await res.json();
            if (res.ok && data.analytics?.aiInsights) {
                setAnalytics({ ...analytics, aiInsights: data.analytics.aiInsights });
            }
        } catch (err) {
            console.error('Failed to fetch AI insights:', err);
        } finally {
            setIsLoadingAI(false);
        }
    };

    useEffect(() => {
        fetchAnalytics();
    }, [projectId]);

    const getTrendIcon = (trend: 'increasing' | 'stable' | 'decreasing') => {
        switch (trend) {
            case 'increasing': return <TrendingUp className="w-4 h-4 text-green-400" />;
            case 'decreasing': return <TrendingDown className="w-4 h-4 text-red-400" />;
            default: return <Minus className="w-4 h-4 text-zinc-400" />;
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-zinc-800 rounded-full" />
                    <div className="absolute inset-0 w-16 h-16 border-4 border-violet-500 rounded-full animate-spin border-t-transparent" />
                </div>
                <p className="text-zinc-400">Loading analytics...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 lg:p-8">
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-white mb-2">Error Loading Analytics</h2>
                    <p className="text-zinc-400 mb-4">{error}</p>
                    <div className="flex gap-3 justify-center">
                        <Link
                            href={`/dashboard/code-police/${projectId}`}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Project
                        </Link>
                        <button
                            onClick={() => fetchAnalytics()}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-white transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!analytics) return null;

    return (
        <div className="p-6 lg:p-8 space-y-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <Link
                        href={`/dashboard/code-police/${projectId}`}
                        className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Project
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-violet-500/10">
                            <Shield className="w-6 h-6 text-violet-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">{projectName} Analytics</h1>
                            <p className="text-zinc-400">Repository health and insights</p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => fetchAnalytics(true)}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {/* Top Section: Health Score + AI Summary */}
            <div className="grid lg:grid-cols-3 gap-6">
                {/* Health Score Card */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Health Score</h2>
                    <div className="flex flex-col items-center">
                        <HealthScoreGauge
                            score={analytics.healthScore.total}
                            grade={analytics.healthScore.grade}
                            size="lg"
                        />
                    </div>
                    <div className="mt-6">
                        <ScoreBreakdown components={analytics.healthScore.components} />
                    </div>
                </div>

                {/* AI Insights - Optional (generates tokens only on request) */}
                <div className="lg:col-span-2">
                    {analytics.aiInsights ? (
                        <InsightPanel
                            summary={analytics.aiInsights.summary}
                            actions={analytics.aiInsights.topActions}
                            cached={analytics.aiInsights.cached}
                        />
                    ) : (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-violet-500/10">
                                        <Sparkles className="w-5 h-5 text-violet-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white">AI Analysis</h3>
                                        <p className="text-sm text-zinc-400">Get AI-powered insights and recommendations</p>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={fetchAIAnalytics}
                                disabled={isLoadingAI}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-600/50 rounded-lg text-white font-medium transition-colors"
                            >
                                {isLoadingAI ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Generating insights...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4" />
                                        Generate AI Analysis
                                    </>
                                )}
                            </button>
                            <p className="text-xs text-zinc-500 mt-2 text-center">Uses AI tokens • Results cached for 7 days</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Stats */}
            <div>
                <h2 className="text-lg font-semibold text-white mb-4">Overview</h2>
                <MetricGrid columns={5}>
                    <MetricCard
                        title="Stars"
                        value={analytics.overview.stars.toLocaleString()}
                        icon={Star}
                        color="yellow"
                    />
                    <MetricCard
                        title="Forks"
                        value={analytics.overview.forks.toLocaleString()}
                        icon={GitFork}
                        color="blue"
                    />
                    <MetricCard
                        title="Open Issues"
                        value={analytics.issues.openCount.toLocaleString()}
                        icon={AlertTriangle}
                        color="orange"
                    />
                    <MetricCard
                        title="Open PRs"
                        value={analytics.pullRequests.openCount.toLocaleString()}
                        icon={GitPullRequest}
                        color="purple"
                    />
                    <MetricCard
                        title="Contributors"
                        value={analytics.contributors.total.toLocaleString()}
                        icon={Users}
                        color="green"
                    />
                </MetricGrid>
            </div>

            {/* 🚀 FOUNDER DASHBOARD - New Section */}
            {analytics.founderMetrics && (
                <div className="space-y-6">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        🚀 Founder Dashboard
                        <span className="text-xs font-normal text-zinc-500 bg-zinc-800 px-2 py-1 rounded">No AI tokens used</span>
                    </h2>

                    {/* Key Founder Metrics */}
                    <div className="grid md:grid-cols-4 gap-4">
                        {/* Delivery Velocity */}
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                            <div className="text-sm text-zinc-400 mb-1">Delivery Velocity</div>
                            <div className="text-2xl font-bold text-white">
                                {analytics.founderMetrics.deliveryVelocity}
                                <span className="text-sm font-normal text-zinc-400 ml-1">PRs/week</span>
                            </div>
                            <div className={`text-sm mt-1 ${analytics.founderMetrics.deliveryVelocityTrend === 'improving' ? 'text-green-400' :
                                analytics.founderMetrics.deliveryVelocityTrend === 'declining' ? 'text-red-400' : 'text-zinc-400'
                                }`}>
                                {analytics.founderMetrics.deliveryVelocityTrend === 'improving' && '↗ Improving'}
                                {analytics.founderMetrics.deliveryVelocityTrend === 'declining' && '↘ Declining'}
                                {analytics.founderMetrics.deliveryVelocityTrend === 'stable' && '→ Stable'}
                            </div>
                        </div>

                        {/* Tech Debt Score */}
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                            <div className="text-sm text-zinc-400 mb-1">Tech Debt Score</div>
                            <div className={`text-2xl font-bold ${analytics.founderMetrics.techDebtScore >= 70 ? 'text-green-400' :
                                analytics.founderMetrics.techDebtScore >= 40 ? 'text-yellow-400' : 'text-red-400'
                                }`}>
                                {analytics.founderMetrics.techDebtScore}
                                <span className="text-sm font-normal text-zinc-400 ml-1">/100</span>
                            </div>
                            <div className="text-xs text-zinc-500 mt-1">Higher is healthier</div>
                        </div>

                        {/* Scale Readiness */}
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                            <div className="text-sm text-zinc-400 mb-1">Scale Readiness</div>
                            <div className={`text-2xl font-bold ${analytics.founderMetrics.scaleReadinessScore >= 70 ? 'text-green-400' :
                                analytics.founderMetrics.scaleReadinessScore >= 40 ? 'text-yellow-400' : 'text-red-400'
                                }`}>
                                {analytics.founderMetrics.scaleReadinessScore}
                                <span className="text-sm font-normal text-zinc-400 ml-1">/100</span>
                            </div>
                            <div className="text-xs text-zinc-500 mt-1">Ready to scale?</div>
                        </div>

                        {/* Team Productivity */}
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                            <div className="text-sm text-zinc-400 mb-1">Team Productivity</div>
                            <div className="text-2xl font-bold text-white">
                                {analytics.founderMetrics.avgCommitsPerWeek}
                                <span className="text-sm font-normal text-zinc-400 ml-1">commits/week</span>
                            </div>
                            <div className="text-xs text-zinc-500 mt-1">
                                {analytics.founderMetrics.commitsPerContributor} per contributor
                            </div>
                        </div>
                    </div>

                    {/* Investor Readiness Checklist */}
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                            📋 Investor Readiness Checklist
                            <span className="text-xs font-normal text-zinc-500">
                                ({analytics.founderMetrics.investorChecklist.filter(i => i.passed).length}/{analytics.founderMetrics.investorChecklist.length} passed)
                            </span>
                        </h3>
                        <div className="grid md:grid-cols-3 gap-3">
                            {analytics.founderMetrics.investorChecklist.map((item, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-center gap-3 p-3 rounded-lg border ${item.passed
                                        ? 'bg-green-500/5 border-green-500/20'
                                        : 'bg-zinc-800/50 border-zinc-700/50'
                                        }`}
                                >
                                    <span className={`text-lg ${item.passed ? 'text-green-400' : 'text-zinc-500'}`}>
                                        {item.passed ? '✓' : '○'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-sm truncate ${item.passed ? 'text-white' : 'text-zinc-400'}`}>
                                            {item.item}
                                        </div>
                                        <div className={`text-xs ${item.importance === 'critical' ? 'text-red-400' :
                                            item.importance === 'important' ? 'text-yellow-400' : 'text-zinc-500'
                                            }`}>
                                            {item.importance}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Activity & Languages */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Activity Chart */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">Activity (90 days)</h2>
                        <div className="flex items-center gap-2 text-sm">
                            {getTrendIcon(analytics.activity.trend)}
                            <span className="text-zinc-400 capitalize">{analytics.activity.trend}</span>
                        </div>
                    </div>
                    <div className="mb-4">
                        <span className="text-3xl font-bold text-white">
                            {analytics.activity.commitsLast90Days}
                        </span>
                        <span className="text-zinc-400 ml-2">commits</span>
                    </div>
                    <ActivityChart
                        data={analytics.activity.commitsByWeek}
                        height={140}
                        color="#8b5cf6"
                    />
                </div>

                {/* Languages */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Languages</h2>
                    <div className="mb-4">
                        <span className="text-3xl font-bold text-white">
                            {analytics.overview.primaryLanguage || 'Unknown'}
                        </span>
                        <span className="text-zinc-400 ml-2">primary</span>
                    </div>
                    <LanguageBar languages={analytics.languages} />
                </div>
            </div>

            {/* Contributors & PR/Issues */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Contributors */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">Top Contributors</h2>
                        <div className={`flex items-center gap-2 text-sm px-2 py-1 rounded-lg ${analytics.contributors.busFactor <= 1
                            ? 'bg-red-500/10 text-red-400'
                            : analytics.contributors.busFactor <= 2
                                ? 'bg-yellow-500/10 text-yellow-400'
                                : 'bg-green-500/10 text-green-400'
                            }`}>
                            Bus Factor: {analytics.contributors.busFactor}
                        </div>
                    </div>
                    <div className="space-y-3">
                        {analytics.contributors.topContributors.slice(0, 5).map((contributor, index) => (
                            <div key={contributor.login} className="flex items-center gap-3">
                                <span className="text-zinc-500 text-sm w-4">{index + 1}</span>
                                <img
                                    src={contributor.avatar}
                                    alt={contributor.login}
                                    className="w-8 h-8 rounded-full"
                                />
                                <div className="flex-1">
                                    <p className="text-white font-medium">{contributor.login}</p>
                                    <p className="text-zinc-500 text-xs">{contributor.commits} commits</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-zinc-400 text-sm">{contributor.percentage}%</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* PR & Issue Metrics */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Workflow Metrics</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-zinc-800/50 rounded-xl">
                            <div className="flex items-center gap-2 mb-2">
                                <GitPullRequest className="w-4 h-4 text-purple-400" />
                                <span className="text-zinc-400 text-sm">PR Merge Time</span>
                            </div>
                            <p className="text-2xl font-bold text-white">
                                {analytics.pullRequests.avgMergeTimeHours > 0
                                    ? `${analytics.pullRequests.avgMergeTimeHours}h`
                                    : 'N/A'
                                }
                            </p>
                            <p className="text-zinc-500 text-xs mt-1">avg time to merge</p>
                        </div>
                        <div className="p-4 bg-zinc-800/50 rounded-xl">
                            <div className="flex items-center gap-2 mb-2">
                                <Clock className="w-4 h-4 text-blue-400" />
                                <span className="text-zinc-400 text-sm">Review Time</span>
                            </div>
                            <p className="text-2xl font-bold text-white">
                                {analytics.pullRequests.avgReviewTimeHours > 0
                                    ? `${analytics.pullRequests.avgReviewTimeHours}h`
                                    : 'N/A'
                                }
                            </p>
                            <p className="text-zinc-500 text-xs mt-1">avg first review</p>
                        </div>
                        <div className="p-4 bg-zinc-800/50 rounded-xl">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-4 h-4 text-orange-400" />
                                <span className="text-zinc-400 text-sm">Issue Close Time</span>
                            </div>
                            <p className="text-2xl font-bold text-white">
                                {analytics.issues.avgCloseTimeDays > 0
                                    ? `${analytics.issues.avgCloseTimeDays}d`
                                    : 'N/A'
                                }
                            </p>
                            <p className="text-zinc-500 text-xs mt-1">avg days to close</p>
                        </div>
                        <div className="p-4 bg-zinc-800/50 rounded-xl">
                            <div className="flex items-center gap-2 mb-2">
                                <GitPullRequest className="w-4 h-4 text-green-400" />
                                <span className="text-zinc-400 text-sm">PRs Merged (30d)</span>
                            </div>
                            <p className="text-2xl font-bold text-white">
                                {analytics.pullRequests.mergedLast30Days}
                            </p>
                            <p className="text-zinc-500 text-xs mt-1">last 30 days</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Documentation & Testing */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Documentation */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-blue-400" />
                            Documentation
                        </h2>
                        <span className={`px-2 py-1 rounded-lg text-sm font-medium ${analytics.documentation.score >= 70
                            ? 'bg-green-500/10 text-green-400'
                            : analytics.documentation.score >= 40
                                ? 'bg-yellow-500/10 text-yellow-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}>
                            {analytics.documentation.score}/100
                        </span>
                    </div>
                    <div className="space-y-3">
                        {[
                            { label: 'README', has: analytics.documentation.hasReadme },
                            { label: 'CONTRIBUTING', has: analytics.documentation.hasContributing },
                            { label: 'SECURITY', has: analytics.documentation.hasSecurity },
                            { label: 'LICENSE', has: analytics.documentation.hasLicense, extra: analytics.documentation.licenseType },
                            { label: 'CODE_OF_CONDUCT', has: analytics.documentation.hasCodeOfConduct },
                            { label: 'Docs directory', has: analytics.documentation.hasDocs },
                        ].map((doc) => (
                            <div key={doc.label} className="flex items-center justify-between">
                                <span className="text-zinc-300">{doc.label}</span>
                                <div className="flex items-center gap-2">
                                    {doc.extra && (
                                        <span className="text-xs text-zinc-500">{doc.extra}</span>
                                    )}
                                    <span className={doc.has ? 'text-green-400' : 'text-red-400'}>
                                        {doc.has ? '✓' : '✗'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Testing */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <TestTube className="w-5 h-5 text-emerald-400" />
                            Testing
                        </h2>
                        <span className={`px-2 py-1 rounded-lg text-sm font-medium ${analytics.testing.hasTests
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-red-500/10 text-red-400'
                            }`}>
                            {analytics.testing.hasTests ? 'Tests Found' : 'No Tests'}
                        </span>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-zinc-400">Test Files</span>
                            <span className="text-white font-medium">{analytics.testing.testFileCount}</span>
                        </div>
                        {analytics.testing.testFrameworks.length > 0 && (
                            <div>
                                <span className="text-zinc-400 text-sm">Frameworks</span>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {analytics.testing.testFrameworks.map((fw) => (
                                        <span
                                            key={fw}
                                            className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-sm rounded-lg"
                                        >
                                            {fw}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {analytics.testing.testDirectories.length > 0 && (
                            <div>
                                <span className="text-zinc-400 text-sm">Test Directories</span>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {analytics.testing.testDirectories.map((dir) => (
                                        <span
                                            key={dir}
                                            className="px-2 py-1 bg-zinc-800 text-zinc-300 text-sm rounded-lg font-mono"
                                        >
                                            /{dir}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="text-center text-zinc-500 text-sm">
                {analytics.aiInsights ? (
                    <>
                        AI insights generated: {new Date(analytics.aiInsights.generatedAt).toLocaleString()}
                        {analytics.aiInsights.cached && ' (cached for 7 days)'}
                    </>
                ) : (
                    <>Deterministic analytics • No AI tokens used</>
                )}
            </div>
        </div>
    );
}
