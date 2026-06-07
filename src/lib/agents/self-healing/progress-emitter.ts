/**
 * ============================================================================
 * SELF-HEALING AGENT - PROGRESS EMITTER
 * ============================================================================
 * EventEmitter-based progress tracker for SSE streaming to the dashboard.
 * Stores active sessions and allows API routes to subscribe to events.
 */

import { EventEmitter } from "events";
import type { HealingEvent, HealingEventType } from "@/types";

// Increase max listeners since multiple SSE clients might subscribe
EventEmitter.defaultMaxListeners = 50;

// ============================================================================
// SESSION STORE
// ============================================================================

const activeSessions = new Map<string, EventEmitter>();

/**
 * Get or create an event emitter for a session
 */
export function getSessionEmitter(sessionId: string): EventEmitter {
    let emitter = activeSessions.get(sessionId);
    if (!emitter) {
        emitter = new EventEmitter();
        activeSessions.set(sessionId, emitter);
    }
    return emitter;
}

/**
 * Remove a session emitter (cleanup after session ends)
 */
export function removeSessionEmitter(sessionId: string): void {
    const emitter = activeSessions.get(sessionId);
    if (emitter) {
        emitter.removeAllListeners();
        activeSessions.delete(sessionId);
    }
}

/**
 * Check if a session is active
 */
export function isSessionActive(sessionId: string): boolean {
    return activeSessions.has(sessionId);
}

// ============================================================================
// EVENT EMISSION HELPERS
// ============================================================================

/**
 * Emit a healing event for a session
 */
export function emitHealingEvent(
    sessionId: string,
    type: HealingEventType,
    data: Record<string, unknown>
): void {
    const emitter = activeSessions.get(sessionId);
    if (!emitter) return;

    const event: HealingEvent = {
        type,
        data,
        timestamp: new Date().toISOString(),
    };

    emitter.emit("healing-event", event);
}

/**
 * Emit a status change event
 */
export function emitStatus(
    sessionId: string,
    status: string,
    message: string
): void {
    emitHealingEvent(sessionId, "status", { status, message });
}

/**
 * Emit a log message
 */
export function emitLog(sessionId: string, message: string, level: "info" | "warn" | "error" = "info"): void {
    emitHealingEvent(sessionId, "log", { message, level });
}

/**
 * Emit a bug found event
 */
export function emitBugFound(
    sessionId: string,
    bug: {
        category: string;
        filePath: string;
        line: number;
        message: string;
    }
): void {
    emitHealingEvent(sessionId, "bug_found", bug);
}

/**
 * Emit a test result event
 */
export function emitTestResult(
    sessionId: string,
    result: {
        passed: boolean;
        output: string;
        errorCount: number;
        attempt: number;
    }
): void {
    emitHealingEvent(sessionId, "test_result", result);
}

/**
 * Emit a fix applied event
 */
export function emitFixApplied(
    sessionId: string,
    fix: {
        filePath: string;
        description: string;
        bugId: string;
    }
): void {
    emitHealingEvent(sessionId, "fix_applied", fix);
}

/**
 * Emit an attempt complete event
 */
export function emitAttemptComplete(
    sessionId: string,
    attempt: {
        attempt: number;
        status: string;
        bugsFound: number;
        bugsFixed: number;
        durationMs: number;
    }
): void {
    emitHealingEvent(sessionId, "attempt_complete", attempt);
}

/**
 * Emit the final score event
 */
export function emitScore(
    sessionId: string,
    score: Record<string, unknown>
): void {
    emitHealingEvent(sessionId, "score", score);
}

/**
 * Emit an error event
 */
export function emitError(sessionId: string, error: string): void {
    emitHealingEvent(sessionId, "error", { error });
}
