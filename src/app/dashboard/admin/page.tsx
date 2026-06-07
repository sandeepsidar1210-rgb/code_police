"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    Users,
    FolderKanban,
    Activity,
    Coins,
    Shield,
    Presentation,
    Database,
    ArrowLeft,
    RefreshCw,
    Search,
    Filter,
    TrendingUp,
    Calendar,
    ChevronRight,
    Crown,
} from "lucide-react";
import { GhostfounderLoader } from "@/components/ui/ghostfounder-loader";

/**
 * ============================================================================
 * ADMIN PANEL
 * ============================================================================
 * Dashboard for admins to view all users, projects, and activities
 */

interface AdminStats {
    totalUsers: number;
    totalProjects: number;
    totalAnalyses: number;
    totalPitchDecks: number;
    totalEquityProjects: number;
    recentAnalyses: number;
    recentPitchDecks: number;
    totalTokensUsed: number;
}

interface AdminUser {
    id: string;
    email: string;
    fullName: string;
    imageUrl: string;
    createdAt: number;
    lastSignInAt: number | null;
    isPro?: boolean;
    stats: {
        projects: number;
        analyses: number;
        pitchDecks: number;
        equityProjects: number;
    };
}

interface AdminProject {
    id: string;
    name: string;
    type: "code-police" | "pitch-deck" | "equity";
    userId: string;
    status?: string;
    createdAt: string | null;
}

interface AdminActivity {
    id: string;
    type: string;
    title: string;
    description: string;
    userId: string;
    timestamp: string | null;
}

type TabId = "overview" | "users" | "projects" | "activities";

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Overview", icon: TrendingUp },
    { id: "users", label: "Users", icon: Users },
    { id: "projects", label: "Projects", icon: FolderKanban },
    { id: "activities", label: "Activities", icon: Activity },
];

// Admin emails for client-side check
const ADMIN_EMAILS = ["anuragmishra3407@gmail.com"];

export default function AdminPage() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabId>("overview");
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [projects, setProjects] = useState<AdminProject[]>([]);
    const [activities, setActivities] = useState<AdminActivity[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [projectFilter, setProjectFilter] = useState<"all" | "code-police" | "pitch-deck" | "equity">("all");

    // Check admin access
    const userEmail = user?.emailAddresses[0]?.emailAddress;
    const isAdmin = userEmail && ADMIN_EMAILS.includes(userEmail.toLowerCase());

    useEffect(() => {
        if (isLoaded && !isAdmin) {
            router.push("/dashboard/settings");
        }
    }, [isLoaded, isAdmin, router]);

    // Fetch data based on active tab
    useEffect(() => {
        if (!isAdmin) return;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                if (activeTab === "overview" || !stats) {
                    const statsRes = await fetch("/api/admin/stats");
                    if (statsRes.ok) {
                        const data = await statsRes.json();
                        setStats(data.stats);
                    }
                }

                if (activeTab === "users" && users.length === 0) {
                    const usersRes = await fetch("/api/admin/users");
                    if (usersRes.ok) {
                        const data = await usersRes.json();
                        setUsers(data.users);
                    }
                }

                if (activeTab === "projects" && projects.length === 0) {
                    const projectsRes = await fetch("/api/admin/projects");
                    if (projectsRes.ok) {
                        const data = await projectsRes.json();
                        setProjects(data.projects);
                    }
                }

                if (activeTab === "activities" && activities.length === 0) {
                    const activitiesRes = await fetch("/api/admin/activities");
                    if (activitiesRes.ok) {
                        const data = await activitiesRes.json();
                        setActivities(data.activities);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch admin data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [activeTab, isAdmin, stats, users.length, projects.length, activities.length]);

    const refreshData = async () => {
        setIsLoading(true);
        try {
            const [statsRes, usersRes, projectsRes, activitiesRes] = await Promise.all([
                fetch("/api/admin/stats"),
                fetch("/api/admin/users"),
                fetch("/api/admin/projects"),
                fetch("/api/admin/activities"),
            ]);

            if (statsRes.ok) setStats((await statsRes.json()).stats);
            if (usersRes.ok) setUsers((await usersRes.json()).users);
            if (projectsRes.ok) setProjects((await projectsRes.json()).projects);
            if (activitiesRes.ok) setActivities((await activitiesRes.json()).activities);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleUserPro = async (userId: string, isPro: boolean) => {
        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isPro }),
            });
            if (res.ok) {
                // Update local state
                setUsers((prev) =>
                    prev.map((u) => (u.id === userId ? { ...u, isPro } : u))
                );
            }
        } catch (error) {
            console.error("Failed to toggle user pro status:", error);
        }
    };

    if (!isLoaded) {
        return (
            <div className="p-6 flex items-center justify-center min-h-screen">
                <GhostfounderLoader size="lg" text="Loading..." />
            </div>
        );
    }

    if (!isAdmin) {
        return null;
    }

    // Filter users by search
    const filteredUsers = users.filter(
        (u) =>
            u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Filter projects
    const filteredProjects = projectFilter === "all"
        ? projects
        : projects.filter((p) => p.type === projectFilter);

    return (
        <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/dashboard/settings"
                        className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-zinc-400" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
                        <p className="text-sm text-zinc-500">Manage users, projects, and activities</p>
                    </div>
                </div>
                <button
                    onClick={refreshData}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-1 p-1 glass rounded-xl w-fit">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${activeTab === tab.id
                                ? "bg-zinc-800 text-white shadow-sm"
                                : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                            }
            `}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="min-h-[500px]">
                {isLoading && !stats ? (
                    <div className="flex items-center justify-center py-20">
                        <GhostfounderLoader size="lg" text="Loading admin data..." />
                    </div>
                ) : (
                    <>
                        {activeTab === "overview" && stats && <OverviewTab stats={stats} />}
                        {activeTab === "users" && (
                            <UsersTab
                                users={filteredUsers}
                                searchQuery={searchQuery}
                                onSearchChange={setSearchQuery}
                                isLoading={isLoading}
                                onTogglePro={toggleUserPro}
                            />
                        )}
                        {activeTab === "projects" && (
                            <ProjectsTab
                                projects={filteredProjects}
                                filter={projectFilter}
                                onFilterChange={setProjectFilter}
                                isLoading={isLoading}
                            />
                        )}
                        {activeTab === "activities" && (
                            <ActivitiesTab activities={activities} isLoading={isLoading} />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// OVERVIEW TAB
// ============================================================================
function OverviewTab({ stats }: { stats: AdminStats }) {
    const statCards = [
        { label: "Total Users", value: stats.totalUsers, icon: Users, color: "violet" },
        { label: "Code Police Projects", value: stats.totalProjects, icon: Shield, color: "cyan" },
        { label: "Total Analyses", value: stats.totalAnalyses, icon: Activity, color: "emerald" },
        { label: "Pitch Decks", value: stats.totalPitchDecks, icon: Presentation, color: "orange" },
        { label: "Equity Projects", value: stats.totalEquityProjects, icon: Coins, color: "violet" },
        { label: "Analyses (7d)", value: stats.recentAnalyses, icon: TrendingUp, color: "cyan" },
        { label: "Decks (7d)", value: stats.recentPitchDecks, icon: Calendar, color: "emerald" },
        { label: "Tokens Used", value: stats.totalTokensUsed.toLocaleString(), icon: Database, color: "orange" },
    ];

    const colorClasses = {
        violet: "bg-violet-500/10 text-violet-400 border-violet-500/20",
        cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
        emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    };

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map((stat, index) => (
                <div
                    key={index}
                    className={`glass rounded-xl p-5 border-l-2 ${colorClasses[stat.color as keyof typeof colorClasses].split(" ")[2]}`}
                >
                    <div className="flex items-center gap-2 mb-3">
                        <div className={`p-2 rounded-lg ${colorClasses[stat.color as keyof typeof colorClasses].split(" ").slice(0, 2).join(" ")}`}>
                            <stat.icon className="w-4 h-4" />
                        </div>
                        <span className="text-xs text-zinc-500">{stat.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{stat.value}</p>
                </div>
            ))}
        </div>
    );
}

// ============================================================================
// USERS TAB
// ============================================================================
function UsersTab({
    users,
    searchQuery,
    onSearchChange,
    isLoading,
    onTogglePro,
}: {
    users: AdminUser[];
    searchQuery: string;
    onSearchChange: (query: string) => void;
    isLoading: boolean;
    onTogglePro: (userId: string, isPro: boolean) => void;
}) {
    const [togglingUser, setTogglingUser] = useState<string | null>(null);

    const handleToggle = async (userId: string, currentIsPro: boolean) => {
        setTogglingUser(userId);
        await onTogglePro(userId, !currentIsPro);
        setTogglingUser(null);
    };

    return (
        <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-zinc-400" />
                    <h3 className="text-lg font-semibold text-white">All Users</h3>
                    <span className="text-sm text-zinc-500">({users.length})</span>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <GhostfounderLoader size="md" />
                </div>
            ) : users.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">No users found</div>
            ) : (
                <div className="space-y-2">
                    {users.map((user) => (
                        <div
                            key={user.id}
                            className="flex items-center gap-4 p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors"
                        >
                            {user.imageUrl ? (
                                <img src={user.imageUrl} alt="" className="w-10 h-10 rounded-full" />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-semibold">
                                    {user.fullName[0]?.toUpperCase()}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="font-medium text-white truncate">{user.fullName}</p>
                                    {user.isPro && (
                                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
                                            <Crown className="w-3 h-3" />
                                            Pro
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-zinc-500">
                                <div className="text-center">
                                    <p className="text-lg font-bold text-violet-400">{user.stats.projects}</p>
                                    <p>Projects</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-bold text-cyan-400">{user.stats.analyses}</p>
                                    <p>Analyses</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-bold text-emerald-400">{user.stats.pitchDecks}</p>
                                    <p>Decks</p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleToggle(user.id, user.isPro || false)}
                                disabled={togglingUser === user.id}
                                className={`
                                    px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                                    ${user.isPro
                                        ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                                        : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                                    }
                                    ${togglingUser === user.id ? "opacity-50 cursor-wait" : ""}
                                `}
                            >
                                {togglingUser === user.id ? "..." : user.isPro ? "Remove Pro" : "Make Pro"}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// PROJECTS TAB
// ============================================================================
function ProjectsTab({
    projects,
    filter,
    onFilterChange,
    isLoading,
}: {
    projects: AdminProject[];
    filter: "all" | "code-police" | "pitch-deck" | "equity";
    onFilterChange: (filter: "all" | "code-police" | "pitch-deck" | "equity") => void;
    isLoading: boolean;
}) {
    const typeConfig = {
        "code-police": { icon: Shield, color: "text-violet-400 bg-violet-500/10", label: "Code Police" },
        "pitch-deck": { icon: Presentation, color: "text-cyan-400 bg-cyan-500/10", label: "Pitch Deck" },
        equity: { icon: Coins, color: "text-emerald-400 bg-emerald-500/10", label: "Equity" },
    };

    return (
        <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <FolderKanban className="w-5 h-5 text-zinc-400" />
                    <h3 className="text-lg font-semibold text-white">All Projects</h3>
                    <span className="text-sm text-zinc-500">({projects.length})</span>
                </div>
                <div className="flex items-center gap-2 p-1 bg-zinc-800/50 rounded-lg">
                    <Filter className="w-4 h-4 text-zinc-500 ml-2" />
                    {(["all", "code-police", "pitch-deck", "equity"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => onFilterChange(f)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filter === f ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
                                }`}
                        >
                            {f === "all" ? "All" : typeConfig[f].label}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <GhostfounderLoader size="md" />
                </div>
            ) : projects.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">No projects found</div>
            ) : (
                <div className="space-y-2">
                    {projects.map((project) => {
                        const config = typeConfig[project.type];
                        const Icon = config.icon;
                        return (
                            <div
                                key={project.id}
                                className="flex items-center gap-4 p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors"
                            >
                                <div className={`p-2.5 rounded-lg ${config.color}`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-white truncate">{project.name}</p>
                                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                                        <span>{config.label}</span>
                                        {project.status && (
                                            <>
                                                <span>•</span>
                                                <span className="capitalize">{project.status}</span>
                                            </>
                                        )}
                                        {project.createdAt && (
                                            <>
                                                <span>•</span>
                                                <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-zinc-600 font-mono truncate max-w-[120px]">{project.userId.slice(0, 8)}...</p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// ACTIVITIES TAB
// ============================================================================
function ActivitiesTab({
    activities,
    isLoading,
}: {
    activities: AdminActivity[];
    isLoading: boolean;
}) {
    const typeConfig: Record<string, { icon: React.ElementType; color: string }> = {
        "code-review": { icon: Shield, color: "text-violet-400 bg-violet-500/10" },
        "pitch-deck": { icon: Presentation, color: "text-cyan-400 bg-cyan-500/10" },
        equity: { icon: Coins, color: "text-emerald-400 bg-emerald-500/10" },
        notification: { icon: Activity, color: "text-orange-400 bg-orange-500/10" },
    };

    const formatTime = (timestamp: string | null) => {
        if (!timestamp) return "N/A";
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

    return (
        <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6">
                <Activity className="w-5 h-5 text-zinc-400" />
                <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
                <span className="text-sm text-zinc-500">({activities.length})</span>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <GhostfounderLoader size="md" />
                </div>
            ) : activities.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">No activities found</div>
            ) : (
                <div className="space-y-2">
                    {activities.map((activity) => {
                        const config = typeConfig[activity.type] || typeConfig.notification;
                        const Icon = config.icon;
                        return (
                            <div
                                key={activity.id}
                                className="flex items-center gap-4 p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors"
                            >
                                <div className={`p-2.5 rounded-lg ${config.color}`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-white truncate">{activity.title}</p>
                                    <p className="text-xs text-zinc-500 truncate">{activity.description}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-zinc-400">{formatTime(activity.timestamp)}</p>
                                    <p className="text-xs text-zinc-600 font-mono">{activity.userId.slice(0, 8)}...</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
