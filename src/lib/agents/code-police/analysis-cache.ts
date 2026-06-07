/**
 * ============================================================================
 * CODE POLICE - ANALYSIS CACHE
 * ============================================================================
 * Multi-layer cache for code analysis results.
 *
 * Layer 1: In-memory Map (instant, survives dev server lifetime)
 * Layer 2: Redis (survives restarts, shared across instances)
 *
 * Cache key = SHA-256 hash of file content + language + custom rules.
 * If a file hasn't changed, we return cached analysis results instantly
 * instead of calling Gemini again (~4-5s saved per file).
 */

import crypto from "crypto";

// ============================================================================
// TYPES
// ============================================================================

export interface CachedAnalysisResult {
    issues: Array<{
        filePath: string;
        line: number;
        endLine?: number;
        severity: string;
        category: string;
        message: string;
        explanation: string;
        suggestedFix?: string;
        ruleId?: string;
        codeSnippet?: string;
    }>;
    timestamp: number;
    modelVersion: string;
}

// ============================================================================
// IN-MEMORY CACHE (L1)
// ============================================================================

const memoryCache = new Map<string, CachedAnalysisResult>();
const MAX_MEMORY_ENTRIES = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================================
// REDIS CLIENT (L2) - Lazy initialization
// ============================================================================

let redisClient: import("ioredis").default | null = null;
let redisAvailable = false;
let redisChecked = false;

async function getRedis(): Promise<import("ioredis").default | null> {
    if (redisChecked) return redisClient;
    redisChecked = true;

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        console.log("[Cache] No REDIS_URL configured, using in-memory cache only");
        return null;
    }

    try {
        const Redis = (await import("ioredis")).default;
        redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 1,
            connectTimeout: 3000,
            lazyConnect: true,
        });

        await redisClient.connect();
        redisAvailable = true;
        console.log("[Cache] ✅ Redis connected");
        return redisClient;
    } catch (error) {
        console.warn("[Cache] ⚠️ Redis unavailable, using in-memory cache only:",
            error instanceof Error ? error.message : error);
        redisClient = null;
        redisAvailable = false;
        return null;
    }
}

// ============================================================================
// HASH GENERATION
// ============================================================================

const MODEL_VERSION = "gemini-2.5-flash-lite-v1";

/**
 * Generate a deterministic cache key from file content and analysis parameters.
 * Same content + same rules = same hash = cache hit.
 */
export function generateCacheKey(
    code: string,
    language: string,
    customRules?: string[]
): string {
    const payload = JSON.stringify({
        code,
        language,
        customRules: customRules?.sort() || [],
        modelVersion: MODEL_VERSION,
    });
    return crypto.createHash("sha256").update(payload).digest("hex");
}

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

/**
 * Get cached analysis result. Checks L1 (memory), then L2 (Redis).
 */
export async function getCachedAnalysis(
    cacheKey: string
): Promise<CachedAnalysisResult | null> {
    // L1: Check in-memory cache
    const memResult = memoryCache.get(cacheKey);
    if (memResult) {
        if (Date.now() - memResult.timestamp < CACHE_TTL_MS) {
            console.log(`[Cache] ✅ L1 HIT (memory)`);
            return memResult;
        }
        // Expired
        memoryCache.delete(cacheKey);
    }

    // L2: Check Redis
    try {
        const redis = await getRedis();
        if (redis) {
            const redisResult = await redis.get(`code-police:analysis:${cacheKey}`);
            if (redisResult) {
                const parsed: CachedAnalysisResult = JSON.parse(redisResult);
                // Promote to L1
                memoryCache.set(cacheKey, parsed);
                console.log(`[Cache] ✅ L2 HIT (Redis)`);
                return parsed;
            }
        }
    } catch (error) {
        console.warn("[Cache] Redis read error:", error instanceof Error ? error.message : error);
    }

    console.log(`[Cache] ❌ MISS`);
    return null;
}

/**
 * Store analysis result in both L1 and L2 cache.
 */
export async function setCachedAnalysis(
    cacheKey: string,
    result: CachedAnalysisResult
): Promise<void> {
    // L1: Store in memory
    if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
        // Evict oldest entries
        const keysToDelete = [...memoryCache.keys()].slice(0, 100);
        keysToDelete.forEach(k => memoryCache.delete(k));
    }
    memoryCache.set(cacheKey, result);

    // L2: Store in Redis
    try {
        const redis = await getRedis();
        if (redis) {
            await redis.set(
                `code-police:analysis:${cacheKey}`,
                JSON.stringify(result),
                "EX",
                86400 // 24h TTL
            );
        }
    } catch (error) {
        console.warn("[Cache] Redis write error:", error instanceof Error ? error.message : error);
    }
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats(): { memoryEntries: number; redisAvailable: boolean } {
    return {
        memoryEntries: memoryCache.size,
        redisAvailable,
    };
}

/**
 * Clear all cache entries
 */
export async function clearCache(): Promise<void> {
    memoryCache.clear();
    try {
        const redis = await getRedis();
        if (redis) {
            // Delete all code-police cache keys
            const keys = await redis.keys("code-police:analysis:*");
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        }
    } catch (error) {
        console.warn("[Cache] Failed to clear Redis cache:", error);
    }
}

// ============================================================================
// PARALLEL PROCESSING UTILITIES
// ============================================================================

/**
 * Process items in parallel batches with a concurrency limit.
 * Returns results in order, handles errors per-item gracefully.
 */
export async function processBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number = 5,
    onBatchComplete?: (batchIndex: number, totalBatches: number) => void
): Promise<{ results: R[]; errors: Array<{ index: number; error: string }> }> {
    const results: R[] = [];
    const errors: Array<{ index: number; error: string }> = [];
    const totalBatches = Math.ceil(items.length / concurrency);

    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchIndex = Math.floor(i / concurrency);

        const batchResults = await Promise.allSettled(
            batch.map((item, idx) => processor(item).then(r => ({ globalIndex: i + idx, result: r })))
        );

        for (const outcome of batchResults) {
            if (outcome.status === "fulfilled") {
                results.push(outcome.value.result);
            } else {
                const failedIdx = i + batchResults.indexOf(outcome);
                errors.push({
                    index: failedIdx,
                    error: outcome.reason instanceof Error
                        ? outcome.reason.message
                        : String(outcome.reason),
                });
            }
        }

        onBatchComplete?.(batchIndex + 1, totalBatches);
    }

    return { results, errors };
}
