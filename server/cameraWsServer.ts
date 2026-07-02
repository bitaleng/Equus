import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { log } from "./viteSetup";

interface CameraClient {
  ws: WebSocket;
  role: "broadcaster" | "viewer";
}

class CameraWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, CameraClient> = new Map();
  private broadcasterWs: WebSocket | null = null;
  private activeToken: string | null = null;
  private viewerCount = 0;

  initialize(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/ws/camera" });

    this.wss.on("connection", (ws, req) => {
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const token = url.searchParams.get("token") || "";
      const role = url.searchParams.get("role") as "broadcaster" | "viewer" | null;

      if (role === "broadcaster") {
        // Broadcaster connects — set/update token
        if (this.broadcasterWs && this.broadcasterWs.readyState === WebSocket.OPEN) {
          this.broadcasterWs.close();
        }
        this.broadcasterWs = ws;
        this.activeToken = token;
        this.viewerCount = 0;
        this.clients.set(ws, { ws, role: "broadcaster" });
        ws.send(JSON.stringify({ type: "broadcaster_ready", viewerCount: 0 }));
        log("Camera broadcaster connected", "camera");

      } else {
        // Viewer — validate token
        if (!this.activeToken || token !== this.activeToken) {
          ws.send(JSON.stringify({ type: "error", message: "접속 코드가 올바르지 않습니다" }));
          ws.close();
          return;
        }
        this.viewerCount++;
        this.clients.set(ws, { ws, role: "viewer" });
        ws.send(JSON.stringify({ type: "viewer_connected" }));
        this.notifyBroadcaster();
        log(`Camera viewer connected (total: ${this.viewerCount})`, "camera");
      }

      ws.on("message", (data) => {
        const client = this.clients.get(ws);
        if (!client) return;

        if (client.role === "broadcaster") {
          // Relay frame to all viewers
          this.clients.forEach((c, viewerWs) => {
            if (c.role === "viewer" && viewerWs.readyState === WebSocket.OPEN) {
              viewerWs.send(data);
            }
          });
        }
      });

      ws.on("close", () => {
        const client = this.clients.get(ws);
        if (client?.role === "broadcaster") {
          this.broadcasterWs = null;
          this.activeToken = null;
          // Notify all viewers that stream ended
          this.clients.forEach((c, viewerWs) => {
            if (c.role === "viewer" && viewerWs.readyState === WebSocket.OPEN) {
              viewerWs.send(JSON.stringify({ type: "stream_ended" }));
            }
          });
          log("Camera broadcaster disconnected", "camera");
        } else if (client?.role === "viewer") {
          this.viewerCount = Math.max(0, this.viewerCount - 1);
          this.notifyBroadcaster();
          log(`Camera viewer disconnected (total: ${this.viewerCount})`, "camera");
        }
        this.clients.delete(ws);
      });

      ws.on("error", () => {
        this.clients.delete(ws);
      });
    });

    log("Camera WebSocket server initialized on /ws/camera", "camera");
  }

  private notifyBroadcaster() {
    if (this.broadcasterWs?.readyState === WebSocket.OPEN) {
      this.broadcasterWs.send(JSON.stringify({ type: "viewer_count", count: this.viewerCount }));
    }
  }
}

export const cameraWsServer = new CameraWebSocketServer();
