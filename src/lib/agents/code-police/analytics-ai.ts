/**
 * ============================================================================
 * CODE POLICE - ANALYTICS AI SUMMARY GENERATOR
 * ============================================================================
 * Minimal AI usage for high-value insights.
 * Uses compact JSON input to minimize token consumption.
 * Results are cached for 24 hours.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// TYPES
// ============================================================================

export interface MetricsSummary {
    repoName: string;
    loc?: number;
    languages: Record<string, number>; // top 3 only
    commits90d: number;
    contributorCount: number;
    busFactor: number;
    avgPRMergeHrs: number;
    openIssues: number;
    avgIssueCloseDays: number;
    docsScore: number;
    testCount: number;
    healthScore: number;
    healthGrade: string;
    trend: 'increasing' | 'stable' | 'decreasing';
}

export interface AIInsights {
    summary: string;
    topActions: string[];
    generatedAt: string;
}

// ============================================================================
// AI SUMMARY GENERATION
// ============================================================================

const SUMMARY_PROMPT = `You are a senior software engineering advisor analyzing a GitHub repository.

Based on the metrics JSON below, provide:
1. A 3-4 sentence executive summary of the repository's health and status
2. Exactly 5 prioritized action items to improve the codebase

Be specific and actionable. Focus on the most impactful improvements.

Metrics:
{METRICS}

Respond in this exact JSON format:
{
  "summary": "3-4 sentence summary here...",
  "topActions": [
    "Action 1...",
    "Action 2...",
    "Action 3...",
    "Action 4...",
    "Action 5..."
  ]
}`;

/**
 * Generate AI-powered insights from repository metrics
 * This is the ONLY function that uses AI tokens.
 * 
 * Token usage: ~400-800 tokens per call (input + output)
 */
export async function generateAIInsights(
    metrics: MetricsSummary
): Promise<AIInsights> {
    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.warn('[Analytics AI] No API key found, returning fallback insights');
        return generateFallbackInsights(metrics);
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash-lite',
            generationConfig: {
                temperature: 0.3, // Low temperature for consistent outputs
                maxOutputTokens: 500, // Limit output tokens
            },
        });

        // Create compact metrics JSON (minimize input tokens)
        const compactMetrics = {
            repo: metrics.repoName,
            health: `${metrics.healthScore}/100 (${metrics.healthGrade})`,
            lang: Object.entries(metrics.languages).slice(0, 3).map(([k, v]) => `${k}:${v}%`).join(', '),
            act: `${metrics.commits90d} commits/90d (${metrics.trend})`,
            team: `${metrics.contributorCount} contributors, bus factor: ${metrics.busFactor}`,
            pr: `avg merge: ${metrics.avgPRMergeHrs}hrs`,
            issues: `${metrics.openIssues} open, avg close: ${metrics.avgIssueCloseDays}d`,
            docs: `${metrics.docsScore}/100`,
            tests: `${metrics.testCount} test files`,
        };

        const prompt = SUMMARY_PROMPT.replace('{METRICS}', JSON.stringify(compactMetrics, null, 2));

        console.log('[Analytics AI] Generating insights...');
        const result = await model.generateContent(prompt);
        const response = result.response.text();

        // Parse JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Invalid AI response format');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        return {
            summary: parsed.summary || 'Unable to generate summary.',
            topActions: parsed.topActions || [],
            generatedAt: new Date().toISOString(),
        };
    } catch (error) {
        console.error('[Analytics AI] Error generating insights:', error);
        return generateFallbackInsights(metrics);
    }
}

/**
 * Generate deterministic fallback insights when AI is unavailable
 * Uses no tokens - pure rule-based logic
 */
function generateFallbackInsights(metrics: MetricsSummary): AIInsights {
    const actions: string[] = [];
    const summaryParts: string[] = [];

    // Build summary based on metrics
    const primaryLang = Object.keys(metrics.languages)[0] || 'Unknown';
    summaryParts.push(
        `${metrics.repoName} is a ${primaryLang} project with a health score of ${metrics.healthScore}/100 (${metrics.healthGrade}).`
    );

    // Activity assessment
    if (metrics.commits90d > 100) {
        summaryParts.push('The project shows high development activity.');
    } else if (metrics.commits90d > 30) {
        summaryParts.push('The project has moderate development activity.');
    } else {
        summaryParts.push('Development activity has been relatively low recently.');
        actions.push('Consider increasing commit frequency to maintain momentum');
    }

    // Bus factor assessment
    if (metrics.busFactor <= 1) {
        summaryParts.push('⚠️ Warning: Single contributor dependency detected.');
        actions.push('CRITICAL: Reduce bus factor by involving more contributors');
    } else if (metrics.busFactor <= 2) {
        actions.push('Encourage more contributors to spread knowledge across the team');
    }

    // PR assessment
    if (metrics.avgPRMergeHrs > 48) {
        actions.push(`Reduce PR merge time (currently ${metrics.avgPRMergeHrs}hrs, target <24hrs)`);
    }

    // Issue assessment
    if (metrics.avgIssueCloseDays > 14) {
        actions.push(`Improve issue response time (currently ${metrics.avgIssueCloseDays} days avg)`);
    }

    // Documentation assessment
    if (metrics.docsScore < 50) {
        actions.push('Add missing documentation (CONTRIBUTING.md, SECURITY.md)');
    }

    // Testing assessment
    if (metrics.testCount === 0) {
        actions.push('Add test coverage - no test files detected');
    } else if (metrics.testCount < 20) {
        actions.push('Increase test coverage for better reliability');
    }

    // Pad actions to 5 if needed
    const genericActions = [
        'Review and update dependencies regularly',
        'Consider adding CI/CD pipeline improvements',
        'Document key architectural decisions',
        'Set up automated code quality checks',
        'Create onboarding guide for new contributors',
    ];

    while (actions.length < 5) {
        const action = genericActions[actions.length];
        if (action && !actions.includes(action)) {
            actions.push(action);
        } else {
            break;
        }
    }

    return {
        summary: summaryParts.join(' '),
        topActions: actions.slice(0, 5),
        generatedAt: new Date().toISOString(),
    };
}

/**
 * Create a cache key from metrics for deduplication
 */
export function createMetricsCacheKey(metrics: MetricsSummary): string {
    // Create a stable hash from key metrics
    const key = [
        metrics.repoName,
        metrics.healthScore,
        metrics.commits90d,
        metrics.contributorCount,
        metrics.docsScore,
        metrics.testCount,
    ].join('-');

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }

    return `analytics-ai-${Math.abs(hash).toString(16)}`;
}
