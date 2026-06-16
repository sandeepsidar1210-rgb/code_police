import { WebSocketServer, WebSocket } from "ws";

// Extend the Node global object to persist the server and connections across hot reloads in development
interface GlobalWebSocketState {
  wss?: WebSocketServer;
  clients?: Map<string, Set<WebSocket>>;
}

const globalState = global as unknown as GlobalWebSocketState;

/**
 * Initialize the WebSocket server if it is not already running.
 * Binds to port 3001 and handles subscriptions by projectId.
 */
export function initWebSocketServer() {
  if (typeof window !== "undefined") return;

  if (!globalState.wss) {
    try {
      console.log("[WebSocket] Starting WebSocket server on port 3001...");
      const wss = new WebSocketServer({ port: 3001 });
      globalState.wss = wss;
      globalState.clients = new Map();

      wss.on("connection", (ws) => {
        let currentProjectId: string | undefined = undefined;

        ws.on("message", (message) => {
          try {
            const data = JSON.parse(message.toString());
            if (data.type === "subscribe" && data.projectId) {
              const projectId = data.projectId as string;
              currentProjectId = projectId;
              if (!globalState.clients) {
                globalState.clients = new Map();
              }
              if (!globalState.clients.has(projectId)) {
                globalState.clients.set(projectId, new Set());
              }
              globalState.clients.get(projectId)!.add(ws);
              console.log(`[WebSocket] Client subscribed to project: ${projectId}`);
              
              // Acknowledge subscription
              ws.send(
                JSON.stringify({
                  type: "subscription_success",
                  projectId: projectId,
                  message: "Subscribed to analysis stream",
                })
              );
            }
          } catch (e) {
            console.error("[WebSocket] Error processing message:", e);
          }
        });

        ws.on("close", () => {
          if (currentProjectId && globalState.clients && globalState.clients.has(currentProjectId)) {
            const projectClients = globalState.clients.get(currentProjectId)!;
            projectClients.delete(ws);
            if (projectClients.size === 0) {
              globalState.clients.delete(currentProjectId);
            }
            console.log(`[WebSocket] Client unsubscribed from project: ${currentProjectId}`);
          }
        });

        ws.on("error", (err) => {
          console.error("[WebSocket] Connection error:", err);
        });
      });

      wss.on("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          console.warn("[WebSocket] Port 3001 is already in use. Skipping server creation, assuming another instance is running.");
        } else {
          console.error("[WebSocket] Server error:", err);
        }
      });
    } catch (error) {
      console.error("[WebSocket] Failed to initialize WebSocket server:", error);
    }
  }
}

/**
 * Send progress updates to all WebSocket clients subscribed to the given project ID.
 */
export function sendAnalysisProgress(
  projectId: string,
  payload: {
    status: string;
    progress: number;
    details?: string;
  }
) {
  try {
    initWebSocketServer(); // Ensure WebSocket server is initialized

    if (globalState.clients && globalState.clients.has(projectId)) {
      const projectClients = globalState.clients.get(projectId)!;
      if (projectClients.size > 0) {
        const message = JSON.stringify({
          type: "progress",
          projectId,
          ...payload,
        });
        
        console.log(`[WebSocket] Broadcasting status update for project ${projectId} (${payload.progress}%): "${payload.status}"`);
        
        for (const ws of projectClients) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
          }
        }
      }
    }
  } catch (error) {
    console.error("[WebSocket] Failed to send analysis progress:", error);
  }
}
