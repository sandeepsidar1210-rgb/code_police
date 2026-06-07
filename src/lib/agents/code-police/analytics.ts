/**
 * ============================================================================
 * CODE POLICE - ANALYTICS COMPUTATION LIBRARY
 * ============================================================================
 * Deterministic analytics computation - NO AI tokens used.
 * All metrics are calculated from GitHub API data.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface RepoOverview {
    stars: number;
    forks: number;
    openIssues: number;
    openPRs: number;
    lastCommitDate: string;
    primaryLanguage: string | null;
    description: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface LanguageBreakdown {
    name: string;
    percentage: number;
    bytes: number;
}

export interface CommitActivity {
    week: string;
    count: number;
    date: Date;
}

export interface ContributorStats {
    login: string;
    avatar: string;
    commits: number;
    additions: number;
    deletions: number;
    percentage: number;
}

export interface PRMetrics {
    openCount: number;
    mergedLast30Days: number;
    avgMergeTimeHours: number;
    avgReviewTimeHours: number;
    prSizes: { small: number; medium: number; large: number };
}

export interface IssueMetrics {
    openCount: number;
    closedLast30Days: number;
    avgCloseTimeDays: number;
}

export interface DocPresence {
    hasReadme: boolean;
    hasContributing: boolean;
    hasSecurity: boolean;
    hasLicense: boolean;
    hasCodeOfConduct: boolean;
    hasDocs: boolean;
    licenseType: string | null;
}

export interface TestInfo {
    hasTests: boolean;
    testFileCount: number;
    testFrameworks: string[];
    testDirectories: string[];
}

export interface HealthScoreBreakdown {
    total: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    components: {
        activity: number;
        prReview: number;
        issueResponse: number;
        documentation: number;
        busFactor: number;
        testing: number;
    };
}

// Founder-focused metrics - computed deterministically (no AI tokens)
export interface FounderMetrics {
    // Delivery velocity (PRs merged per week)
    deliveryVelocity: number;
    deliveryVelocityTrend: 'improving' | 'stable' | 'declining';

    // Tech debt indicators
    techDebtScore: number; // 0-100 (higher = less debt, healthier)
    techDebtFactors: {
        largePRRatio: number; // % of PRs that are large (>500 lines)
        staleIssuesCount: number; // issues open > 30 days
        missingTests: boolean;
        missingDocs: boolean;
    };

    // Team productivity
    commitsPerContributor: number;
    avgCommitsPerWeek: number;

    // Scale readiness
    scaleReadinessScore: number; // 0-100
    scaleReadinessFactors: {
        hasTests: boolean;
        hasDocs: boolean;
        hasLicense: boolean;
        healthyBusFactor: boolean; // busFactor >= 2
        activelyMaintained: boolean; // commits in last 30 days
    };

    // Investor checklist (deterministic assessment)
    investorChecklist: {
        item: string;
        passed: boolean;
        importance: 'critical' | 'important' | 'nice-to-have';
    }[];
}

export interface FullAnalytics {
    overview: RepoOverview;
    healthScore: HealthScoreBreakdown;
    languages: LanguageBreakdown[];
    activity: {
        commitsLast90Days: number;
        commitsByWeek: CommitActivity[];
        trend: 'increasing' | 'stable' | 'decreasing';
    };
    contributors: {
        total: number;
        topContributors: ContributorStats[];
        busFactor: number;
    };
    pullRequests: PRMetrics;
    issues: IssueMetrics;
    documentation: DocPresence & { score: number };
    testing: TestInfo;
    // NEW: Founder-focused metrics (no AI tokens)
    founderMetrics: FounderMetrics;
}

// ============================================================================
// GITHUB DATA FETCHING FUNCTIONS
// ============================================================================

const GITHUB_API = 'https://api.github.com';

async function githubFetch<T>(
    token: string,
    endpoint: string,
    options?: RequestInit
): Promise<T> {
    const response = await fetch(`${GITHUB_API}${endpoint}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            ...options?.headers,
        },
    });

    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

/**
 * Fetch basic repository information
 */
export async function fetchRepoOverview(
    token: string,
    owner: string,
    repo: string
): Promise<RepoOverview> {
    const data = await githubFetch<{
        stargazers_count: number;
        forks_count: number;
        open_issues_count: number;
        language: string | null;
        description: string | null;
        created_at: string;
        updated_at: string;
        pushed_at: string;
    }>(token, `/repos/${owner}/${repo}`);

    // Fetch open PRs count separately (open_issues_count includes PRs)
    const prs = await githubFetch<{ total_count: number }>(
        token,
        `/search/issues?q=repo:${owner}/${repo}+type:pr+state:open&per_page=1`
    );

    return {
        stars: data.stargazers_count,
        forks: data.forks_count,
        openIssues: data.open_issues_count - prs.total_count,
        openPRs: prs.total_count,
        lastCommitDate: data.pushed_at,
        primaryLanguage: data.language,
        description: data.description,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    };
}

/**
 * Fetch language breakdown
 */
export async function fetchLanguages(
    token: string,
    owner: string,
    repo: string
): Promise<LanguageBreakdown[]> {
    const data = await githubFetch<Record<string, number>>(
        token,
        `/repos/${owner}/${repo}/languages`
    );

    const total = Object.values(data).reduce((a, b) => a + b, 0);
    if (total === 0) return [];

    return Object.entries(data)
        .map(([name, bytes]) => ({
            name,
            bytes,
            percentage: Math.round((bytes / total) * 100),
        }))
        .sort((a, b) => b.bytes - a.bytes);
}

/**
 * Fetch commit activity for the last 90 days
 */
export async function fetchCommitActivity(
    token: string,
    owner: string,
    repo: string
): Promise<{ commits: CommitActivity[]; total: number; trend: 'increasing' | 'stable' | 'decreasing' }> {
    // GitHub's commit activity endpoint returns weekly data for the last year
    const data = await githubFetch<Array<{ week: number; total: number; days: number[] }>>(
        token,
        `/repos/${owner}/${repo}/stats/commit_activity`
    );

    // Take the last 13 weeks (~90 days)
    const recent = (data || []).slice(-13);
    const commits = recent.map((week) => ({
        week: new Date(week.week * 1000).toISOString().split('T')[0],
        count: week.total,
        date: new Date(week.week * 1000),
    }));

    const total = commits.reduce((sum, w) => sum + w.count, 0);

    // Calculate trend by comparing first half to second half
    const midpoint = Math.floor(commits.length / 2);
    const firstHalf = commits.slice(0, midpoint).reduce((s, w) => s + w.count, 0);
    const secondHalf = commits.slice(midpoint).reduce((s, w) => s + w.count, 0);

    let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (secondHalf > firstHalf * 1.2) trend = 'increasing';
    else if (secondHalf < firstHalf * 0.8) trend = 'decreasing';

    return { commits, total, trend };
}

/**
 * Fetch contributor statistics
 */
export async function fetchContributors(
    token: string,
    owner: string,
    repo: string
): Promise<ContributorStats[]> {
    const data = await githubFetch<Array<{
        author: { login: string; avatar_url: string } | null;
        total: number;
        weeks: Array<{ a: number; d: number }>;
    }>>(token, `/repos/${owner}/${repo}/stats/contributors`);

    if (!data || data.length === 0) return [];

    const totalCommits = data.reduce((sum, c) => sum + c.total, 0);

    return data
        .filter((c) => c.author !== null)
        .map((c) => ({
            login: c.author!.login,
            avatar: c.author!.avatar_url,
            commits: c.total,
            additions: c.weeks.reduce((s, w) => s + w.a, 0),
            deletions: c.weeks.reduce((s, w) => s + w.d, 0),
            percentage: totalCommits > 0 ? Math.round((c.total / totalCommits) * 100) : 0,
        }))
        .sort((a, b) => b.commits - a.commits);
}

/**
 * Fetch PR metrics
 */
export async function fetchPRMetrics(
    token: string,
    owner: string,
    repo: string
): Promise<PRMetrics> {
    // Fetch recently merged PRs
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const since = thirtyDaysAgo.toISOString().split('T')[0];

    const mergedPRs = await githubFetch<{
        items: Array<{
            created_at: string;
            closed_at: string;
            additions: number;
            deletions: number;
        }>
    }>(
        token,
        `/search/issues?q=repo:${owner}/${repo}+type:pr+is:merged+closed:>=${since}&per_page=100`
    );

    const openPRs = await githubFetch<{ total_count: number }>(
        token,
        `/search/issues?q=repo:${owner}/${repo}+type:pr+state:open&per_page=1`
    );

    // Calculate average merge time
    let totalMergeTime = 0;
    let prCount = 0;
    const sizes = { small: 0, medium: 0, large: 0 };

    for (const pr of mergedPRs.items) {
        const created = new Date(pr.created_at).getTime();
        const closed = new Date(pr.closed_at).getTime();
        totalMergeTime += (closed - created) / (1000 * 60 * 60); // hours
        prCount++;

        const changes = (pr.additions || 0) + (pr.deletions || 0);
        if (changes < 100) sizes.small++;
        else if (changes < 500) sizes.medium++;
        else sizes.large++;
    }

    return {
        openCount: openPRs.total_count,
        mergedLast30Days: prCount,
        avgMergeTimeHours: prCount > 0 ? Math.round((totalMergeTime / prCount) * 10) / 10 : 0,
        avgReviewTimeHours: prCount > 0 ? Math.round((totalMergeTime / prCount / 3) * 10) / 10 : 0, // Estimate
        prSizes: sizes,
    };
}

/**
 * Fetch issue metrics
 */
export async function fetchIssueMetrics(
    token: string,
    owner: string,
    repo: string
): Promise<IssueMetrics> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const since = thirtyDaysAgo.toISOString().split('T')[0];

    const openIssues = await githubFetch<{ total_count: number }>(
        token,
        `/search/issues?q=repo:${owner}/${repo}+type:issue+state:open&per_page=1`
    );

    const closedIssues = await githubFetch<{
        items: Array<{
            created_at: string;
            closed_at: string;
        }>
    }>(
        token,
        `/search/issues?q=repo:${owner}/${repo}+type:issue+is:closed+closed:>=${since}&per_page=100`
    );

    // Calculate average close time
    let totalCloseTime = 0;
    let issueCount = 0;

    for (const issue of closedIssues.items) {
        const created = new Date(issue.created_at).getTime();
        const closed = new Date(issue.closed_at).getTime();
        totalCloseTime += (closed - created) / (1000 * 60 * 60 * 24); // days
        issueCount++;
    }

    return {
        openCount: openIssues.total_count,
        closedLast30Days: issueCount,
        avgCloseTimeDays: issueCount > 0 ? Math.round((totalCloseTime / issueCount) * 10) / 10 : 0,
    };
}

/**
 * Check for presence of documentation files
 */
export async function fetchDocPresence(
    token: string,
    owner: string,
    repo: string
): Promise<DocPresence> {
    const files: Record<string, boolean> = {
        readme: false,
        contributing: false,
        security: false,
        license: false,
        codeOfConduct: false,
        docs: false,
    };
    let licenseType: string | null = null;

    // Fetch root directory contents
    try {
        const contents = await githubFetch<Array<{ name: string; type: string }>>(
            token,
            `/repos/${owner}/${repo}/contents`
        );

        for (const item of contents) {
            const name = item.name.toLowerCase();
            if (name.startsWith('readme')) files.readme = true;
            if (name.startsWith('contributing')) files.contributing = true;
            if (name.startsWith('security')) files.security = true;
            if (name === 'license' || name.startsWith('license.')) files.license = true;
            if (name.startsWith('code_of_conduct') || name.startsWith('code-of-conduct')) files.codeOfConduct = true;
            if (item.type === 'dir' && (name === 'docs' || name === 'documentation')) files.docs = true;
        }
    } catch {
        // Repo might be empty or inaccessible
    }

    // Fetch license info
    try {
        const licenseData = await githubFetch<{ license: { spdx_id: string } | null }>(
            token,
            `/repos/${owner}/${repo}`
        );
        if (licenseData.license) {
            licenseType = licenseData.license.spdx_id;
        }
    } catch {
        // License not detected
    }

    return {
        hasReadme: files.readme,
        hasContributing: files.contributing,
        hasSecurity: files.security,
        hasLicense: files.license,
        hasCodeOfConduct: files.codeOfConduct,
        hasDocs: files.docs,
        licenseType,
    };
}

/**
 * Detect test frameworks and count test files
 */
export async function detectTestInfo(
    token: string,
    owner: string,
    repo: string
): Promise<TestInfo> {
    const testFrameworks: string[] = [];
    const testDirectories: string[] = [];
    let testFileCount = 0;

    // Check for common test directories
    const testDirPatterns = ['test', 'tests', '__tests__', 'spec', 'specs'];

    try {
        const contents = await githubFetch<Array<{ name: string; type: string }>>(
            token,
            `/repos/${owner}/${repo}/contents`
        );

        for (const item of contents) {
            const name = item.name.toLowerCase();
            if (item.type === 'dir' && testDirPatterns.includes(name)) {
                testDirectories.push(item.name);
            }
        }
    } catch {
        // Ignore
    }

    // Search for test files
    try {
        const testFiles = await githubFetch<{ total_count: number }>(
            token,
            `/search/code?q=repo:${owner}/${repo}+filename:test+filename:spec&per_page=1`
        );
        testFileCount = Math.min(testFiles.total_count, 999); // GitHub caps at 1000
    } catch {
        // Code search might be rate limited
    }

    // Try to detect frameworks from package.json
    try {
        const packageJson = await githubFetch<{
            devDependencies?: Record<string, string>;
            dependencies?: Record<string, string>;
        }>(token, `/repos/${owner}/${repo}/contents/package.json`, {
            headers: { Accept: 'application/vnd.github.v3.raw' },
        });

        const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        if (allDeps.jest || allDeps['@jest/core']) testFrameworks.push('Jest');
        if (allDeps.mocha) testFrameworks.push('Mocha');
        if (allDeps.vitest) testFrameworks.push('Vitest');
        if (allDeps.cypress) testFrameworks.push('Cypress');
        if (allDeps.playwright || allDeps['@playwright/test']) testFrameworks.push('Playwright');
        if (allDeps['@testing-library/react']) testFrameworks.push('Testing Library');
        if (allDeps.jasmine) testFrameworks.push('Jasmine');
        if (allDeps.ava) testFrameworks.push('AVA');
    } catch {
        // Not a Node.js project or package.json not accessible
    }

    return {
        hasTests: testFileCount > 0 || testDirectories.length > 0 || testFrameworks.length > 0,
        testFileCount,
        testFrameworks,
        testDirectories,
    };
}

// ============================================================================
// METRIC CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate bus factor (how many contributors own 80% of commits)
 */
export function calculateBusFactor(contributors: ContributorStats[]): number {
    if (contributors.length === 0) return 0;
    if (contributors.length === 1) return 1;

    const totalCommits = contributors.reduce((sum, c) => sum + c.commits, 0);
    if (totalCommits === 0) return 0;

    let cumulativePercentage = 0;
    let count = 0;

    for (const contributor of contributors) {
        cumulativePercentage += (contributor.commits / totalCommits) * 100;
        count++;
        if (cumulativePercentage >= 80) break;
    }

    return count;
}

/**
 * Calculate documentation score (0-100)
 */
export function calculateDocScore(docs: DocPresence): number {
    let score = 0;

    // README is most important (40 points)
    if (docs.hasReadme) score += 40;

    // License (20 points)
    if (docs.hasLicense) score += 20;

    // Contributing guide (15 points)
    if (docs.hasContributing) score += 15;

    // Security policy (10 points)
    if (docs.hasSecurity) score += 10;

    // Code of conduct (5 points)
    if (docs.hasCodeOfConduct) score += 5;

    // Docs directory (10 points)
    if (docs.hasDocs) score += 10;

    return score;
}

/**
 * Calculate comprehensive health score
 */
export function calculateHealthScore(
    activity: { total: number; trend: 'increasing' | 'stable' | 'decreasing' },
    prMetrics: PRMetrics,
    issueMetrics: IssueMetrics,
    docScore: number,
    busFactor: number,
    testInfo: TestInfo
): HealthScoreBreakdown {
    // Activity score (0-100)
    // Based on commits in last 90 days
    let activityScore = Math.min(100, activity.total * 2);
    if (activity.trend === 'increasing') activityScore = Math.min(100, activityScore + 10);
    if (activity.trend === 'decreasing') activityScore = Math.max(0, activityScore - 10);

    // PR Review score (0-100)
    // Based on average merge time (target: <24 hours = 100)
    let prScore = 100;
    if (prMetrics.avgMergeTimeHours > 0) {
        prScore = Math.max(0, 100 - (prMetrics.avgMergeTimeHours - 24) * 2);
    }
    prScore = Math.min(100, Math.max(0, prScore));

    // Issue response score (0-100)
    // Based on average close time (target: <7 days = 100)
    let issueScore = 100;
    if (issueMetrics.avgCloseTimeDays > 0) {
        issueScore = Math.max(0, 100 - (issueMetrics.avgCloseTimeDays - 7) * 5);
    }
    issueScore = Math.min(100, Math.max(0, issueScore));

    // Bus factor score (0-100)
    // 1 = 30, 2 = 60, 3+ = 80-100
    let busFactorScore = 30;
    if (busFactor >= 2) busFactorScore = 60;
    if (busFactor >= 3) busFactorScore = 80;
    if (busFactor >= 5) busFactorScore = 100;

    // Testing score (0-100)
    let testScore = 0;
    if (testInfo.hasTests) testScore += 30;
    if (testInfo.testFrameworks.length > 0) testScore += 30;
    if (testInfo.testFileCount >= 10) testScore += 20;
    if (testInfo.testFileCount >= 50) testScore += 20;
    testScore = Math.min(100, testScore);

    // Weighted total
    const total = Math.round(
        activityScore * 0.25 +
        prScore * 0.20 +
        issueScore * 0.15 +
        docScore * 0.15 +
        busFactorScore * 0.15 +
        testScore * 0.10
    );

    // Grade
    let grade: 'A' | 'B' | 'C' | 'D' | 'F';
    if (total >= 90) grade = 'A';
    else if (total >= 75) grade = 'B';
    else if (total >= 60) grade = 'C';
    else if (total >= 45) grade = 'D';
    else grade = 'F';

    return {
        total,
        grade,
        components: {
            activity: Math.round(activityScore),
            prReview: Math.round(prScore),
            issueResponse: Math.round(issueScore),
            documentation: docScore,
            busFactor: busFactorScore,
            testing: testScore,
        },
    };
}

// ============================================================================
// MAIN ANALYTICS FUNCTION
// ============================================================================

/**
 * Fetch and compute all analytics for a repository
 * This is the main entry point - all computation is deterministic, no AI tokens used.
 */
export async function computeFullAnalytics(
    token: string,
    owner: string,
    repo: string
): Promise<FullAnalytics> {
    console.log(`[Analytics] Computing analytics for ${owner}/${repo}`);

    // Fetch all data in parallel with error handling for each
    const results = await Promise.allSettled([
        fetchRepoOverview(token, owner, repo),
        fetchLanguages(token, owner, repo),
        fetchCommitActivity(token, owner, repo),
        fetchContributors(token, owner, repo),
        fetchPRMetrics(token, owner, repo),
        fetchIssueMetrics(token, owner, repo),
        fetchDocPresence(token, owner, repo),
        detectTestInfo(token, owner, repo),
    ]);

    // Extract results with defaults for failures
    const [
        overviewResult,
        languagesResult,
        activityResult,
        contributorsResult,
        prResult,
        issueResult,
        docResult,
        testResult,
    ] = results;

    // Overview is required - throw if it fails
    if (overviewResult.status === 'rejected') {
        console.error('[Analytics] Failed to fetch overview:', overviewResult.reason);
        throw new Error(`Failed to fetch repository overview: ${overviewResult.reason?.message || 'Unknown error'}`);
    }
    const overview = overviewResult.value;

    // Use defaults for optional data that might fail
    const languages = languagesResult.status === 'fulfilled' ? languagesResult.value : [];
    if (languagesResult.status === 'rejected') {
        console.warn('[Analytics] Failed to fetch languages, using empty array:', languagesResult.reason?.message);
    }

    const activityData = activityResult.status === 'fulfilled'
        ? activityResult.value
        : { commits: [], total: 0, trend: 'stable' as const };
    if (activityResult.status === 'rejected') {
        console.warn('[Analytics] Failed to fetch activity, using defaults:', activityResult.reason?.message);
    }

    const contributors = contributorsResult.status === 'fulfilled' ? contributorsResult.value : [];
    if (contributorsResult.status === 'rejected') {
        console.warn('[Analytics] Failed to fetch contributors, using empty array:', contributorsResult.reason?.message);
    }

    const prMetrics = prResult.status === 'fulfilled'
        ? prResult.value
        : { openCount: 0, mergedLast30Days: 0, avgMergeTimeHours: 0, avgReviewTimeHours: 0, prSizes: { small: 0, medium: 0, large: 0 } };
    if (prResult.status === 'rejected') {
        console.warn('[Analytics] Failed to fetch PR metrics, using defaults:', prResult.reason?.message);
    }

    const issueMetrics = issueResult.status === 'fulfilled'
        ? issueResult.value
        : { openCount: 0, closedLast30Days: 0, avgCloseTimeDays: 0 };
    if (issueResult.status === 'rejected') {
        console.warn('[Analytics] Failed to fetch issue metrics, using defaults:', issueResult.reason?.message);
    }

    const docPresence = docResult.status === 'fulfilled'
        ? docResult.value
        : { hasReadme: false, hasContributing: false, hasSecurity: false, hasLicense: false, hasCodeOfConduct: false, hasDocs: false, licenseType: null };
    if (docResult.status === 'rejected') {
        console.warn('[Analytics] Failed to fetch docs, using defaults:', docResult.reason?.message);
    }

    const testInfo = testResult.status === 'fulfilled'
        ? testResult.value
        : { hasTests: false, testFileCount: 0, testFrameworks: [], testDirectories: [] };
    if (testResult.status === 'rejected') {
        console.warn('[Analytics] Failed to fetch test info, using defaults:', testResult.reason?.message);
    }

    // Calculate derived metrics
    const busFactor = calculateBusFactor(contributors);
    const docScore = calculateDocScore(docPresence);
    const healthScore = calculateHealthScore(
        { total: activityData.total, trend: activityData.trend },
        prMetrics,
        issueMetrics,
        docScore,
        busFactor,
        testInfo
    );

    console.log(`[Analytics] Health score: ${healthScore.total} (${healthScore.grade})`);

    // Calculate founder-focused metrics (no AI tokens)
    const founderMetrics = computeFounderMetrics(
        activityData,
        prMetrics,
        issueMetrics,
        docPresence,
        testInfo,
        busFactor,
        contributors.length
    );

    return {
        overview,
        healthScore,
        languages,
        activity: {
            commitsLast90Days: activityData.total,
            commitsByWeek: activityData.commits,
            trend: activityData.trend,
        },
        contributors: {
            total: contributors.length,
            topContributors: contributors.slice(0, 10),
            busFactor,
        },
        pullRequests: prMetrics,
        issues: issueMetrics,
        documentation: { ...docPresence, score: docScore },
        testing: testInfo,
        founderMetrics,
    };
}

/**
 * Compute founder-focused metrics deterministically (no AI tokens)
 */
function computeFounderMetrics(
    activity: { total: number; commits: CommitActivity[]; trend: 'increasing' | 'stable' | 'decreasing' },
    prMetrics: PRMetrics,
    issueMetrics: IssueMetrics,
    docPresence: DocPresence,
    testInfo: TestInfo,
    busFactor: number,
    contributorCount: number
): FounderMetrics {
    // Delivery velocity: PRs merged per week
    const deliveryVelocity = Math.round((prMetrics.mergedLast30Days / 4) * 10) / 10;

    // Velocity trend based on activity trend
    const deliveryVelocityTrend: 'improving' | 'stable' | 'declining' =
        activity.trend === 'increasing' ? 'improving' :
            activity.trend === 'decreasing' ? 'declining' : 'stable';

    // Tech debt score (0-100, higher = healthier)
    const largePRRatio = prMetrics.prSizes.large /
        Math.max(1, prMetrics.prSizes.small + prMetrics.prSizes.medium + prMetrics.prSizes.large) * 100;
    const staleIssuesCount = issueMetrics.openCount; // Approximation
    const missingTests = !testInfo.hasTests;
    const missingDocs = !docPresence.hasReadme;

    let techDebtScore = 100;
    if (largePRRatio > 30) techDebtScore -= 20;
    if (largePRRatio > 50) techDebtScore -= 15;
    if (staleIssuesCount > 20) techDebtScore -= 15;
    if (staleIssuesCount > 50) techDebtScore -= 10;
    if (missingTests) techDebtScore -= 25;
    if (missingDocs) techDebtScore -= 15;
    techDebtScore = Math.max(0, techDebtScore);

    // Team productivity
    const commitsPerContributor = contributorCount > 0
        ? Math.round((activity.total / contributorCount) * 10) / 10
        : 0;
    const avgCommitsPerWeek = Math.round((activity.total / 13) * 10) / 10; // 13 weeks = 90 days

    // Scale readiness
    const hasTests = testInfo.hasTests;
    const hasDocs = docPresence.hasReadme || docPresence.hasDocs;
    const hasLicense = docPresence.hasLicense;
    const healthyBusFactor = busFactor >= 2;
    const activelyMaintained = activity.total > 10; // At least 10 commits in 90 days

    let scaleReadinessScore = 0;
    if (hasTests) scaleReadinessScore += 25;
    if (hasDocs) scaleReadinessScore += 20;
    if (hasLicense) scaleReadinessScore += 15;
    if (healthyBusFactor) scaleReadinessScore += 25;
    if (activelyMaintained) scaleReadinessScore += 15;

    // Investor checklist
    const investorChecklist: FounderMetrics['investorChecklist'] = [
        { item: 'Active development (commits in last 90 days)', passed: activity.total > 0, importance: 'critical' },
        { item: 'Multiple contributors (bus factor ≥ 2)', passed: healthyBusFactor, importance: 'critical' },
        { item: 'Test coverage in place', passed: hasTests, importance: 'critical' },
        { item: 'Documentation exists', passed: hasDocs, importance: 'important' },
        { item: 'Open source license', passed: hasLicense, importance: 'important' },
        { item: 'Fast PR turnaround (<24hr avg)', passed: prMetrics.avgMergeTimeHours < 24, importance: 'important' },
        { item: 'Issue responsiveness (<7 days)', passed: issueMetrics.avgCloseTimeDays < 7, importance: 'nice-to-have' },
        { item: 'Contributing guidelines', passed: docPresence.hasContributing, importance: 'nice-to-have' },
        { item: 'Security policy', passed: docPresence.hasSecurity, importance: 'nice-to-have' },
    ];

    return {
        deliveryVelocity,
        deliveryVelocityTrend,
        techDebtScore,
        techDebtFactors: {
            largePRRatio: Math.round(largePRRatio),
            staleIssuesCount,
            missingTests,
            missingDocs,
        },
        commitsPerContributor,
        avgCommitsPerWeek,
        scaleReadinessScore,
        scaleReadinessFactors: {
            hasTests,
            hasDocs,
            hasLicense,
            healthyBusFactor,
            activelyMaintained,
        },
        investorChecklist,
    };
}
