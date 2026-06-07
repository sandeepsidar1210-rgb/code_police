/**
 * ============================================================================
 * CODE POLICE - AI ANALYSIS CHAINS
 * ============================================================================
 * LangChain integration with Gemini for code analysis.
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import type { CodeIssue, IssueSeverity, IssueCategory } from "@/types";

// Schema for structured output
export const CodeIssueSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  category: z.enum(["security", "performance", "readability", "bug", "test", "style"]),
  message: z.string().describe("Clear, concise description of the issue"),
  line: z.number().describe("Starting line number of the issue"),
  endLine: z.number().optional().describe("Ending line number if span multiple lines"),
  suggestedFix: z.string().optional().describe("Concrete code fix suggestion"),
  explanation: z.string().describe("Why this is problematic and its impact"),
  ruleId: z.string().optional().describe("Rule identifier like SEC001, PERF001"),
});

export const AnalysisOutputSchema = z.object({
  issues: z.array(CodeIssueSchema),
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

/**
 * Get configured Gemini model.
 *
 * Supports BYOK (Bring Your Own Key): if an explicit `overrideKey` is provided
 * (resolved from a project/user BYOK config), it takes precedence. Otherwise we
 * fall back to the platform GEMINI_API_KEY / GOOGLE_API_KEY.
 */
function getGeminiModel(temperature: number = 0, overrideKey?: string) {
  const apiKey = overrideKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Gemini API key is not configured. Please set GEMINI_API_KEY or GOOGLE_API_KEY in your environment variables."
    );
  }

  console.log("[Gemini] Initializing model with API key:", apiKey.substring(0, 8) + "...");

  return new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash-lite",  // Using flash lite for faster responses
    apiKey,
    temperature,
    maxRetries: 2,
  });
}

// Static analysis prompt template with custom rules support
const ANALYSIS_PROMPT = `You are a senior code reviewer with expertise in security, performance, and code quality. Analyze the following code for issues.

**File:** {filePath}
**Language:** {language}
**Commit Message:** {commitMessage}
{customRulesSection}
{dependentContextSection}
**Code to analyze:**
\`\`\`{language}
{code}
\`\`\`

**Analysis Focus Areas:**
1. **Security** (severity: critical/high): SQL injection, XSS, command injection, insecure secrets, authentication flaws
2. **Performance** (severity: medium/high): N+1 queries, memory leaks, inefficient algorithms, unnecessary re-renders
3. **Bug Detection** (severity: varies): Null pointer risks, race conditions, incorrect logic, edge cases
4. **Readability** (severity: low/medium): Complex functions (>50 lines), unclear naming, missing comments for complex logic
5. **Test Coverage** (severity: info/low): Untested edge cases, missing error handling tests

**Instructions:**
- Only report REAL issues found in the code
- Be specific with line numbers
- Provide actionable fix suggestions
- If no issues found, return an empty array
- Focus on substantive issues, not style nitpicks
- CRITICAL: If custom rules are provided above, treat them as HIGH PRIORITY constraints

Return your analysis as a JSON object with an "issues" array. Each issue should have: severity, category, message, line, explanation, and optionally suggestedFix and ruleId.`;

const SUMMARY_PROMPT = `Based on the following code analysis results, generate a concise summary for an email report.

**Repository:** {repoName}
**Commit:** {commitSha}
**Branch:** {branch}

**Issue Counts:**
- Critical: {criticalCount}
- High: {highCount}
- Medium: {mediumCount}
- Low: {lowCount}
- Info: {infoCount}

**Top Issues:**
{topIssues}

Generate a 2-3 paragraph summary that:
1. Highlights the most important findings
2. Provides context on the severity distribution
3. Gives 1-2 actionable recommendations

Keep the tone professional but friendly. Be concise.`;

/**
 * Format custom rules section for the prompt
 */
function formatCustomRulesSection(customRules?: string[]): string {
  if (!customRules || customRules.length === 0) return '';

  const rulesText = customRules
    .map((rule, i) => `  ${i + 1}. ${rule}`)
    .join('\n');

  return `
**🚨 CUSTOM RULES (HIGH PRIORITY):**
The project owner has defined the following rules that MUST be enforced:
${rulesText}

Violations of these custom rules should be marked as HIGH severity.
`;
}

/**
 * Format dependent context section for graph-aware analysis
 */
function formatDependentContextSection(dependentContext?: string): string {
  if (!dependentContext) return '';

  return `
**📦 DEPENDENT FILES CONTEXT:**
The following files import or depend on the file being analyzed. Consider how changes might affect them:
${dependentContext}
`;
}

/**
 * Analyze a code chunk for issues
 * @param input.customRules - Optional array of user-defined rules to enforce
 * @param input.dependentContext - Optional context about files that import this file
 */
export async function analyzeCode(input: {
  code: string;
  filePath: string;
  language: string;
  commitMessage: string;
  customRules?: string[];
  dependentContext?: string;
  /** Optional BYOK key to use instead of the platform default. */
  apiKey?: string;
}): Promise<Omit<CodeIssue, "id" | "analysisRunId" | "projectId" | "isMuted">[]> {
  console.log(`[Analyzer] Starting analysis for: ${input.filePath}`);
  console.log(`[Analyzer] Language: ${input.language}, Code length: ${input.code.length} chars`);

  try {
    const model = getGeminiModel(0, input.apiKey);
    console.log("[Analyzer] ✓ Gemini model initialized");

    const structuredModel = model.withStructuredOutput(AnalysisOutputSchema);

    const customRulesSection = formatCustomRulesSection(input.customRules);
    const dependentContextSection = formatDependentContextSection(input.dependentContext);

    const prompt = PromptTemplate.fromTemplate(ANALYSIS_PROMPT);
    const formattedPrompt = await prompt.format({
      filePath: input.filePath,
      language: input.language,
      commitMessage: input.commitMessage,
      code: input.code,
      customRulesSection,
      dependentContextSection,
    });

    console.log(`[Analyzer] Prompt length: ${formattedPrompt.length} chars, calling Gemini...`);

    const result = await structuredModel.invoke(formattedPrompt);

    // Handle case where result might be null or undefined
    if (!result || typeof result !== 'object') {
      console.warn("[Analyzer] ⚠️ Invalid response from AI model");
      return [];
    }

    console.log(`[Analyzer] ✓ Gemini response received, ${result.issues?.length || 0} issues found`);

    const mappedIssues = (result.issues || []).map((issue) => ({
      filePath: input.filePath,
      line: issue.line,
      endLine: issue.endLine,
      severity: issue.severity as IssueSeverity,
      category: issue.category as IssueCategory,
      message: issue.message,
      explanation: issue.explanation,
      suggestedFix: issue.suggestedFix,
      ruleId: issue.ruleId,
      codeSnippet: extractCodeSnippet(input.code, issue.line, issue.endLine),
    }));

    return mappedIssues;
  } catch (error: unknown) {
    // Handle specific LangChain structured output errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isPayloadError = errorMessage.includes('payload') ||
      errorMessage.includes('Cannot read properties of undefined');

    if (isPayloadError) {
      console.warn("[Analyzer] ⚠️ AI returned malformed response, continuing with empty issues");
    } else {
      console.error("[Analyzer] ❌ Code analysis failed:", errorMessage);
    }
    // Return empty array instead of throwing to allow other files to continue
    return [];
  }
}

/**
 * Generate summary for email report
 */
export async function generateAnalysisSummary(input: {
  repoName: string;
  commitSha: string;
  branch: string;
  issues: CodeIssue[];
}): Promise<string> {
  const model = getGeminiModel(0.3);

  const counts = {
    critical: input.issues.filter((i) => i.severity === "critical").length,
    high: input.issues.filter((i) => i.severity === "high").length,
    medium: input.issues.filter((i) => i.severity === "medium").length,
    low: input.issues.filter((i) => i.severity === "low").length,
    info: input.issues.filter((i) => i.severity === "info").length,
  };

  const severityOrder: Record<IssueSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };

  const topIssues = input.issues
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 5)
    .map((issue, i) => `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.message}`)
    .join("\n");

  const prompt = PromptTemplate.fromTemplate(SUMMARY_PROMPT);
  const formattedPrompt = await prompt.format({
    repoName: input.repoName,
    commitSha: (input.commitSha || 'unknown').slice(0, 7),
    branch: input.branch,
    criticalCount: counts.critical,
    highCount: counts.high,
    mediumCount: counts.medium,
    lowCount: counts.low,
    infoCount: counts.info,
    topIssues: topIssues || "No issues found.",
  });

  try {
    const response = await model.invoke(formattedPrompt);
    return response.content as string;
  } catch (error) {
    console.error("Summary generation failed:", error);
    return "Unable to generate summary. Please review the issues manually.";
  }
}

/**
 * Extract code snippet around a specific line
 */
function extractCodeSnippet(code: string, line: number, endLine?: number): string {
  const lines = code.split("\n");
  const startLine = Math.max(0, line - 3);
  const end = Math.min(lines.length, (endLine || line) + 3);

  return lines
    .slice(startLine, end)
    .map((l, i) => `${startLine + i + 1}: ${l}`)
    .join("\n");
}

/**
 * Detect programming language from file extension
 */
export function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    php: "php",
    sql: "sql",
    sol: "solidity",
  };

  return languageMap[ext || ""] || "text";
}

/**
 * Chunk code for analysis (handles large files)
 */
export function chunkCode(code: string, maxLines: number = 200): string[] {
  const lines = code.split("\n");
  const chunks: string[] = [];

  for (let i = 0; i < lines.length; i += maxLines) {
    chunks.push(lines.slice(i, i + maxLines).join("\n"));
  }

  return chunks;
}
