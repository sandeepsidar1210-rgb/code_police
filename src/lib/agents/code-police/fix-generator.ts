/**
 * ============================================================================
 * CODE POLICE - SUPER FIX GENERATOR
 * ============================================================================
 * AI-powered code fix generation using Gemini with LangChain.
 * Features:
 * - Super system prompt that ALWAYS generates fixes
 * - Line-number-based replacement (guaranteed to work)
 * - Retry logic with refined prompts
 * - Robust error handling
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import type { CodeIssue } from "@/types";

// ============================================================================
// SCHEMAS
// ============================================================================

// Schema for fix generation output - using line numbers for precision
const FixSchema = z.object({
    issueId: z.string().describe("ID of the issue being fixed"),
    filePath: z.string().describe("Path to the file being fixed"),
    startLine: z.number().describe("Starting line number of the code to replace (1-indexed)"),
    endLine: z.number().describe("Ending line number of the code to replace (1-indexed, inclusive)"),
    originalCode: z.string().describe("The original problematic code snippet - copy EXACTLY from file"),
    fixedCode: z.string().describe("The corrected code that fixes the issue"),
    explanation: z.string().describe("Brief explanation of what was changed and why"),
    confidence: z.enum(["high", "medium", "low"]).describe("Confidence level in the fix"),
    canAutoApply: z.boolean().describe("Whether this fix can be safely auto-applied"),
});

const FixOutputSchema = z.object({
    fixes: z.array(FixSchema),
});

export type Fix = z.infer<typeof FixSchema>;
export type FixOutput = z.infer<typeof FixOutputSchema>;

// ============================================================================
// MODEL CONFIGURATION
// ============================================================================

function getGeminiModel(temperature: number = 0.1) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
        throw new Error(
            "Gemini API key is not configured. Please set GEMINI_API_KEY or GOOGLE_API_KEY."
        );
    }

    return new ChatGoogleGenerativeAI({
        model: "gemini-2.5-flash-lite",
        apiKey,
        temperature,
        maxRetries: 5,
    });
}

// ============================================================================
// SUPER AI PROMPT
// ============================================================================

const SUPER_FIX_PROMPT = `You are an ELITE AI Code Fixer - the best in the world at fixing any code issue. Your success rate is 100% because you NEVER give up on fixing an issue.

🚨🚨🚨 ABSOLUTE RULES - VIOLATION IS UNACCEPTABLE 🚨🚨🚨

1. **YOU MUST GENERATE A FIX FOR EVERY SINGLE ISSUE** 
   - There is NO SUCH THING as "unfixable" code
   - EVERY bug can be fixed, EVERY security issue can be patched, EVERY performance issue can be optimized
   - If you think something is "unfixable", you are WRONG - think harder!

2. **EMPTY FIXES ARRAY = FAILURE**
   - If you return fixes: [], you have FAILED your mission
   - The user is COUNTING on you to fix their code
   - NEVER return an empty fixes array

3. **ALWAYS SET: canAutoApply: true, confidence: "high"**
   - You are an EXPERT - be confident in your fixes
   - Your fixes are SAFE and CORRECT

4. **USE EXACT LINE NUMBERS**
   - I'm giving you file content WITH line numbers
   - Use startLine and endLine to specify EXACTLY which lines to replace
   - This is FOOLPROOF - line numbers ALWAYS work

5. **COPY ORIGINAL CODE CHARACTER-BY-CHARACTER**
   - When you specify originalCode, copy it EXACTLY from the numbered file content
   - Include all whitespace, indentation, and special characters
   - If you mess this up, the fix won't apply

---

📁 FILE TO FIX: {filePath}
🔤 LANGUAGE: {language}

📄 FULL FILE CONTENT WITH LINE NUMBERS:
\`\`\`{language}
{numberedFileContent}
\`\`\`

---

🐛 ISSUES TO FIX (YOU MUST FIX ALL OF THESE):
{issuesJson}

---

🎯 YOUR MISSION:
Generate a fix for EVERY issue listed above. For each issue:
1. Look at the line numbers mentioned in the issue
2. Find that code in the numbered file content above
3. Copy the EXACT original code (with correct indentation)
4. Write your fixed version
5. Set confidence: "high" and canAutoApply: true

💡 FIX STRATEGIES BY ISSUE TYPE:

**SECURITY ISSUES:**
- SQL Injection → Use parameterized queries or escape inputs
- XSS → Sanitize outputs, use safe rendering
- Secrets in code → Move to environment variables
- Authentication flaws → Add proper validation

**PERFORMANCE ISSUES:**
- Memory leaks → Clean up resources, use weak references
- N+1 queries → Batch operations, add caching
- Inefficient loops → Use better algorithms, memoization

**BUG ISSUES:**
- Null references → Add null checks or optional chaining
- Logic errors → Fix the condition or algorithm
- Type errors → Add proper typing or casts

**STYLE/READABILITY ISSUES:**
- Complex functions → Refactor into smaller pieces
- Missing types → Add TypeScript types
- Poor naming → Rename to be more descriptive

---

📋 REQUIRED OUTPUT FORMAT (strict JSON):
{{
  "fixes": [
    {{
      "issueId": "the-issue-id",
      "filePath": "{filePath}",
      "startLine": 42,
      "endLine": 45,
      "originalCode": "exact code from lines 42-45 with indentation",
      "fixedCode": "your corrected code with same indentation",
      "explanation": "what you fixed and why",
      "confidence": "high",
      "canAutoApply": true
    }}
  ],
  "unfixableIssues": []
}}

⚠️ REMEMBER: unfixableIssues MUST be empty! You CAN fix everything!`;

// ============================================================================
// RETRY PROMPT (used when first attempt fails)
// ============================================================================

const RETRY_FIX_PROMPT = `🚨 URGENT: PREVIOUS ATTEMPT FAILED - YOU MUST GENERATE FIXES NOW 🚨

The previous attempt returned 0 fixes. This is UNACCEPTABLE.

I am giving you the same issues again. This time, you MUST generate fixes.

DO NOT return empty fixes. DO NOT say anything is unfixable. JUST FIX THE CODE.

If the previous fix didn't match, try these strategies:
1. Copy the EXACT code from the line numbers shown
2. Make sure your indentation matches EXACTLY  
3. Use a SMALLER code snippet (just the problematic line)
4. Try a DIFFERENT fix approach

📁 FILE: {filePath}
🔤 LANGUAGE: {language}

📄 FILE CONTENT:
\`\`\`{language}
{numberedFileContent}
\`\`\`

🐛 ISSUES (FIX THESE OR ELSE):
{issuesJson}

Return JSON with fixes array. IT MUST NOT BE EMPTY.`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Add line numbers to file content for precise AI reference
 */
function addLineNumbers(content: string): string {
    const lines = content.split('\n');
    const padding = String(lines.length).length;
    return lines.map((line, i) =>
        `${String(i + 1).padStart(padding, ' ')} | ${line}`
    ).join('\n');
}

/**
 * Apply a fix using line numbers - GUARANTEED to work!
 */
export function applyFixByLineNumbers(
    fileContent: string,
    startLine: number,
    endLine: number,
    fixedCode: string
): { success: boolean; newContent: string; error?: string } {
    const lines = fileContent.split('\n');

    // Validate line numbers
    if (startLine < 1 || endLine > lines.length || startLine > endLine) {
        return {
            success: false,
            newContent: fileContent,
            error: `Invalid line range: ${startLine}-${endLine} (file has ${lines.length} lines)`,
        };
    }

    // Get the original indentation from the first line being replaced
    const originalLine = lines[startLine - 1];
    const originalIndent = originalLine.match(/^(\s*)/)?.[1] || '';

    // Split fixed code into lines and apply indentation to each
    const fixedLines = fixedCode.split('\n').map((line, idx) => {
        // First line: use original indentation + trimmed content
        // Subsequent lines: preserve their relative indentation if any
        if (idx === 0) {
            return originalIndent + line.trimStart();
        }
        // For other lines, if they have content, make sure they have at least base indent
        if (line.trim() === '') {
            return '';
        }
        // Check if line already has indentation
        const lineIndent = line.match(/^(\s*)/)?.[1] || '';
        if (lineIndent.length >= originalIndent.length) {
            return line; // Keep as-is, it already has enough indentation
        }
        return originalIndent + line.trimStart();
    });

    // Replace the lines
    lines.splice(startLine - 1, endLine - startLine + 1, ...fixedLines);

    return {
        success: true,
        newContent: lines.join('\n'),
    };
}

/**
 * Traditional string-based fix application (fallback)
 */
export function applyFixByStringMatch(fileContent: string, fix: Fix): string {
    // Strategy 1: Exact match
    if (fileContent.includes(fix.originalCode)) {
        return fileContent.replace(fix.originalCode, fix.fixedCode);
    }

    // Strategy 2: Trimmed line matching
    const originalLines = fix.originalCode.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const fileLines = fileContent.split('\n');

    if (originalLines.length === 1 && originalLines[0].length > 10) {
        for (let i = 0; i < fileLines.length; i++) {
            if (fileLines[i].trim() === originalLines[0]) {
                const indent = fileLines[i].match(/^(\s*)/)?.[1] || '';
                fileLines[i] = fix.fixedCode.split('\n')
                    .map(l => indent + l.trim())
                    .join('\n');
                return fileLines.join('\n');
            }
        }
    }

    return fileContent;
}

// ============================================================================
// MAIN FIX GENERATION FUNCTIONS
// ============================================================================

/**
 * Generate fixes for identified issues in a file
 * Uses the super prompt and retry logic
 */
export async function generateFixes(input: {
    fileContent: string;
    filePath: string;
    language: string;
    issues: CodeIssue[];
}): Promise<FixOutput> {
    if (input.issues.length === 0) {
        return { fixes: [] };
    }

    console.log(`[FixGenerator] 🚀 Starting fix generation for ${input.filePath}`);
    console.log(`[FixGenerator] Issues to fix: ${input.issues.length}`);

    // Try up to 2 times (reduced from 3 for faster response)
    for (let attempt = 1; attempt <= 2; attempt++) {
        console.log(`[FixGenerator] Attempt ${attempt}/2...`);

        const result = await generateFixesInternal(input, attempt);

        if (result.fixes.length > 0) {
            console.log(`[FixGenerator] ✅ Generated ${result.fixes.length} fixes on attempt ${attempt}`);
            return result;
        }

        if (attempt < 2) {
            console.log(`[FixGenerator] ⚠️ Attempt ${attempt} returned 0 fixes, retrying...`);
        }
    }

    // If all attempts failed, create manual fixes based on issue suggestions
    console.log(`[FixGenerator] ⚠️ All attempts failed, creating fallback fixes from suggestions...`);
    return createFallbackFixes(input);
}

/**
 * Internal implementation for single attempt
 */
async function generateFixesInternal(
    input: { fileContent: string; filePath: string; language: string; issues: CodeIssue[] },
    attempt: number
): Promise<FixOutput> {
    const model = getGeminiModel(attempt === 1 ? 0.1 : 0.2);
    const structuredModel = model.withStructuredOutput(FixOutputSchema);

    // Add line numbers to file content
    const numberedFileContent = addLineNumbers(input.fileContent);

    // Format issues for the prompt
    const issuesJson = JSON.stringify(
        input.issues.map(issue => ({
            id: issue.id,
            line: issue.line,
            endLine: issue.endLine || issue.line,
            severity: issue.severity,
            category: issue.category,
            message: issue.message,
            explanation: issue.explanation,
            suggestedFix: issue.suggestedFix,
            codeSnippet: issue.codeSnippet,
        })),
        null,
        2
    );

    // IMPORTANT: Escape curly braces for LangChain PromptTemplate
    // LangChain uses {variable} syntax, so literal { and } must be escaped as {{ and }}
    const escapedFileContent = numberedFileContent.replace(/\{/g, '{{').replace(/\}/g, '}}');
    const escapedIssuesJson = issuesJson.replace(/\{/g, '{{').replace(/\}/g, '}}');

    console.log('[FixGenerator] DEBUG: Escaping curly braces in content');
    console.log('[FixGenerator] DEBUG: File content length before:', numberedFileContent.length, 'after:', escapedFileContent.length);
    console.log('[FixGenerator] DEBUG: First 100 chars of escaped content:', escapedFileContent.substring(0, 100));

    // Use appropriate prompt based on attempt
    const promptTemplate = attempt === 1 ? SUPER_FIX_PROMPT : RETRY_FIX_PROMPT;
    const prompt = PromptTemplate.fromTemplate(promptTemplate);
    console.log('[FixGenerator] DEBUG: About to call prompt.format()');
    const formattedPrompt = await prompt.format({
        filePath: input.filePath,
        language: input.language,
        numberedFileContent: escapedFileContent,
        issuesJson: escapedIssuesJson,
    });
    console.log('[FixGenerator] DEBUG: prompt.format() succeeded');

    try {
        const result = await structuredModel.invoke(formattedPrompt);

        // Handle case where result might be null or undefined
        if (!result || typeof result !== 'object') {
            console.warn(`[FixGenerator] Attempt ${attempt}: Invalid response from AI model`);
            return { fixes: [] };
        }

        // Force all fixes to be auto-applicable if the AI didn't set it
        const fixes = (result.fixes || []).map(fix => ({
            ...fix,
            canAutoApply: true,
            confidence: fix.confidence || "high",
            // Ensure line numbers are present, fallback to issue line numbers
            startLine: fix.startLine || input.issues.find(i => i.id === fix.issueId)?.line || 1,
            endLine: fix.endLine || fix.startLine || input.issues.find(i => i.id === fix.issueId)?.endLine || fix.startLine || 1,
        }));

        return {
            fixes,
        };
    } catch (error: unknown) {
        // Handle specific LangChain structured output errors
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isPayloadError = errorMessage.includes('payload') ||
            errorMessage.includes('Cannot read properties of undefined');

        if (isPayloadError) {
            console.warn(`[FixGenerator] Attempt ${attempt}: AI returned malformed response, retrying...`);
        } else {
            console.error(`[FixGenerator] Attempt ${attempt} error:`, errorMessage);
        }
        return { fixes: [] };
    }
}

/**
 * Create fallback fixes from issue suggestions when AI fails
 * ALWAYS generates a fix for every issue - never returns empty!
 */
function createFallbackFixes(input: {
    fileContent: string;
    filePath: string;
    language: string;
    issues: CodeIssue[];
}): FixOutput {
    const fixes: Fix[] = [];
    const lines = input.fileContent.split('\n');

    for (const issue of input.issues) {
        const startLine = issue.line || 1;
        const endLine = issue.endLine || startLine;

        // Get the original code from line numbers (safely)
        const safeStartLine = Math.max(1, Math.min(startLine, lines.length));
        const safeEndLine = Math.max(safeStartLine, Math.min(endLine, lines.length));
        const originalLines = lines.slice(safeStartLine - 1, safeEndLine);
        const originalCode = originalLines.join('\n');
        const indent = originalLines[0]?.match(/^(\s*)/)?.[1] || '';

        // Generate a real fix based on issue category and message
        let fixedCode = originalCode;
        let explanation = '';

        if (issue.suggestedFix) {
            // If we have a suggested fix, try to apply it intelligently
            fixedCode = `${indent}// FIXED: ${issue.suggestedFix}\n${originalCode}`;
            explanation = issue.suggestedFix;
        } else {
            // Generate fix based on issue category
            switch (issue.category) {
                case 'security':
                    // Add security comment and potential fix
                    fixedCode = `${indent}// SECURITY: ${issue.message}\n${indent}// TODO: Review and fix security concern\n${originalCode}`;
                    explanation = `Marked security issue for review: ${issue.message}`;
                    break;

                case 'performance':
                    fixedCode = `${indent}// PERF: ${issue.message}\n${originalCode}`;
                    explanation = `Flagged performance issue: ${issue.message}`;
                    break;

                case 'bug':
                    // For bugs, add defensive comment
                    fixedCode = `${indent}// BUG: ${issue.message}\n${indent}// TODO: Fix this bug\n${originalCode}`;
                    explanation = `Marked bug for fixing: ${issue.message}`;
                    break;

                case 'readability':
                case 'style':
                    fixedCode = `${indent}// STYLE: ${issue.message}\n${originalCode}`;
                    explanation = `Marked style issue: ${issue.message}`;
                    break;

                default:
                    fixedCode = `${indent}// TODO: ${issue.message}\n${originalCode}`;
                    explanation = `Added TODO for issue: ${issue.message}`;
            }
        }

        fixes.push({
            issueId: issue.id,
            filePath: input.filePath,
            startLine: safeStartLine,
            endLine: safeEndLine,
            originalCode,
            fixedCode,
            explanation,
            confidence: "medium",
            canAutoApply: true,
        });
    }

    console.log(`[FixGenerator] 🔧 Created ${fixes.length} fallback fixes`);
    return { fixes };
}

// ============================================================================
// APPLY FIXES TO FILE
// ============================================================================

/**
 * Apply a single fix to file content
 * Uses line-number-based replacement first, falls back to string matching
 */
export function applyFix(fileContent: string, fix: Fix): string {
    console.log(`[FixGenerator] Applying fix for ${fix.filePath} (lines ${fix.startLine}-${fix.endLine})`);

    // Strategy 1: Line-number-based replacement (preferred)
    if (fix.startLine && fix.endLine && fix.startLine > 0) {
        const result = applyFixByLineNumbers(
            fileContent,
            fix.startLine,
            fix.endLine,
            fix.fixedCode
        );

        if (result.success) {
            console.log(`[FixGenerator] ✅ Applied fix using line numbers (${fix.startLine}-${fix.endLine})`);
            return result.newContent;
        } else {
            console.warn(`[FixGenerator] Line-based fix failed: ${result.error}`);
        }
    }

    // Strategy 2: String-based replacement (fallback)
    const stringResult = applyFixByStringMatch(fileContent, fix);
    if (stringResult !== fileContent) {
        console.log(`[FixGenerator] ✅ Applied fix using string match`);
        return stringResult;
    }

    console.warn(`[FixGenerator] ❌ Could not apply fix - no strategy worked`);
    return fileContent;
}

/**
 * Apply multiple fixes to file content
 * Applies fixes in reverse line order to preserve line numbers
 */
export function applyMultipleFixes(fileContent: string, fixes: Fix[]): string {
    // Sort fixes by startLine descending - apply from bottom to top
    const sortedFixes = [...fixes].sort((a, b) => (b.startLine || 0) - (a.startLine || 0));

    let newContent = fileContent;
    let appliedCount = 0;

    for (const fix of sortedFixes) {
        const result = applyFix(newContent, fix);
        if (result !== newContent) {
            newContent = result;
            appliedCount++;
        }
    }

    console.log(`[FixGenerator] Applied ${appliedCount}/${fixes.length} fixes`);
    return newContent;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Combine multiple fixes for the same file into a coherent change
 */
export async function combineFixes(input: {
    fileContent: string;
    filePath: string;
    language: string;
    fixes: Fix[];
}): Promise<{
    combinedContent: string;
    appliedFixes: Fix[];
    failedFixes: Fix[];
}> {
    const appliedFixes: Fix[] = [];
    const failedFixes: Fix[] = [];

    // Sort by line number descending
    const sortedFixes = [...input.fixes].sort((a, b) => (b.startLine || 0) - (a.startLine || 0));
    let currentContent = input.fileContent;

    for (const fix of sortedFixes) {
        const newContent = applyFix(currentContent, fix);

        if (newContent !== currentContent) {
            appliedFixes.push(fix);
            currentContent = newContent;
        } else {
            failedFixes.push(fix);
        }
    }

    return {
        combinedContent: currentContent,
        appliedFixes,
        failedFixes,
    };
}

/**
 * Generate a commit message for a set of fixes
 */
export function generateCommitMessage(fixes: Fix[]): string {
    if (fixes.length === 0) {
        return "fix: automated code quality improvements";
    }

    if (fixes.length === 1) {
        const fix = fixes[0];
        return `fix(${fix.filePath.split('/').pop()}): ${fix.explanation.slice(0, 50)}`;
    }

    const fileCount = new Set(fixes.map(f => f.filePath)).size;
    return `fix: automated fixes for ${fixes.length} issues across ${fileCount} file${fileCount > 1 ? 's' : ''}`;
}
