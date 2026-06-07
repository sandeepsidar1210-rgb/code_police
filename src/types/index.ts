/**
 * ============================================================================
 * PROTOCOL ZERO - CORE TYPE DEFINITIONS
 * ============================================================================
 * Central type definitions for the application.
 * Focused on Code Police feature.
 */

import { Timestamp } from "firebase/firestore";

// ============================================================================
// USER & AUTHENTICATION TYPES
// ============================================================================

export interface User {
  id: string;
  clerkId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  plan: UserPlan;
  githubConnected: boolean;
  githubUsername?: string;
  githubAccessToken?: string;
  walletAddress?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  settings: UserSettings;
}

export type UserPlan = "free" | "pro" | "enterprise";

export interface UserSettings {
  theme: "light" | "dark" | "system";
  emailNotifications: boolean;
  defaultAgent?: AgentType;
}

// ============================================================================
// AGENT TYPES
// ============================================================================

export type AgentType = "code-police" | "self-healing";

export interface AgentConfig {
  id: AgentType;
  name: string;
  description: string;
  icon: string;
  color: string;
  href: string;
  isEnabled: boolean;
}

export const AGENTS: AgentConfig[] = [
  {
    id: "code-police",
    name: "Code Police",
    description:
      "AI-powered code review that analyzes your commits and sends detailed reports",
    icon: "Shield",
    color: "red",
    href: "/dashboard/code-police",
    isEnabled: true,
  },
  {
    id: "self-healing",
    name: "Self-Healing",
    description:
      "AI agent that automatically finds and fixes bugs until all tests pass",
    icon: "Heartbeat",
    color: "emerald",
    href: "/dashboard/self-healing",
    isEnabled: true,
  },
];

// ============================================================================
// CODE POLICE TYPES
// ============================================================================

/**
 * Project status for Vercel-style controls:
 * - active: Analyzing every push
 * - paused: Webhooks received but ignored
 * - stopped: Webhook removed, no analysis
 */
export type ProjectStatus = 'active' | 'paused' | 'stopped';

export interface Project {
  id: string;
  userId: string;
  name: string;
  githubRepoId?: number;
  githubOwner?: string;
  githubRepoName?: string;
  githubFullName?: string;
  defaultBranch: string;
  language?: string;
  webhookId?: number;
  webhookSecret: string;
  /** @deprecated Use status instead */
  isActive?: boolean;
  /** Vercel-style project status */
  status: ProjectStatus;
  /** User-defined custom rules for AI analysis (e.g., "No console.logs") */
  customRules: string[];
  /** Project owner email for notifications */
  ownerEmail: string;
  rulesProfile: RulesProfile;
  notificationPrefs: NotificationPrefs;
  /** Bring Your Own Key config (encrypted Gemini key). OSS-friendly. */
  byok?: ByokConfig;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Bring Your Own Key configuration. The raw key is never stored; only the
 * AES-encrypted ciphertext and a display hint are persisted.
 */
export interface ByokConfig {
  encryptedKey?: string;
  provider?: "gemini";
  keyHint?: string;
}

/** Dependency-graph + conflict impact summary attached to an AnalysisRun. */
export interface PrImpactSummary {
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  changedFiles: string[];
  affectedFiles: Array<{ path: string; depth: number }>;
  directDependents: string[];
  edges: Array<{ from: string; to: string }>;
  mergeable: boolean | null;
  conflictRisk: "none" | "low" | "high";
  likelyConflicts: string[];
}

export interface RulesProfile {
  strictness: "relaxed" | "moderate" | "strict";
  categories: {
    security: boolean;
    performance: boolean;
    readability: boolean;
    bugs: boolean;
    tests: boolean;
    style: boolean;
  };
  ignorePatterns: string[];
  severityThreshold: IssueSeverity;
}

export interface NotificationPrefs {
  emailOnPush: boolean;
  emailOnPR: boolean;
  minSeverity: IssueSeverity;
  additionalEmails: string[];
}

export type IssueSeverity = "critical" | "high" | "medium" | "low" | "info";
export type IssueCategory =
  | "security"
  | "performance"
  | "readability"
  | "bug"
  | "test"
  | "style";

export interface AnalysisRun {
  id: string;
  userId: string;
  projectId: string;
  commitSha: string;
  branch: string;
  triggerType: "push" | "pull_request";
  prNumber?: number;
  author: {
    name: string;
    email: string;
    avatar?: string;
  };
  status: "pending" | "running" | "completed" | "failed";
  summary?: string;
  issueCounts: Record<IssueSeverity, number>;
  /** Dependency-graph + merge-conflict impact (PR runs). */
  impact?: PrImpactSummary;
  createdAt: Timestamp;
  completedAt?: Timestamp;
  emailStatus?: "pending" | "sent" | "failed";
  error?: string;
}

export interface CodeIssue {
  id: string;
  analysisRunId: string;
  projectId: string;
  filePath: string;
  line: number;
  endLine?: number;
  severity: IssueSeverity;
  category: IssueCategory;
  message: string;
  explanation: string;
  suggestedFix?: string;
  ruleId?: string;
  codeSnippet?: string;
  isMuted: boolean;
}

// ============================================================================
// GITHUB TYPES
// ============================================================================

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description?: string;
  html_url: string;
  language?: string;
  default_branch: string;
  private: boolean;
  owner: {
    login: string;
    avatar_url: string;
  };
  updated_at: string;
  stargazers_count: number;
  forks_count: number;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ============================================================================
// SELF-HEALING AGENT TYPES
// ============================================================================

export type HealingStatus =
  | "queued"
  | "cloning"
  | "scanning"
  | "testing"
  | "fixing"
  | "pushing"
  | "completed"
  | "partial_success"
  | "failed";

export type BugCategory =
  | "SYNTAX"
  | "LINTING"
  | "RUNTIME"
  | "LOGIC"
  | "IMPORT"
  | "TYPE"
  | "DEPENDENCY";

export interface HealingSession {
  id: string;
  userId: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  branchName: string;
  /** The branch to heal against (default: "main") */
  targetBranch: string;
  /** Optional custom rules/instructions for the AI agent */
  customRules?: string;
  status: HealingStatus;
  currentAttempt: number;
  maxAttempts: number;
  bugs: HealingBug[];
  attempts: HealingAttempt[];
  score: HealingScore | null;
  startedAt: Timestamp;
  completedAt?: Timestamp;
  error?: string;
}

export interface HealingBug {
  id: string;
  category: BugCategory;
  filePath: string;
  line: number;
  message: string;
  severity: IssueSeverity;
  fixed: boolean;
  fixedAtAttempt?: number;
}

export interface HealingAttempt {
  attempt: number;
  status: "running" | "passed" | "failed";
  testOutput: string;
  bugsFound: number;
  bugsFixed: number;
  commitSha?: string;
  commitMessage?: string;
  durationMs: number;
  timestamp: string;
}

export interface HealingScore {
  totalBugs: number;
  bugsFixed: number;
  testsPassed: boolean;
  attempts: number;
  totalCommits: number;
  timeSeconds: number;
  speedBonus: number;
  commitPenalty: number;
  finalScore: number;
}

export type HealingEventType =
  | "status"
  | "bug_found"
  | "test_result"
  | "fix_applied"
  | "attempt_complete"
  | "score"
  | "error"
  | "log";

export interface HealingEvent {
  type: HealingEventType;
  data: Record<string, unknown>;
  timestamp: string;
}
