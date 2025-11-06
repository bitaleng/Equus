import type { Express } from "express";
import { createServer, type Server } from "http";

export async function registerRoutes(app: Express): Promise<Server> {
  // Password authentication endpoint
  app.post("/api/auth/verify", async (req, res) => {
    try {
      const { password } = req.body;
      const correctPassword = process.env.APP_PASSWORD;

      if (!correctPassword) {
        return res.status(500).json({ error: "Server configuration error" });
      }

      if (password === correctPassword) {
        res.json({ success: true });
      } else {
        res.status(401).json({ error: "Invalid password" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
