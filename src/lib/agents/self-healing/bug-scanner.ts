/**
 * ============================================================================
 * SELF-HEALING AGENT - BUG SCANNER (Agent A: "The Scout")
 * ============================================================================
 * Uses Gemini via LangChain to scan the repository file structure,
 * identify potential bugs, and classify them by category.
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import type { HealingBug, BugCategory, IssueSeverity } from "@/types";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// MODEL CONFIGURATION
// ============================================================================

function getGeminiModel(temperature: number = 0) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY is required");
    }

    return new ChatGoogleGenerativeAI({
        model: "gemini-2.0-flash",
        temperature,
        apiKey,
        maxOutputTokens: 8192,
    });
}

// ============================================================================
// FILE SCANNING
// ============================================================================

const ANALYZABLE_EXTENSIONS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".rb", ".go", ".rs", ".java", ".kt",
    ".c", ".cpp", ".h", ".hpp", ".cs",
    ".php", ".vue", ".svelte",
]);

const EXCLUDED_DIRS = new Set([
    "node_modules", ".git", "dist", "build", ".next", "out",
    "coverage", "vendor", "__pycache__", ".venv", "venv",
    ".tox", ".mypy_cache", ".pytest_cache", "target",
]);

const MAX_FILE_SIZE = 50000; // 50KB max per file
const MAX_FILES = 15; // Limit files to scan for speed

interface ScannedFile {
    path: string;
    content: string;
    language: string;
    size: number;
}

/**
 * Scan the repository for analyzable source files
 */
export function scanFileTree(
    repoDir: string,
    maxFiles: number = MAX_FILES
): ScannedFile[] {
    const files: ScannedFile[] = [];

    function walk(dir: string) {
        if (files.length >= maxFiles) return;

        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (files.length >= maxFiles) break;

            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(repoDir, fullPath);

            if (entry.isDirectory()) {
                if (!EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
                    walk(fullPath);
                }
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (ANALYZABLE_EXTENSIONS.has(ext)) {
                    try {
                        const stat = statSync(fullPath);
                        if (stat.size <= MAX_FILE_SIZE && stat.size > 0) {
                            const content = readFileSync(fullPath, "utf-8");
                            files.push({
                                path: relativePath,
                                content,
                                language: ext.slice(1),
                                size: stat.size,
                            });
                        }
                    } catch {
                        // Skip unreadable files
                    }
                }
            }
        }
    }

    walk(repoDir);
    return files;
}

// ============================================================================
// AI BUG SCANNING
// ============================================================================

const SCANNER_SYSTEM_PROMPT = `You are an elite code bug scanner. Your job is to find ALL genuine bugs in the given code files.

You must output a valid JSON array of bug objects. Each bug must have:
- "category": One of "SYNTAX", "LINTING", "RUNTIME", "LOGIC", "IMPORT", "TYPE", "DEPENDENCY"
- "filePath": The file path where the bug is found
- "line": The line number (1-indexed)
- "message": A clear description formatted as: "<CATEGORY> error in <filePath> line <line>: <description>"
- "severity": One of "critical", "high", "medium", "low"

Focus on these bug types:
1. SYNTAX: Invalid syntax, missing brackets, wrong indentation, unclosed strings
2. LINTING: Unused variables, missing semicolons, unreachable code
3. RUNTIME: Null references, undefined access, division by zero, unhandled exceptions
4. LOGIC: Wrong conditions, off-by-one errors, incorrect comparisons, wrong return values, broken control flow
5. IMPORT: Missing imports, wrong import paths, circular dependencies
6. TYPE: Type mismatches, wrong function signatures, wrong argument counts
7. DEPENDENCY: Missing packages, version conflicts

CRITICAL RULES — DO NOT REPORT:
- Hardcoded values, magic numbers, or config strings — these are DESIGN CHOICES, not bugs
- Missing parameterization or lack of flexibility — not a bug unless it causes test failures
- Style preferences, naming conventions, or code organization
- Missing documentation or comments
- Performance suggestions that don't cause failures
- "Could be improved" observations — only report things that are BROKEN or will cause errors

Only report bugs that will cause test failures, crashes, wrong output, or runtime errors.
Output ONLY a JSON array, no other text.`;

/**
 * Scan files for bugs using Gemini AI
 */
export async function scanForBugs(
    repoDir: string,
    testErrors?: Array<{ filePath: string; line: number; message: string; type: string }>,
    onProgress?: {
        onBugFound?: (bug: HealingBug) => void;
        onLog?: (message: string) => void;
    },
    customRules?: string,
): Promise<HealingBug[]> {
    const log = (msg: string) => {
        console.log(msg);
        onProgress?.onLog?.(msg);
    };
    log(`[BugScanner] Scanning repository: ${repoDir}`);

    // Scan file tree
    const files = scanFileTree(repoDir);
    log(`[BugScanner] Found ${files.length} analyzable files`);

    if (files.length === 0) {
        return [];
    }

    // Build context for the AI
    const fileContexts = files.map((f) => {
        const numberedContent = f.content
            .split("\n")
            .map((line, i) => `${i + 1}: ${line}`)
            .join("\n");
        return `### FILE: ${f.path} (${f.language})\n\`\`\`${f.language}\n${numberedContent}\n\`\`\``;
    });

    // Include test errors for cross-reference
    let testErrorContext = "";
    if (testErrors && testErrors.length > 0) {
        testErrorContext = `\n\n### TEST FAILURES (use these to find the bugs):\n${testErrors
            .map((e) => `- ${e.type} in ${e.filePath} line ${e.line}: ${e.message}`)
            .join("\n")}`;
    }

    const model = getGeminiModel(0);

    try {
        // Build system prompt — inject custom rules if provided
        let systemPrompt = SCANNER_SYSTEM_PROMPT;
        if (customRules) {
            systemPrompt += `\n\nADDITIONAL RULES FROM THE USER (follow these strictly):\n${customRules}`;
        }

        // Process all batches in parallel for speed
        const batchSize = 5;
        const allBugs: HealingBug[] = [];
        const totalBatches = Math.ceil(fileContexts.length / batchSize);
        const batchPromises: Promise<void>[] = [];

        for (let i = 0; i < fileContexts.length; i += batchSize) {
            const batch = fileContexts.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            log(`[BugScanner] Launching scan batch ${batchNum}/${totalBatches}...`);

            batchPromises.push(
                (async () => {
                    const prompt = `Scan these code files for bugs and return a JSON array:\n\n${batch.join("\n\n")}${testErrorContext}`;
                    const response = await model.invoke([
                        new SystemMessage(systemPrompt),
                        new HumanMessage(prompt),
                    ]);

                    const content = typeof response.content === "string"
                        ? response.content
                        : JSON.stringify(response.content);

                    const jsonMatch = content.match(/\[[\s\S]*\]/);
                    if (jsonMatch) {
                        try {
                            const bugs = JSON.parse(jsonMatch[0]) as Array<{
                                category: BugCategory;
                                filePath: string;
                                line: number;
                                message: string;
                                severity: IssueSeverity;
                            }>;

                            for (const bug of bugs) {
                                const healingBug: HealingBug = {
                                    id: uuidv4(),
                                    category: bug.category || "RUNTIME",
                                    filePath: bug.filePath,
                                    line: bug.line || 1,
                                    message: bug.message,
                                    severity: bug.severity || "medium",
                                    fixed: false,
                                };
                                allBugs.push(healingBug);
                                onProgress?.onBugFound?.(healingBug);
                                log(`🐛 Found: ${bug.category} in ${bug.filePath}:${bug.line}`);
                            }
                        } catch (parseError) {
                            console.warn(`[BugScanner] Failed to parse batch ${batchNum}:`, parseError);
                        }
                    }
                })()
            );
        }

        await Promise.all(batchPromises);

        // Also add bugs from test errors that weren't found by AI
        if (testErrors) {
            for (const error of testErrors) {
                const alreadyFound = allBugs.some(
                    (b) => b.filePath === error.filePath && b.line === error.line
                );
                if (!alreadyFound) {
                    allBugs.push({
                        id: uuidv4(),
                        category: error.type as BugCategory,
                        filePath: error.filePath,
                        line: error.line,
                        message: `${error.type} error in ${error.filePath} line ${error.line}: ${error.message}`,
                        severity: "high",
                        fixed: false,
                    });
                }
            }
        }

        log(`[BugScanner] ✅ Found ${allBugs.length} bugs`);
        return allBugs;
    } catch (error) {
        console.error(`[BugScanner] AI scanning failed:`, error);

        // Return bugs from test errors as fallback
        if (testErrors && testErrors.length > 0) {
            return testErrors.map((e) => ({
                id: uuidv4(),
                category: e.type as BugCategory,
                filePath: e.filePath,
                line: e.line,
                message: `${e.type} error in ${e.filePath} line ${e.line}: ${e.message}`,
                severity: "high" as IssueSeverity,
                fixed: false,
            }));
        }

        return [];
    }
}
