/**
 * ============================================================================
 * SELF-HEALING AGENT - TEST RUNNER
 * ============================================================================
 * Auto-detects and runs the repo's test suite.
 * Captures stdout/stderr, exit code, and parses error patterns.
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";

// ============================================================================
// TYPES
// ============================================================================

export interface TestResult {
    passed: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    fullOutput: string;
    errors: ParsedError[];
    testFramework: string;
    durationMs: number;
}

export interface ParsedError {
    filePath: string;
    line: number;
    message: string;
    type: "SYNTAX" | "LINTING" | "RUNTIME" | "LOGIC" | "IMPORT" | "TYPE" | "DEPENDENCY";
}

// ============================================================================
// TEST FRAMEWORK DETECTION
// ============================================================================

interface TestCommand {
    command: string;
    installCommand?: string;
    framework: string;
}

/**
 * Detect the appropriate test command for a repository
 */
export function detectTestCommand(repoDir: string): TestCommand {
    // Check for package.json (JavaScript/TypeScript)
    const pkgJsonPath = path.join(repoDir, "package.json");
    if (existsSync(pkgJsonPath)) {
        try {
            const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));

            // Check for test script
            if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
                return {
                    command: "npm test",
                    installCommand: "npm install",
                    framework: "npm",
                };
            }

            // Check for common test frameworks in dependencies
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (allDeps.jest || allDeps["@jest/core"]) {
                return {
                    command: "npx jest --no-cache --forceExit",
                    installCommand: "npm install",
                    framework: "jest",
                };
            }
            if (allDeps.vitest) {
                return {
                    command: "npx vitest run",
                    installCommand: "npm install",
                    framework: "vitest",
                };
            }
            if (allDeps.mocha) {
                return {
                    command: "npx mocha",
                    installCommand: "npm install",
                    framework: "mocha",
                };
            }

            // Fallback to npm test
            if (pkg.scripts?.test) {
                return {
                    command: "npm test",
                    installCommand: "npm install",
                    framework: "npm",
                };
            }
        } catch {
            // Invalid package.json, continue
        }
    }

    // Check for Python projects
    const pyProjectPath = path.join(repoDir, "pyproject.toml");
    const setupPyPath = path.join(repoDir, "setup.py");
    const requirementsPath = path.join(repoDir, "requirements.txt");

    if (existsSync(pyProjectPath) || existsSync(setupPyPath) || existsSync(requirementsPath)) {
        const installCmd = existsSync(requirementsPath)
            ? "pip install -r requirements.txt"
            : existsSync(pyProjectPath)
                ? "pip install -e ."
                : "pip install -e .";

        return {
            command: "python -m pytest -v",
            installCommand: installCmd,
            framework: "pytest",
        };
    }

    // Check for Go
    const goModPath = path.join(repoDir, "go.mod");
    if (existsSync(goModPath)) {
        return {
            command: "go test ./...",
            framework: "go",
        };
    }

    // Check for Rust
    const cargoPath = path.join(repoDir, "Cargo.toml");
    if (existsSync(cargoPath)) {
        return {
            command: "cargo test",
            framework: "cargo",
        };
    }

    // Check for Java/Maven
    const pomPath = path.join(repoDir, "pom.xml");
    if (existsSync(pomPath)) {
        return {
            command: "mvn test",
            framework: "maven",
        };
    }

    // Default to trying npm test
    return {
        command: "npm test",
        installCommand: "npm install",
        framework: "unknown",
    };
}

// ============================================================================
// TEST EXECUTION
// ============================================================================

/**
 * Install dependencies before running tests
 */
export function installDependencies(repoDir: string, installCommand: string): void {
    // Use npm ci (faster) when lockfile exists, otherwise fall back to npm install
    let cmd = installCommand;
    if (installCommand === "npm install") {
        const lockfilePath = path.join(repoDir, "package-lock.json");
        if (existsSync(lockfilePath)) {
            cmd = "npm ci";
        }
    }

    console.log(`[TestRunner] Installing dependencies: ${cmd}`);
    try {
        execSync(cmd, {
            cwd: repoDir,
            timeout: 60000, // 60s timeout
            stdio: "pipe",
            env: { ...process.env, CI: "true" },
        });
        console.log(`[TestRunner] ✅ Dependencies installed`);
    } catch (error) {
        const err = error as Error & { stderr?: Buffer };
        // If npm ci fails, fall back to npm install
        if (cmd === "npm ci") {
            console.warn(`[TestRunner] npm ci failed, falling back to npm install`);
            try {
                execSync("npm install", {
                    cwd: repoDir,
                    timeout: 60000,
                    stdio: "pipe",
                    env: { ...process.env, CI: "true" },
                });
                console.log(`[TestRunner] ✅ Dependencies installed (fallback)`);
                return;
            } catch {
                // Continue to warning below
            }
        }
        console.warn(`[TestRunner] ⚠️ Install warning: ${err.stderr?.toString()?.slice(0, 200) || err.message}`);
        // Don't throw — sometimes install has warnings but tests still work
    }
}

/**
 * Run tests and capture results
 */
export function runTests(repoDir: string, skipInstall: boolean = false): TestResult {
    const testCmd = detectTestCommand(repoDir);
    console.log(`[TestRunner] Detected framework: ${testCmd.framework}`);
    console.log(`[TestRunner] Running: ${testCmd.command}`);

    // Install deps if needed (skipped when orchestrator already installed once)
    if (!skipInstall && testCmd.installCommand) {
        installDependencies(repoDir, testCmd.installCommand);
    }

    const startTime = Date.now();

    try {
        const output = execSync(testCmd.command, {
            cwd: repoDir,
            timeout: 120000, // 2 min timeout
            stdio: "pipe",
            env: {
                ...process.env,
                CI: "true",
                NODE_ENV: "test",
                FORCE_COLOR: "0",
            },
        });

        const stdout = output.toString();
        const durationMs = Date.now() - startTime;

        console.log(`[TestRunner] ✅ Tests PASSED in ${durationMs}ms`);

        return {
            passed: true,
            exitCode: 0,
            stdout,
            stderr: "",
            fullOutput: stdout,
            errors: [],
            testFramework: testCmd.framework,
            durationMs,
        };
    } catch (error) {
        const err = error as Error & {
            stdout?: Buffer;
            stderr?: Buffer;
            status?: number;
        };

        const stdout = err.stdout?.toString() || "";
        const stderr = err.stderr?.toString() || "";
        const fullOutput = `${stdout}\n${stderr}`.trim();
        const durationMs = Date.now() - startTime;

        console.log(`[TestRunner] ❌ Tests FAILED (exit code: ${err.status}) in ${durationMs}ms`);

        // Parse errors from output
        const errors = parseErrors(fullOutput, repoDir);

        return {
            passed: false,
            exitCode: err.status || 1,
            stdout,
            stderr,
            fullOutput,
            errors,
            testFramework: testCmd.framework,
            durationMs,
        };
    }
}

// ============================================================================
// ERROR PARSING
// ============================================================================

/**
 * Parse error output to extract structured error information
 */
export function parseErrors(output: string, repoDir: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const seen = new Set<string>();
    const lines = output.split("\n");

    for (const line of lines) {
        const parsed = parseErrorLine(line, repoDir);
        if (parsed) {
            const key = `${parsed.filePath}:${parsed.line}:${parsed.message}`;
            if (!seen.has(key)) {
                seen.add(key);
                errors.push(parsed);
            }
        }
    }

    return errors;
}

/**
 * Parse a single line for error patterns
 */
function parseErrorLine(line: string, repoDir: string): ParsedError | null {
    // Python: File "src/main.py", line 10, in <module>
    const pythonMatch = line.match(/File "([^"]+)", line (\d+)/);
    if (pythonMatch) {
        return {
            filePath: pythonMatch[1].replace(repoDir + "/", ""),
            line: parseInt(pythonMatch[2], 10),
            message: line.trim(),
            type: classifyError(line),
        };
    }

    // Pytest short format: tests/test_utils.py:10: AssertionError
    const pytestShortMatch = line.match(/^([^:\s]+\.py):(\d+):\s*(\w*Error|\w*Exception|FAILED)/i);
    if (pytestShortMatch) {
        return {
            filePath: pytestShortMatch[1].replace(repoDir + "/", ""),
            line: parseInt(pytestShortMatch[2], 10),
            message: line.trim(),
            type: classifyError(line),
        };
    }

    // Pytest FAILED summary: FAILED tests/test_utils.py::test_name - reason
    const pytestFailedMatch = line.match(/^FAILED\s+([^:\s]+\.py)::(\S+)/i);
    if (pytestFailedMatch) {
        return {
            filePath: pytestFailedMatch[1].replace(repoDir + "/", ""),
            line: 1,
            message: line.trim(),
            type: classifyError(line),
        };
    }

    // Pytest collection error: ERROR collecting tests/test_utils.py
    const pytestCollectMatch = line.match(/^(?:ERROR|E)\s+.*?([^\s/]+\.py)/i);
    if (pytestCollectMatch && (line.includes("Error") || line.includes("error") || line.includes("collecting"))) {
        return {
            filePath: pytestCollectMatch[1].replace(repoDir + "/", ""),
            line: 1,
            message: line.trim(),
            type: classifyError(line),
        };
    }

    // JavaScript/TypeScript: src/index.ts(10,5): error TS2304
    const tsMatch = line.match(/([^(\s]+)\((\d+),\d+\):\s*error/);
    if (tsMatch) {
        return {
            filePath: tsMatch[1].replace(repoDir + "/", ""),
            line: parseInt(tsMatch[2], 10),
            message: line.trim(),
            type: "TYPE",
        };
    }

    // ESLint: /path/to/file.js:10:5: error message
    const eslintMatch = line.match(/([^:\s]+):(\d+):\d+:\s*(error|warning)/i);
    if (eslintMatch) {
        return {
            filePath: eslintMatch[1].replace(repoDir + "/", ""),
            line: parseInt(eslintMatch[2], 10),
            message: line.trim(),
            type: "LINTING",
        };
    }

    // Generic: file.py:10: SyntaxError: invalid syntax
    const genericMatch = line.match(/([^:\s]+\.(?:py|js|ts|jsx|tsx|rb|go|rs|java)):(\d+)(?::.*)?(?:Error|error|Exception)/i);
    if (genericMatch) {
        return {
            filePath: genericMatch[1].replace(repoDir + "/", ""),
            line: parseInt(genericMatch[2], 10),
            message: line.trim(),
            type: classifyError(line),
        };
    }

    return null;
}

/**
 * Classify an error line into a bug category
 */
function classifyError(line: string): ParsedError["type"] {
    const lower = line.toLowerCase();

    if (lower.includes("syntaxerror") || lower.includes("syntax error") || lower.includes("unexpected token")) {
        return "SYNTAX";
    }
    if (lower.includes("importerror") || lower.includes("modulenotfounderror") || lower.includes("cannot find module")) {
        return "IMPORT";
    }
    if (lower.includes("typeerror") || lower.includes("type error") || lower.includes("ts2")) {
        return "TYPE";
    }
    if (lower.includes("lint") || lower.includes("eslint") || lower.includes("pylint")) {
        return "LINTING";
    }
    if (lower.includes("nameerror") || lower.includes("referenceerror") || lower.includes("undefined")) {
        return "RUNTIME";
    }
    if (lower.includes("dependency") || lower.includes("package") || lower.includes("install")) {
        return "DEPENDENCY";
    }
    if (lower.includes("assertionerror") || lower.includes("expect") || lower.includes("assert")) {
        return "LOGIC";
    }

    return "RUNTIME";
}
