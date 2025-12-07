import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { log } from "./viteSetup";

interface WsClient {
  ws: WebSocket;
  type: "app" | "device";
  deviceId?: string;
  subscribedLockers?: Set<number>;
}

class LockerWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, WsClient> = new Map();
  private deviceClients: Map<string, WebSocket> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: "/ws/lockers"
    });

    this.wss.on("connection", (ws, req) => {
      const isDevice = req.url?.includes("device=true");
      const deviceId = new URL(req.url || "", `http://${req.headers.host}`).searchParams.get("deviceId");

      const client: WsClient = {
        ws,
        type: isDevice ? "device" : "app",
        deviceId: deviceId || undefined,
        subscribedLockers: new Set(),
      };

      this.clients.set(ws, client);

      if (isDevice && deviceId) {
        this.deviceClients.set(deviceId, ws);
        log(`Device connected: ${deviceId}`, "websocket");
      } else {
        log("App client connected", "websocket");
      }

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, client, message);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      });

      ws.on("close", () => {
        if (client.deviceId) {
          this.deviceClients.delete(client.deviceId);
          log(`Device disconnected: ${client.deviceId}`, "websocket");
        } else {
          log("App client disconnected", "websocket");
        }
        this.clients.delete(ws);
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
      });

      // Send initial connection success
      ws.send(JSON.stringify({
        type: "connected",
        clientType: client.type,
        timestamp: Date.now(),
      }));
    });

    // Start heartbeat check
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, 30000);

    log("WebSocket server initialized on /ws/lockers", "websocket");
  }

  private handleMessage(ws: WebSocket, client: WsClient, message: any) {
    switch (message.type) {
      case "subscribe":
        // Subscribe to locker updates
        if (message.lockerNumbers && Array.isArray(message.lockerNumbers)) {
          message.lockerNumbers.forEach((num: number) => {
            client.subscribedLockers?.add(num);
          });
        }
        break;

      case "unsubscribe":
        if (message.lockerNumbers && Array.isArray(message.lockerNumbers)) {
          message.lockerNumbers.forEach((num: number) => {
            client.subscribedLockers?.delete(num);
          });
        }
        break;

      case "ping":
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        break;

      case "device_event":
        // Handle events from device
        if (client.type === "device") {
          this.handleDeviceEvent(client, message);
        }
        break;

      case "command_ack":
        // Device acknowledging command
        if (client.type === "device" && message.commandId) {
          this.broadcast("command_acknowledged", {
            commandId: message.commandId,
            deviceId: client.deviceId,
          });
        }
        break;

      case "command_complete":
        // Device completing command
        if (client.type === "device" && message.commandId) {
          this.broadcast("command_completed", {
            commandId: message.commandId,
            deviceId: client.deviceId,
            success: message.success,
            errorCode: message.errorCode,
          });
        }
        break;

      default:
        console.warn("Unknown WebSocket message type:", message.type);
    }
  }

  private handleDeviceEvent(client: WsClient, message: any) {
    const event = {
      deviceId: client.deviceId,
      lockerNumber: message.lockerNumber,
      eventType: message.eventType,
      payload: message.payload,
      timestamp: message.timestamp || Date.now(),
    };

    // Broadcast to all app clients
    this.broadcast("locker_event", event);
  }

  broadcast(eventType: string, data: any) {
    const message = JSON.stringify({
      type: eventType,
      data,
      timestamp: Date.now(),
    });

    this.clients.forEach((client, ws) => {
      if (ws.readyState === WebSocket.OPEN && client.type === "app") {
        ws.send(message);
      }
    });
  }

  broadcastToDevices(eventType: string, data: any) {
    const message = JSON.stringify({
      type: eventType,
      data,
      timestamp: Date.now(),
    });

    this.deviceClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  sendToDevice(deviceId: string, eventType: string, data: any) {
    const ws = this.deviceClients.get(deviceId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: eventType,
        data,
        timestamp: Date.now(),
      }));
      return true;
    }
    return false;
  }

  broadcastToLocker(lockerNumber: number, eventType: string, data: any) {
    const message = JSON.stringify({
      type: eventType,
      lockerNumber,
      data,
      timestamp: Date.now(),
    });

    this.clients.forEach((client, ws) => {
      if (
        ws.readyState === WebSocket.OPEN &&
        client.type === "app" &&
        (client.subscribedLockers?.has(lockerNumber) || client.subscribedLockers?.size === 0)
      ) {
        ws.send(message);
      }
    });
  }

  getClientCount(): number {
    return Array.from(this.clients.values()).filter(c => c.type === "app").length;
  }

  getDeviceCount(): number {
    return this.deviceClients.size;
  }

  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.wss) {
      this.wss.close();
    }
  }
}

export const wsServer = new LockerWebSocketServer();
