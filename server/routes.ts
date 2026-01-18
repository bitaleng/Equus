import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { wsServer } from "./wsServer";
import {
  insertHardwareDeviceSchema,
  updateHardwareDeviceSchema,
  insertLockerHardwareSchema,
  updateLockerHardwareSchema,
  insertLockerCommandSchema,
  insertLockerEventSchema,
} from "@shared/schema";
import { z } from "zod";
import CryptoJS from "crypto-js";

// HMAC Authentication Middleware for Device API
async function deviceAuth(req: Request, res: Response, next: NextFunction) {
  const deviceId = req.headers["x-device-id"] as string;
  const timestamp = req.headers["x-timestamp"] as string;
  const signature = req.headers["x-signature"] as string;

  if (!deviceId || !timestamp || !signature) {
    return res.status(401).json({ error: "Missing authentication headers" });
  }

  // Check timestamp (within 5 minutes)
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();
  if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
    return res.status(401).json({ error: "Request timestamp expired" });
  }

  try {
    // Fetch device and verify shared secret
    const device = await storage.getDevice(deviceId);
    if (!device) {
      return res.status(401).json({ error: "Unknown device" });
    }

    // Verify HMAC signature: HMAC-SHA256(deviceId + timestamp + body, sharedSecret)
    const body = JSON.stringify(req.body || {});
    const message = `${deviceId}${timestamp}${body}`;
    const expectedSignature = CryptoJS.HmacSHA256(message, device.sharedSecret).toString(CryptoJS.enc.Hex);

    if (signature !== expectedSignature) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Attach device info to request for downstream handlers
    (req as any).device = device;
    next();
  } catch (error) {
    console.error("Device auth error:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

export function registerRoutes(app: Express) {
  // ==================== Hardware Devices API ====================
  
  // Get all devices
  app.get("/api/devices", async (req, res) => {
    try {
      const devices = await storage.getAllDevices();
      res.json({ success: true, devices });
    } catch (error) {
      console.error("Error getting devices:", error);
      res.status(500).json({ success: false, error: "Failed to get devices", devices: [] });
    }
  });

  // Get single device
  app.get("/api/devices/:deviceId", async (req, res) => {
    try {
      const device = await storage.getDevice(req.params.deviceId);
      if (!device) {
        return res.status(404).json({ error: "Device not found" });
      }
      res.json(device);
    } catch (error) {
      console.error("Error getting device:", error);
      res.status(500).json({ error: "Failed to get device" });
    }
  });

  // Create device
  app.post("/api/devices", async (req, res) => {
    try {
      const validated = insertHardwareDeviceSchema.parse(req.body);
      const device = await storage.createDevice(validated);
      wsServer.broadcast("device_created", device);
      res.status(201).json(device);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating device:", error);
      res.status(500).json({ error: "Failed to create device" });
    }
  });

  // Update device
  app.patch("/api/devices/:deviceId", async (req, res) => {
    try {
      const validated = updateHardwareDeviceSchema.parse(req.body);
      const device = await storage.updateDevice(req.params.deviceId, validated);
      if (!device) {
        return res.status(404).json({ error: "Device not found" });
      }
      wsServer.broadcast("device_updated", device);
      res.json(device);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating device:", error);
      res.status(500).json({ error: "Failed to update device" });
    }
  });

  // Delete device
  app.delete("/api/devices/:deviceId", async (req, res) => {
    try {
      const deleted = await storage.deleteDevice(req.params.deviceId);
      if (!deleted) {
        return res.status(404).json({ error: "Device not found" });
      }
      wsServer.broadcast("device_deleted", { deviceId: req.params.deviceId });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting device:", error);
      res.status(500).json({ error: "Failed to delete device" });
    }
  });

  // ==================== Locker Hardware API ====================

  // Get all locker hardware status
  app.get("/api/lockers/hardware", async (req, res) => {
    try {
      const lockers = await storage.getAllLockerHardware();
      res.json(lockers);
    } catch (error) {
      console.error("Error getting locker hardware:", error);
      res.status(500).json({ error: "Failed to get locker hardware" });
    }
  });

  // Get single locker hardware status
  app.get("/api/lockers/hardware/:lockerNumber", async (req, res) => {
    try {
      const lockerNumber = parseInt(req.params.lockerNumber, 10);
      const locker = await storage.getLockerHardware(lockerNumber);
      if (!locker) {
        return res.status(404).json({ error: "Locker not found" });
      }
      res.json(locker);
    } catch (error) {
      console.error("Error getting locker hardware:", error);
      res.status(500).json({ error: "Failed to get locker hardware" });
    }
  });

  // Create locker hardware
  app.post("/api/lockers/hardware", async (req, res) => {
    try {
      const validated = insertLockerHardwareSchema.parse(req.body);
      const locker = await storage.createLockerHardware(validated);
      wsServer.broadcast("locker_created", locker);
      res.status(201).json(locker);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating locker hardware:", error);
      res.status(500).json({ error: "Failed to create locker hardware" });
    }
  });

  // Bulk create locker hardware
  app.post("/api/lockers/hardware/bulk", async (req, res) => {
    try {
      const { startNumber, endNumber, deviceId, lockerType } = req.body;
      
      if (!startNumber || !endNumber || startNumber > endNumber) {
        return res.status(400).json({ error: "Invalid locker range" });
      }

      const lockers: any[] = [];
      for (let i = startNumber; i <= endNumber; i++) {
        lockers.push({
          lockerNumber: i,
          lockerType: lockerType || "wardrobe",
          pairNumber: i,
          deviceId: deviceId || null,
        });
      }

      const created = await storage.bulkCreateLockerHardware(lockers);
      wsServer.broadcast("lockers_created", created);
      res.status(201).json(created);
    } catch (error) {
      console.error("Error bulk creating locker hardware:", error);
      res.status(500).json({ error: "Failed to create locker hardware" });
    }
  });

  // Update locker hardware
  app.patch("/api/lockers/hardware/:lockerNumber", async (req, res) => {
    try {
      const lockerNumber = parseInt(req.params.lockerNumber, 10);
      const validated = updateLockerHardwareSchema.parse(req.body);
      const locker = await storage.updateLockerHardware(lockerNumber, validated);
      if (!locker) {
        return res.status(404).json({ error: "Locker not found" });
      }
      wsServer.broadcast("locker_updated", locker);
      res.json(locker);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating locker hardware:", error);
      res.status(500).json({ error: "Failed to update locker hardware" });
    }
  });

  // ==================== Locker Control API (State Machine) ====================

  // Reserve locker (Check-in: Unlock shoe locker)
  app.post("/api/lockers/:lockerNumber/reserve", async (req, res) => {
    try {
      const lockerNumber = parseInt(req.params.lockerNumber, 10);
      const { lockerLogId } = req.body;
      
      if (!lockerLogId) {
        return res.status(400).json({ error: "lockerLogId is required" });
      }

      const locker = await storage.reserveLocker(lockerNumber, lockerLogId);
      if (!locker) {
        return res.status(400).json({ error: "Cannot reserve locker. Invalid state or locker not found" });
      }

      // Create event
      await storage.createEvent({
        lockerNumber,
        eventType: "lock_released",
        source: "app",
        payload: JSON.stringify({ action: "reserve", lockerLogId }),
      });

      // Notify via WebSocket
      wsServer.broadcast("locker_reserved", locker);
      wsServer.broadcastToDevices("command", {
        commandId: locker.lastCommandId,
        lockerNumber,
        action: "unlock_shoe",
      });

      res.json(locker);
    } catch (error) {
      console.error("Error reserving locker:", error);
      res.status(500).json({ error: "Failed to reserve locker" });
    }
  });

  // Confirm key removed (Transition to wardrobe in use)
  app.post("/api/lockers/:lockerNumber/confirm-key-removed", async (req, res) => {
    try {
      const lockerNumber = parseInt(req.params.lockerNumber, 10);
      const locker = await storage.confirmKeyRemoved(lockerNumber);
      
      if (!locker) {
        return res.status(400).json({ error: "Cannot confirm key removed. Invalid state" });
      }

      await storage.createEvent({
        lockerNumber,
        eventType: "key_removed",
        source: "app",
      });

      wsServer.broadcast("locker_updated", locker);
      res.json(locker);
    } catch (error) {
      console.error("Error confirming key removed:", error);
      res.status(500).json({ error: "Failed to confirm key removed" });
    }
  });

  // Checkout locker (Lock all)
  app.post("/api/lockers/:lockerNumber/checkout", async (req, res) => {
    try {
      const lockerNumber = parseInt(req.params.lockerNumber, 10);
      const locker = await storage.checkoutLocker(lockerNumber);
      
      if (!locker) {
        return res.status(400).json({ error: "Cannot checkout locker. Invalid state" });
      }

      await storage.createEvent({
        lockerNumber,
        eventType: "lock_engaged",
        source: "app",
        payload: JSON.stringify({ action: "checkout" }),
      });

      wsServer.broadcast("locker_checkout", locker);
      wsServer.broadcastToDevices("command", {
        commandId: locker.lastCommandId,
        lockerNumber,
        action: "lock_all",
      });

      res.json(locker);
    } catch (error) {
      console.error("Error checking out locker:", error);
      res.status(500).json({ error: "Failed to checkout locker" });
    }
  });

  // Reset locker (Admin function)
  app.post("/api/lockers/:lockerNumber/reset", async (req, res) => {
    try {
      const lockerNumber = parseInt(req.params.lockerNumber, 10);
      const locker = await storage.resetLocker(lockerNumber);
      
      if (!locker) {
        return res.status(404).json({ error: "Locker not found" });
      }

      await storage.createEvent({
        lockerNumber,
        eventType: "lock_released",
        source: "app",
        payload: JSON.stringify({ action: "reset" }),
      });

      wsServer.broadcast("locker_reset", locker);
      res.json(locker);
    } catch (error) {
      console.error("Error resetting locker:", error);
      res.status(500).json({ error: "Failed to reset locker" });
    }
  });

  // ==================== Commands API ====================

  // Get pending commands (for device polling)
  app.get("/api/commands/pending", deviceAuth, async (req, res) => {
    try {
      const deviceId = req.headers["x-device-id"] as string;
      const commands = await storage.getPendingCommands(deviceId);
      res.json(commands);
    } catch (error) {
      console.error("Error getting pending commands:", error);
      res.status(500).json({ error: "Failed to get pending commands" });
    }
  });

  // Acknowledge command
  app.post("/api/commands/:commandId/ack", deviceAuth, async (req, res) => {
    try {
      const command = await storage.updateCommand(req.params.commandId, {
        status: "acknowledged",
        acknowledgedAt: new Date(),
      });
      
      if (!command) {
        return res.status(404).json({ error: "Command not found" });
      }

      wsServer.broadcast("command_acknowledged", command);
      res.json(command);
    } catch (error) {
      console.error("Error acknowledging command:", error);
      res.status(500).json({ error: "Failed to acknowledge command" });
    }
  });

  // Complete command
  app.post("/api/commands/:commandId/complete", deviceAuth, async (req, res) => {
    try {
      const { success, errorCode, errorMessage } = req.body;
      
      const command = await storage.updateCommand(req.params.commandId, {
        status: success ? "completed" : "failed",
        completedAt: new Date(),
        errorCode: errorCode || undefined,
        errorMessage: errorMessage || undefined,
      });
      
      if (!command) {
        return res.status(404).json({ error: "Command not found" });
      }

      // Update locker state based on command completion
      if (success && command.commandType === "unlock_shoe") {
        await storage.updateLockerHardware(command.lockerNumber, {
          hardwareState: "shoe_unlocked",
        });
      }

      wsServer.broadcast("command_completed", command);
      res.json(command);
    } catch (error) {
      console.error("Error completing command:", error);
      res.status(500).json({ error: "Failed to complete command" });
    }
  });

  // ==================== Events API ====================

  // Post event from device
  app.post("/api/events", deviceAuth, async (req, res) => {
    try {
      const validated = insertLockerEventSchema.parse({
        ...req.body,
        source: "device",
      });
      
      const event = await storage.createEvent(validated);

      // Handle event-driven state changes
      if (event.eventType === "key_removed") {
        await storage.updateLockerHardware(event.lockerNumber, {
          keyInserted: false,
        });
      } else if (event.eventType === "key_inserted") {
        await storage.updateLockerHardware(event.lockerNumber, {
          keyInserted: true,
        });
      } else if (event.eventType === "door_opened") {
        await storage.updateLockerHardware(event.lockerNumber, {
          doorOpen: true,
        });
      } else if (event.eventType === "door_closed") {
        await storage.updateLockerHardware(event.lockerNumber, {
          doorOpen: false,
        });
      }

      wsServer.broadcast("locker_event", event);
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating event:", error);
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  // Get events for locker
  app.get("/api/lockers/:lockerNumber/events", async (req, res) => {
    try {
      const lockerNumber = parseInt(req.params.lockerNumber, 10);
      const limit = parseInt(req.query.limit as string) || 100;
      const events = await storage.getEventsByLocker(lockerNumber, limit);
      res.json(events);
    } catch (error) {
      console.error("Error getting events:", error);
      res.status(500).json({ error: "Failed to get events" });
    }
  });

  // Get recent events
  app.get("/api/events/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const events = await storage.getRecentEvents(limit);
      res.json(events);
    } catch (error) {
      console.error("Error getting recent events:", error);
      res.status(500).json({ error: "Failed to get recent events" });
    }
  });

  // ==================== Device Heartbeat ====================
  app.post("/api/devices/:deviceId/heartbeat", deviceAuth, async (req, res) => {
    try {
      const device = await storage.updateDevice(req.params.deviceId, {
        status: "online",
        lastSeenAt: new Date(),
        ipAddress: req.ip || undefined,
      });
      
      if (!device) {
        return res.status(404).json({ error: "Device not found" });
      }

      wsServer.broadcast("device_heartbeat", { deviceId: device.deviceId, lastSeenAt: device.lastSeenAt });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating heartbeat:", error);
      res.status(500).json({ error: "Failed to update heartbeat" });
    }
  });

  // ==================== System Status ====================
  app.get("/api/system/status", async (req, res) => {
    try {
      const [devices, lockers] = await Promise.all([
        storage.getAllDevices(),
        storage.getAllLockerHardware(),
      ]);

      const onlineDevices = devices.filter(d => d.status === "online").length;
      const lockerStates = lockers.reduce((acc, l) => {
        acc[l.hardwareState] = (acc[l.hardwareState] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      res.json({
        totalDevices: devices.length,
        onlineDevices,
        totalLockers: lockers.length,
        lockerStates,
        wsConnections: wsServer.getClientCount(),
        deviceConnections: wsServer.getDeviceCount(),
      });
    } catch (error) {
      console.error("Error getting system status:", error);
      res.status(500).json({ error: "Failed to get system status" });
    }
  });

  // ==================== License Management API ====================
  
  // Generate random license key
  function generateLicenseKey(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = '';
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) key += '-';
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }

  // Validate license (public endpoint for client)
  app.post("/api/license/validate", async (req, res) => {
    try {
      const { licenseKey, deviceId, deviceInfo } = req.body;
      
      if (!licenseKey || !deviceId) {
        return res.status(400).json({ valid: false, reason: "라이선스 키와 기기 ID가 필요합니다." });
      }

      const result = await storage.validateLicense(licenseKey, deviceId);
      
      if (result.valid && result.license && !result.license.deviceId) {
        // 새 기기 등록
        await storage.registerDevice(licenseKey, deviceId, deviceInfo);
      }

      res.json(result);
    } catch (error) {
      console.error("Error validating license:", error);
      res.status(500).json({ valid: false, reason: "라이선스 검증 중 오류가 발생했습니다." });
    }
  });

  // Unregister device (public endpoint for client)
  app.post("/api/license/unregister", async (req, res) => {
    try {
      const { licenseKey, deviceId } = req.body;
      
      if (!licenseKey || !deviceId) {
        return res.status(400).json({ success: false, reason: "라이선스 키와 기기 ID가 필요합니다." });
      }

      const license = await storage.getLicenseByKey(licenseKey);
      if (!license) {
        return res.status(404).json({ success: false, reason: "라이선스를 찾을 수 없습니다." });
      }

      if (license.deviceId !== deviceId) {
        return res.status(403).json({ success: false, reason: "현재 기기에서만 등록 해제할 수 있습니다." });
      }

      const updated = await storage.unregisterDevice(licenseKey);
      if (updated) {
        res.json({ success: true, message: "기기 등록이 해제되었습니다." });
      } else {
        res.status(500).json({ success: false, reason: "등록 해제 중 오류가 발생했습니다." });
      }
    } catch (error) {
      console.error("Error unregistering device:", error);
      res.status(500).json({ success: false, reason: "기기 등록 해제 중 오류가 발생했습니다." });
    }
  });

  // Get all licenses (admin only - TODO: add admin auth)
  app.get("/api/admin/licenses", async (req, res) => {
    try {
      const licenses = await storage.getAllLicenses();
      res.json({ success: true, licenses });
    } catch (error) {
      console.error("Error getting licenses:", error);
      res.status(500).json({ success: false, error: "Failed to get licenses" });
    }
  });

  // Create new license (admin only)
  app.post("/api/admin/licenses", async (req, res) => {
    try {
      const { customerName, customerContact, notes, expiresAt } = req.body;
      
      if (!customerName) {
        return res.status(400).json({ success: false, error: "고객명은 필수입니다." });
      }

      const licenseKey = generateLicenseKey();
      const license = await storage.createLicense({
        licenseKey,
        customerName,
        customerContact: customerContact || null,
        notes: notes || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        status: 'active',
      });

      res.status(201).json({ success: true, license });
    } catch (error) {
      console.error("Error creating license:", error);
      res.status(500).json({ success: false, error: "Failed to create license" });
    }
  });

  // Update license (admin only)
  app.patch("/api/admin/licenses/:licenseKey", async (req, res) => {
    try {
      const { status, customerName, customerContact, notes, expiresAt } = req.body;
      const updates: any = {};
      
      if (status) updates.status = status;
      if (customerName) updates.customerName = customerName;
      if (customerContact !== undefined) updates.customerContact = customerContact;
      if (notes !== undefined) updates.notes = notes;
      if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;

      const license = await storage.updateLicense(req.params.licenseKey, updates);
      if (!license) {
        return res.status(404).json({ success: false, error: "License not found" });
      }

      res.json({ success: true, license });
    } catch (error) {
      console.error("Error updating license:", error);
      res.status(500).json({ success: false, error: "Failed to update license" });
    }
  });

  // Force unregister device (admin only)
  app.post("/api/admin/licenses/:licenseKey/unregister", async (req, res) => {
    try {
      const license = await storage.unregisterDevice(req.params.licenseKey);
      if (!license) {
        return res.status(404).json({ success: false, error: "License not found" });
      }

      res.json({ success: true, license, message: "기기 등록이 해제되었습니다." });
    } catch (error) {
      console.error("Error force unregistering device:", error);
      res.status(500).json({ success: false, error: "Failed to unregister device" });
    }
  });

  // Delete license (admin only)
  app.delete("/api/admin/licenses/:licenseKey", async (req, res) => {
    try {
      const deleted = await storage.deleteLicense(req.params.licenseKey);
      if (!deleted) {
        return res.status(404).json({ success: false, error: "License not found" });
      }

      res.json({ success: true, message: "라이선스가 삭제되었습니다." });
    } catch (error) {
      console.error("Error deleting license:", error);
      res.status(500).json({ success: false, error: "Failed to delete license" });
    }
  });
}
