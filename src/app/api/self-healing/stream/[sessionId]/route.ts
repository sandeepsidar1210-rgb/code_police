import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
    getSessionEmitter,
    isSessionActive,
} from "@/lib/agents/self-healing/progress-emitter";
import type { HealingEvent } from "@/types";

/**
 * ============================================================================
 * SELF-HEALING - SSE STREAM ENDPOINT
 * ============================================================================
 * GET /api/self-healing/stream/[sessionId]
 *
 * Server-Sent Events endpoint for live healing progress updates.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { userId } = await auth();

    if (!userId) {
        return new Response("Unauthorized", { status: 401 });
    }

    const { sessionId } = await params;

    if (!sessionId) {
        return new Response("Missing sessionId", { status: 400 });
    }

    // Create a readable stream for SSE
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();

            // Send initial connection event
            controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "connected", data: { sessionId }, timestamp: new Date().toISOString() })}\n\n`)
            );

            // Get or create session emitter
            const emitter = getSessionEmitter(sessionId);

            // Listen for healing events
            const onEvent = (event: HealingEvent) => {
                try {
                    const data = `data: ${JSON.stringify(event)}\n\n`;
                    controller.enqueue(encoder.encode(data));

                    // Close stream on terminal events
                    if (
                        event.type === "status" &&
                        (event.data.status === "completed" || event.data.status === "failed" || event.data.status === "partial_success")
                    ) {
                        // Send a done event and close after a brief delay
                        setTimeout(() => {
                            try {
                                controller.enqueue(
                                    encoder.encode(`event: done\ndata: ${JSON.stringify({ sessionId })}\n\n`)
                                );
                                controller.close();
                            } catch {
                                // Stream already closed
                            }
                        }, 1000);
                    }
                } catch {
                    // Stream closed by client
                    emitter.removeListener("healing-event", onEvent);
                }
            };

            emitter.on("healing-event", onEvent);

            // If session is not active (already finished), send a done event
            if (!isSessionActive(sessionId)) {
                setTimeout(() => {
                    try {
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({
                                    type: "status",
                                    data: { status: "check_db", message: "Session may have already completed. Check session details." },
                                    timestamp: new Date().toISOString(),
                                })}\n\n`
                            )
                        );
                    } catch {
                        // Ignore
                    }
                }, 500);
            }

            // Handle client disconnect
            request.signal.addEventListener("abort", () => {
                emitter.removeListener("healing-event", onEvent);
            });
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
