/**
 * ============================================================================
 * SELF-HEALING AGENT - MODULE EXPORTS
 * ============================================================================
 */

export { runHealingLoop } from "./orchestrator";
export type { OrchestratorInput } from "./orchestrator";

export { cloneRepo, createBranch, commitChanges, pushBranch, parseGitHubUrl, cleanupSandbox, getHealingBranchName, createPullRequest, forkRepo, getBotToken } from "./repo-manager";
export type { PullRequestResult, ForkResult } from "./repo-manager";
export { runTests, detectTestCommand } from "./test-runner";
export type { TestResult, ParsedError } from "./test-runner";
export { scanForBugs, scanFileTree } from "./bug-scanner";
export { fixBugsInFile, fixAllBugs } from "./fix-engineer";
export type { FixResult } from "./fix-engineer";

export {
    getSessionEmitter,
    removeSessionEmitter,
    isSessionActive,
    emitHealingEvent,
    emitStatus,
    emitLog,
} from "./progress-emitter";
