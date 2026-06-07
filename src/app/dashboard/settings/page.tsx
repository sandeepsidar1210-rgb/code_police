"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { UserProfile, useUser } from "@clerk/nextjs";
import useSWR from "swr";
import Link from "next/link";
import {
  Settings,
  User,
  Bell,
  Shield,
  CreditCard,
  Github,
  Mail,
  Moon,
  Check,
  Loader2,
  ExternalLink,
  LayoutGrid,
  FolderKanban,
  Clock,
  Activity,
  Presentation,
  Coins,
  Database,
  Calendar,
  TrendingUp,
  Eye,
  ChevronRight,
  Filter,
  ShieldAlert,
  Crown,
} from "lucide-react";
import { GhostfounderLoader } from "@/components/ui/ghostfounder-loader";

/**
 * ============================================================================
 * SETTINGS PAGE - COMPREHENSIVE USER DASHBOARD
 * ============================================================================
 * Analytics-rich settings with Overview, Projects, History, and Account tabs.
 */

// Types
interface DashboardStats {
  codeReviews: { total: number; thisWeek: number };
  pitchDecks: { total: number; completed: number };
  equityProjects: { total: number; transfers: number };
  databaseQueries: { connections: number; queries: number };
  recentActivity: ActivityItem[];
}

interface ActivityItem {
  id: string;
  type: "code-review" | "pitch-deck" | "equity" | "database";
  title: string;
  description: string;
  timestamp: string;
}

interface Project {
  id: string;
  name: string;
  type: "code-police" | "equity" | "pitch-deck";
  status?: string;
  createdAt: string;
  lastActivity?: string;
}

type TabId = "overview" | "projects" | "history" | "settings";

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "history", label: "Activity", icon: Clock },
  { id: "settings", label: "Settings", icon: Settings },
];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Wrapper component for Suspense
export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsLoading() {
  return (
    <div className="p-6 lg:p-8 flex items-center justify-center min-h-[400px]">
      <GhostfounderLoader size="lg" text="Loading settings..." />
    </div>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const { user, isLoaded } = useUser();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showAccountModal, setShowAccountModal] = useState(false);
  const justConnected = searchParams.get("github_connected") === "true";

  // Fetch stats
  const { data: statsData, isLoading: statsLoading } = useSWR<{ stats: DashboardStats }>(
    "/api/dashboard/stats",
    fetcher,
    { refreshInterval: 60000 }
  );

  // GitHub connection status
  const githubAccount = user?.externalAccounts?.find(
    (account) => account.provider === "github"
  );
  const isGithubConnected = !!githubAccount;

  const stats = statsData?.stats;

  // Fetch user's pro status
  const { data: usageData } = useSWR<{ isPro: boolean }>(
    "/api/user/usage",
    fetcher
  );
  const isPro = usageData?.isPro ?? false;
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    })
    : "N/A";

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      {/* Success Message */}
      {justConnected && (
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-2 text-green-400">
          <Check className="w-5 h-5" />
          GitHub connected successfully!
        </div>
      )}

      {/* Profile Header */}
      <div className="glass rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          {/* Avatar */}
          {user?.imageUrl ? (
            <img
              src={user.imageUrl}
              alt="Profile"
              className="w-20 h-20 rounded-2xl ring-2 ring-zinc-700"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center ring-2 ring-zinc-700">
              <span className="text-2xl font-bold text-white">
                {user?.firstName?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || "U"}
              </span>
            </div>
          )}

          {/* User Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">
                {user?.fullName || user?.username || "User"}
              </h1>
              {isPro && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                  <Crown className="w-3.5 h-3.5" />
                  Pro
                </span>
              )}
            </div>
            <p className="text-zinc-400">{user?.primaryEmailAddress?.emailAddress}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Member since {memberSince}
              </span>
              <span className="flex items-center gap-1">
                {isGithubConnected ? (
                  <>
                    <Github className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-green-400">@{githubAccount?.username}</span>
                  </>
                ) : (
                  <>
                    <Github className="w-3.5 h-3.5" />
                    <span>Not connected</span>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <QuickStat
              label="Reviews"
              value={stats?.codeReviews.total ?? 0}
              icon={Shield}
              color="violet"
              isLoading={statsLoading}
            />
            <QuickStat
              label="Decks"
              value={stats?.pitchDecks.total ?? 0}
              icon={Presentation}
              color="cyan"
              isLoading={statsLoading}
            />
            <QuickStat
              label="Projects"
              value={stats?.equityProjects.total ?? 0}
              icon={Coins}
              color="emerald"
              isLoading={statsLoading}
            />
            <QuickStat
              label="Queries"
              value={stats?.databaseQueries.queries ?? 0}
              icon={Database}
              color="orange"
              isLoading={statsLoading}
            />
          </div>
        </div>
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

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "overview" && (
          <OverviewTab
            stats={stats}
            isLoading={statsLoading}
            isGithubConnected={isGithubConnected}
            onManageAccount={() => setShowAccountModal(true)}
          />
        )}
        {activeTab === "projects" && <ProjectsTab />}
        {activeTab === "history" && <HistoryTab activities={stats?.recentActivity} isLoading={statsLoading} />}
        {activeTab === "settings" && (
          <AccountSettingsTab
            isGithubConnected={isGithubConnected}
            githubUsername={githubAccount?.username}
            isLoaded={isLoaded}
            onManageAccount={() => setShowAccountModal(true)}
            userEmail={user?.primaryEmailAddress?.emailAddress}
          />
        )}
      </div>

      {/* Clerk UserProfile Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative max-w-2xl w-full max-h-[90vh] overflow-auto bg-zinc-900 rounded-2xl p-2">
            <button
              onClick={() => setShowAccountModal(false)}
              className="absolute top-4 right-4 z-10 p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-lg"
            >
              ✕
            </button>
            <UserProfile
              routing="hash"
              appearance={{
                elements: {
                  rootBox: "w-full",
                  card: "bg-zinc-900 border-none shadow-none",
                  navbar: "hidden",
                  pageScrollBox: "p-0",
                },
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// QUICK STAT COMPONENT
// ============================================================================
function QuickStat({
  label,
  value,
  icon: Icon,
  color,
  isLoading,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: "violet" | "cyan" | "emerald" | "orange";
  isLoading: boolean;
}) {
  const colorClasses = {
    violet: "bg-violet-500/10 text-violet-400",
    cyan: "bg-cyan-500/10 text-cyan-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    orange: "bg-orange-500/10 text-orange-400",
  };

  return (
    <div className="text-center p-3 rounded-xl bg-zinc-800/30">
      <div className={`inline-flex p-2 rounded-lg ${colorClasses[color]} mb-2`}>
        <Icon className="w-4 h-4" />
      </div>
      {isLoading ? (
        <div className="h-6 w-8 bg-zinc-700 rounded animate-pulse mx-auto" />
      ) : (
        <p className="text-xl font-bold text-white">{value}</p>
      )}
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

// ============================================================================
// OVERVIEW TAB
// ============================================================================
function OverviewTab({
  stats,
  isLoading,
  isGithubConnected,
  onManageAccount,
}: {
  stats?: DashboardStats;
  isLoading: boolean;
  isGithubConnected: boolean;
  onManageAccount: () => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Stats & Health */}
      <div className="lg:col-span-2 space-y-6">
        {/* Weekly Performance */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-violet-400" />
            <h3 className="text-lg font-semibold text-white">This Week&apos;s Activity</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Code Reviews"
              value={stats?.codeReviews.thisWeek ?? 0}
              icon={Shield}
              color="violet"
              isLoading={isLoading}
            />
            <StatCard
              label="Decks Created"
              value={stats?.pitchDecks.completed ?? 0}
              icon={Presentation}
              color="cyan"
              isLoading={isLoading}
            />
            <StatCard
              label="Transactions"
              value={stats?.equityProjects.transfers ?? 0}
              icon={Coins}
              color="emerald"
              isLoading={isLoading}
            />
            <StatCard
              label="DB Queries"
              value={stats?.databaseQueries.queries ?? 0}
              icon={Database}
              color="orange"
              isLoading={isLoading}
            />
          </div>
        </div>

        {/* Account Health */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-green-400" />
            <h3 className="text-lg font-semibold text-white">Account Health</h3>
          </div>
          <div className="space-y-3">
            <HealthItem
              label="GitHub Integration"
              status={isGithubConnected ? "connected" : "not-connected"}
              action={!isGithubConnected ? { label: "Connect", onClick: onManageAccount } : undefined}
            />
            <HealthItem label="Email Notifications" status="enabled" />
            <HealthItem label="Two-Factor Auth" status="available" />
          </div>
        </div>
      </div>

      {/* Right Column - Recent Activity */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-zinc-400" />
            <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
          </div>
          <Link href="/dashboard/notifications" className="text-xs text-zinc-500 hover:text-white transition-colors">
            View all
          </Link>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-8 h-8 rounded-lg bg-zinc-800" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 w-24 bg-zinc-800 rounded" />
                  <div className="h-2 w-32 bg-zinc-800/50 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
          <div className="space-y-3">
            {stats.recentActivity.slice(0, 5).map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Activity className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No recent activity</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PROJECTS TAB
// ============================================================================
function ProjectsTab() {
  const [filter, setFilter] = useState<"all" | "code-police" | "equity" | "pitch-deck">("all");
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      setIsLoading(true);
      try {
        const [codePoliceRes, equityRes, pitchDeckRes] = await Promise.all([
          fetch("/api/code-police/projects"),
          fetch("/api/equity/projects"),
          fetch("/api/pitch-deck/decks"),
        ]);

        // Parse responses with error handling
        const codePoliceData = codePoliceRes.ok ? await codePoliceRes.json() : { projects: [] };
        const equityData = equityRes.ok ? await equityRes.json() : { projects: [] };
        const pitchDeckData = pitchDeckRes.ok ? await pitchDeckRes.json() : { decks: [] };

        const allProjects: Project[] = [
          ...(codePoliceData.projects || []).map((p: { id: string; name?: string; githubFullName?: string; status?: string; createdAt: string }) => ({
            id: p.id,
            name: p.name || p.githubFullName,
            type: "code-police" as const,
            status: p.status,
            createdAt: p.createdAt,
          })),
          ...(equityData.projects || []).map((p: { id: string; name: string; createdAt: string }) => ({
            id: p.id,
            name: p.name,
            type: "equity" as const,
            createdAt: p.createdAt,
          })),
          ...(pitchDeckData.decks || []).map((d: { id: string; projectName: string; status?: string; createdAt: string }) => ({
            id: d.id,
            name: d.projectName,
            type: "pitch-deck" as const,
            status: d.status,
            createdAt: d.createdAt,
          })),
        ];

        // Sort by creation date (handle null/undefined dates)
        allProjects.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });

        setProjects(allProjects);
      } catch (error) {
        console.error("Failed to fetch projects:", error);
        setProjects([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, []);

  const filteredProjects = filter === "all"
    ? projects
    : projects.filter((p) => p.type === filter);

  const projectTypeConfig = {
    "code-police": { icon: Shield, color: "violet", label: "Code Police", href: "/dashboard/code-police" },
    equity: { icon: Coins, color: "emerald", label: "Equity", href: "/dashboard/equity" },
    "pitch-deck": { icon: Presentation, color: "cyan", label: "Pitch Deck", href: "/dashboard/pitch-deck" },
  };

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-5 h-5 text-zinc-400" />
          <h3 className="text-lg font-semibold text-white">All Projects</h3>
          <span className="text-sm text-zinc-500">({filteredProjects.length})</span>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 p-1 bg-zinc-800/50 rounded-lg">
          <Filter className="w-4 h-4 text-zinc-500 ml-2" />
          {(["all", "code-police", "equity", "pitch-deck"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`
                px-3 py-1.5 rounded-md text-xs font-medium transition-all
                ${filter === f ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}
              `}
            >
              {f === "all" ? "All" : projectTypeConfig[f].label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <GhostfounderLoader size="md" text="Loading projects..." />
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-12">
          <FolderKanban className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 mb-2">No projects found</p>
          <p className="text-sm text-zinc-500">Start by creating a project in any of our tools</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredProjects.map((project) => {
            const config = projectTypeConfig[project.type];
            const Icon = config.icon;
            const colorClasses = {
              violet: "bg-violet-500/10 text-violet-400",
              cyan: "bg-cyan-500/10 text-cyan-400",
              emerald: "bg-emerald-500/10 text-emerald-400",
            };

            return (
              <Link
                key={project.id}
                href={`${config.href}/${project.id}`}
                className="flex items-center gap-4 p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors group"
              >
                <div className={`p-2.5 rounded-lg ${colorClasses[config.color as keyof typeof colorClasses]}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate group-hover:text-violet-400 transition-colors">
                    {project.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>{config.label}</span>
                    {project.status && (
                      <>
                        <span>•</span>
                        <span className="capitalize">{project.status}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                  <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HISTORY TAB
// ============================================================================
function HistoryTab({
  activities,
  isLoading,
}: {
  activities?: ActivityItem[];
  isLoading: boolean;
}) {
  const [typeFilter, setTypeFilter] = useState<"all" | ActivityItem["type"]>("all");

  const filteredActivities = typeFilter === "all"
    ? activities
    : activities?.filter((a) => a.type === typeFilter);

  const activityConfig = {
    "code-review": { icon: Shield, color: "bg-violet-500/10 text-violet-400", label: "Code Review" },
    "pitch-deck": { icon: Presentation, color: "bg-cyan-500/10 text-cyan-400", label: "Pitch Deck" },
    equity: { icon: Coins, color: "bg-emerald-500/10 text-emerald-400", label: "Equity" },
    database: { icon: Database, color: "bg-orange-500/10 text-orange-400", label: "Database" },
  };

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-zinc-400" />
          <h3 className="text-lg font-semibold text-white">Activity History</h3>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 p-1 bg-zinc-800/50 rounded-lg">
          <Filter className="w-4 h-4 text-zinc-500 ml-2" />
          {(["all", "code-review", "pitch-deck", "equity", "database"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`
                px-3 py-1.5 rounded-md text-xs font-medium transition-all
                ${typeFilter === f ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}
              `}
            >
              {f === "all" ? "All" : activityConfig[f].label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <GhostfounderLoader size="md" text="Loading activity..." />
        </div>
      ) : !filteredActivities || filteredActivities.length === 0 ? (
        <div className="text-center py-12">
          <Activity className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 mb-2">No activity found</p>
          <p className="text-sm text-zinc-500">Your actions will appear here as you use the platform</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredActivities.map((activity) => {
            const config = activityConfig[activity.type];
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
                  <p className="text-sm text-zinc-500 truncate">{activity.description}</p>
                </div>
                <span className="text-xs text-zinc-500 whitespace-nowrap">
                  {formatTimestamp(activity.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ACCOUNT SETTINGS TAB
// ============================================================================

// Admin emails for client-side check
const ADMIN_EMAILS = ["anuragmishra3407@gmail.com"];

function AccountSettingsTab({
  isGithubConnected,
  githubUsername,
  isLoaded,
  onManageAccount,
  userEmail,
}: {
  isGithubConnected: boolean;
  githubUsername?: string;
  isLoaded: boolean;
  onManageAccount: () => void;
  userEmail?: string;
}) {
  const isAdmin = userEmail && ADMIN_EMAILS.includes(userEmail.toLowerCase());

  return (
    <div className="space-y-6">
      {/* Admin Panel Button - Only visible to admins */}
      {isAdmin && (
        <section className="glass rounded-2xl p-6 border border-violet-500/30 bg-gradient-to-r from-violet-500/5 to-indigo-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/20">
                <ShieldAlert className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Admin Panel</h2>
                <p className="text-sm text-zinc-500">Manage users, projects, and system activities</p>
              </div>
            </div>
            <Link
              href="/dashboard/admin"
              className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <ShieldAlert className="w-4 h-4" />
              Open Admin Panel
            </Link>
          </div>
        </section>
      )}

      {/* Profile Section */}
      <section className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-5 h-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-white">Profile & Connected Accounts</h2>
        </div>
        <button
          onClick={onManageAccount}
          className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors flex items-center gap-2"
        >
          <ExternalLink className="w-4 h-4" />
          Manage Account
        </button>
      </section>

      {/* GitHub Integration */}
      <section className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Github className="w-5 h-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-white">GitHub Integration</h2>
        </div>

        <div className="flex items-center justify-between py-3 border-b border-zinc-800">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-lg bg-zinc-800">
              <Github className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-medium text-white">GitHub</p>
              <p className="text-sm text-zinc-500">
                {isGithubConnected
                  ? `Connected as @${githubUsername || "connected"}`
                  : "Connect for Code Police and Pitch Deck"}
              </p>
            </div>
          </div>
          {!isLoaded ? (
            <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
          ) : isGithubConnected ? (
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 text-sm font-medium text-green-400 bg-green-500/10 rounded-full">
                Connected
              </span>
              <button
                onClick={onManageAccount}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Manage
              </button>
            </div>
          ) : (
            <button
              onClick={onManageAccount}
              className="px-4 py-2 text-sm font-medium text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <Github className="w-4 h-4" />
              Connect GitHub
            </button>
          )}
        </div>

        {!isGithubConnected && (
          <div className="mt-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-sm text-yellow-400">
              <strong>Note:</strong> GitHub connection is required for Code Police (code review)
              and Pitch Deck Generator (repository analysis).
            </p>
          </div>
        )}
      </section>

      {/* Notifications */}
      <section className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Bell className="w-5 h-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-white">Notifications</h2>
        </div>

        <div className="flex items-center justify-between py-3 border-b border-zinc-800">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-lg bg-zinc-800">
              <Mail className="w-5 h-5 text-zinc-400" />
            </div>
            <div>
              <p className="font-medium text-white">Email Notifications</p>
              <p className="text-sm text-zinc-500">Receive code review reports via email</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" defaultChecked />
            <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
          </label>
        </div>
      </section>

      {/* Appearance */}
      <section className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Moon className="w-5 h-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-white">Appearance</h2>
        </div>

        <div className="flex items-center justify-between py-3">
          <div>
            <p className="font-medium text-white">Theme</p>
            <p className="text-sm text-zinc-500">Select your preferred theme</p>
          </div>
          <select className="px-4 py-2 text-sm font-medium text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg border-none focus:ring-2 focus:ring-violet-500">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">System</option>
          </select>
        </div>
      </section>

      {/* Plan & Billing */}
      <section className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <CreditCard className="w-5 h-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-white">Plan & Billing</h2>
        </div>

        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 rounded-xl">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-xs font-bold text-violet-400 bg-violet-500/20 rounded">FREE</span>
              <p className="font-medium text-white">Free Plan</p>
            </div>
            <p className="text-sm text-zinc-400 mt-1">
              Perfect for getting started with Protocol Zero
            </p>
          </div>
          <button className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors">
            Upgrade
          </button>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="glass border-red-500/20 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-5 h-5 text-red-400" />
          <h2 className="text-lg font-semibold text-white">Danger Zone</h2>
        </div>

        <div className="flex items-center justify-between py-3">
          <div>
            <p className="font-medium text-white">Delete Account</p>
            <p className="text-sm text-zinc-500">Permanently delete your account and all data</p>
          </div>
          <button className="px-4 py-2 text-sm font-medium text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500 border border-red-500/20 hover:border-transparent rounded-lg transition-colors">
            Delete Account
          </button>
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  isLoading,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: "violet" | "cyan" | "emerald" | "orange";
  isLoading: boolean;
}) {
  const colorClasses = {
    violet: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };

  return (
    <div className={`p-4 rounded-xl bg-zinc-800/30 border-l-2 ${colorClasses[color].split(" ")[2]}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${colorClasses[color].split(" ").slice(0, 2).join(" ")}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      {isLoading ? (
        <div className="h-7 w-10 bg-zinc-700 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-white">{value}</p>
      )}
    </div>
  );
}

function HealthItem({
  label,
  status,
  action,
}: {
  label: string;
  status: "connected" | "not-connected" | "enabled" | "disabled" | "available";
  action?: { label: string; onClick: () => void };
}) {
  const statusConfig = {
    connected: { color: "text-green-400 bg-green-500/10", text: "Connected" },
    "not-connected": { color: "text-yellow-400 bg-yellow-500/10", text: "Not Connected" },
    enabled: { color: "text-green-400 bg-green-500/10", text: "Enabled" },
    disabled: { color: "text-zinc-400 bg-zinc-500/10", text: "Disabled" },
    available: { color: "text-zinc-400 bg-zinc-500/10", text: "Available" },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-1 rounded-full ${config.color}`}>
          {config.text}
        </span>
        {action && (
          <button
            onClick={action.onClick}
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ activity }: { activity: ActivityItem }) {
  const config = {
    "code-review": { icon: Shield, color: "bg-violet-500/10 text-violet-400" },
    "pitch-deck": { icon: Presentation, color: "bg-cyan-500/10 text-cyan-400" },
    equity: { icon: Coins, color: "bg-emerald-500/10 text-emerald-400" },
    database: { icon: Database, color: "bg-orange-500/10 text-orange-400" },
  };

  const c = config[activity.type];
  const Icon = c.icon;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className={`p-1.5 rounded-lg ${c.color}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{activity.title}</p>
        <p className="text-xs text-zinc-500 truncate">{activity.description}</p>
      </div>
      <span className="text-xs text-zinc-600 whitespace-nowrap">
        {formatTimestamp(activity.timestamp)}
      </span>
    </div>
  );
}

function formatTimestamp(timestamp: string) {
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
}
