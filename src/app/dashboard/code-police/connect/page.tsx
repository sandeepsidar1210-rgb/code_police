"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Shield,
  ArrowLeft,
  Github,
  Loader2,
  AlertCircle,
  Search,
  Star,
  Lock,
  Unlock,
  ExternalLink,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { GhostfounderLoader } from "@/components/ui/ghostfounder-loader";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  default_branch: string;
  private: boolean;
  stargazers_count: number;
  updated_at: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

interface ConnectedProject {
  id: string;
  githubFullName: string;
}

export default function ConnectRepositoryPage() {
  const router = useRouter();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<GitHubRepo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRepo] = useState<GitHubRepo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");
  const [githubConnected, setGithubConnected] = useState(false);
  const [connectingRepoId, setConnectingRepoId] = useState<number | null>(null);
  const [connectedProjects, setConnectedProjects] = useState<ConnectedProject[]>([]);

  // Fetch repositories and connected projects on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch repos and connected projects in parallel
        const [reposResponse, projectsResponse] = await Promise.all([
          fetch("/api/github/repos"),
          fetch("/api/code-police/projects")
        ]);

        const reposData = await reposResponse.json();
        const projectsData = await projectsResponse.json();

        console.log("[ConnectRepo] API Response:", {
          status: reposResponse.status,
          connected: reposData.connected,
          repoCount: reposData.repos?.length || 0,
          connectedCount: projectsData.projects?.length || 0,
          hasError: !!reposData.error,
          message: reposData.message
        });

        if (!reposResponse.ok) {
          throw new Error(reposData.error || reposData.message || "Failed to fetch repositories");
        }

        setRepos(reposData.repos || []);
        setFilteredRepos(reposData.repos || []);
        setGithubConnected(reposData.connected);
        setConnectedProjects(projectsData.projects || []);

        if (!reposData.connected) {
          setError(reposData.message || "GitHub not connected. Please connect your GitHub account in Settings.");
        } else if (reposData.repos && reposData.repos.length === 0) {
          setError("No repositories found. Make sure your GitHub account has repositories.");
        }
      } catch (err) {
        console.error("[ConnectRepo] Error:", err);
        setError(err instanceof Error ? err.message : "Failed to load repositories");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter repos based on search
  useEffect(() => {
    const filtered = repos.filter(
      (repo) =>
        repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (repo.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    );
    setFilteredRepos(filtered);
  }, [searchQuery, repos]);

  const handleConnect = async (repo: GitHubRepo) => {
    setIsConnecting(true);
    setConnectingRepoId(repo.id);
    setError("");

    try {
      const response = await fetch("/api/github/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoId: repo.id,
          owner: repo.owner.login,
          name: repo.name,
          fullName: repo.full_name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to connect repository");
      }

      // Success - redirect to Code Police dashboard
      router.push("/dashboard/code-police?connected=true");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
      setConnectingRepoId(null);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/code-police"
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Code Police
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10">
            <Shield className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Connect Repository</h1>
            <p className="text-zinc-400">Select a GitHub repository to enable AI code review</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search repositories..."
          className="w-full pl-12 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400">{error}</p>
              {!githubConnected && (
                <p className="text-sm text-zinc-400 mt-2">
                  To connect GitHub, go to your{" "}
                  <a href="/dashboard/settings" className="text-red-400 hover:underline">
                    account settings
                  </a>{" "}
                  and link your GitHub account via Clerk.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <GhostfounderLoader size="lg" text="Loading repositories..." />
        </div>
      ) : repos.length === 0 ? (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 text-center">
          <Github className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">No Repositories Found</h2>
          <p className="text-zinc-400 mb-6">
            {githubConnected
              ? "You don't have any repositories, or we couldn't access them."
              : "Connect your GitHub account to see your repositories."}
          </p>
          <a
            href="/dashboard/settings"
            className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl transition-colors"
          >
            <Github className="w-5 h-5" />
            {githubConnected ? "Manage GitHub Connection" : "Connect GitHub"}
          </a>
        </div>
      ) : (
        <>
          {/* Results count */}
          <p className="text-sm text-zinc-500 mb-4">
            {filteredRepos.length} {filteredRepos.length === 1 ? "repository" : "repositories"} found
          </p>

          {/* Repositories List */}
          <div className="space-y-3 mb-6">
            {filteredRepos.map((repo) => (
              <div
                key={repo.id}
                className={`p-4 rounded-xl border transition-all ${selectedRepo?.id === repo.id
                  ? "bg-red-500/10 border-red-500/30"
                  : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-zinc-800">
                      {repo.private ? (
                        <Lock className="w-4 h-4 text-yellow-400" />
                      ) : (
                        <Unlock className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">{repo.name}</span>
                        {repo.stargazers_count > 0 && (
                          <span className="flex items-center gap-1 text-xs text-yellow-400">
                            <Star className="w-3 h-3" />
                            {repo.stargazers_count}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-500 truncate">{repo.owner.login}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {repo.language && (
                      <span className="text-xs text-zinc-400 px-2 py-1 bg-zinc-800 rounded-full">
                        {repo.language}
                      </span>
                    )}
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-zinc-500 hover:text-white transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    {(() => {
                      const connected = connectedProjects.find(
                        (p) => p.githubFullName === repo.full_name
                      );
                      if (connected) {
                        return (
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-400 text-sm font-medium rounded-lg">
                              <CheckCircle2 className="w-4 h-4" />
                              Connected
                            </span>
                            <Link
                              href={`/dashboard/code-police/${connected.id}`}
                              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                            >
                              <Eye className="w-4 h-4" />
                              View
                            </Link>
                          </div>
                        );
                      }
                      return (
                        <button
                          onClick={() => handleConnect(repo)}
                          disabled={isConnecting}
                          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          {connectingRepoId === repo.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <Shield className="w-4 h-4" />
                              Connect
                            </>
                          )}
                        </button>
                      );
                    })()}
                  </div>
                </div>
                {repo.description && (
                  <p className="text-sm text-zinc-400 mt-2 line-clamp-1">{repo.description}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
