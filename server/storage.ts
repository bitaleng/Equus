import { db } from "./db";
import { eq, and, gte, lte, desc, isNull } from "drizzle-orm";
import {
  hardwareDevices,
  lockerHardware,
  lockerCommands,
  lockerEvents,
  type HardwareDevice,
  type InsertHardwareDevice,
  type UpdateHardwareDevice,
  type LockerHardware,
  type InsertLockerHardware,
  type UpdateLockerHardware,
  type LockerCommand,
  type InsertLockerCommand,
  type UpdateLockerCommand,
  type LockerEvent,
  type InsertLockerEvent,
  type LockerHardwareState,
  type CommandType,
} from "@shared/schema";

export interface IStorage {
  // Hardware Devices
  getDevice(deviceId: string): Promise<HardwareDevice | undefined>;
  getDeviceById(id: string): Promise<HardwareDevice | undefined>;
  getAllDevices(): Promise<HardwareDevice[]>;
  getOnlineDevices(): Promise<HardwareDevice[]>;
  createDevice(device: InsertHardwareDevice): Promise<HardwareDevice>;
  updateDevice(deviceId: string, updates: UpdateHardwareDevice): Promise<HardwareDevice | undefined>;
  deleteDevice(deviceId: string): Promise<boolean>;
  
  // Locker Hardware
  getLockerHardware(lockerNumber: number): Promise<LockerHardware | undefined>;
  getAllLockerHardware(): Promise<LockerHardware[]>;
  getLockersByDevice(deviceId: string): Promise<LockerHardware[]>;
  getLockersByState(state: LockerHardwareState): Promise<LockerHardware[]>;
  createLockerHardware(locker: InsertLockerHardware): Promise<LockerHardware>;
  updateLockerHardware(lockerNumber: number, updates: UpdateLockerHardware): Promise<LockerHardware | undefined>;
  deleteLockerHardware(lockerNumber: number): Promise<boolean>;
  bulkCreateLockerHardware(lockers: InsertLockerHardware[]): Promise<LockerHardware[]>;
  
  // Locker Commands
  getCommand(id: string): Promise<LockerCommand | undefined>;
  getPendingCommands(deviceId?: string): Promise<LockerCommand[]>;
  createCommand(command: InsertLockerCommand): Promise<LockerCommand>;
  updateCommand(id: string, updates: UpdateLockerCommand): Promise<LockerCommand | undefined>;
  getCommandsByLocker(lockerNumber: number, limit?: number): Promise<LockerCommand[]>;
  
  // Locker Events
  createEvent(event: InsertLockerEvent): Promise<LockerEvent>;
  getEventsByLocker(lockerNumber: number, limit?: number): Promise<LockerEvent[]>;
  getRecentEvents(limit?: number): Promise<LockerEvent[]>;
  
  // State Machine Operations
  reserveLocker(lockerNumber: number, lockerLogId: string): Promise<LockerHardware | undefined>;
  confirmKeyRemoved(lockerNumber: number): Promise<LockerHardware | undefined>;
  checkoutLocker(lockerNumber: number): Promise<LockerHardware | undefined>;
  resetLocker(lockerNumber: number): Promise<LockerHardware | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Hardware Devices
  async getDevice(deviceId: string): Promise<HardwareDevice | undefined> {
    const [device] = await db
      .select()
      .from(hardwareDevices)
      .where(eq(hardwareDevices.deviceId, deviceId));
    return device || undefined;
  }

  async getDeviceById(id: string): Promise<HardwareDevice | undefined> {
    const [device] = await db
      .select()
      .from(hardwareDevices)
      .where(eq(hardwareDevices.id, id));
    return device || undefined;
  }

  async getAllDevices(): Promise<HardwareDevice[]> {
    return await db.select().from(hardwareDevices);
  }

  async getOnlineDevices(): Promise<HardwareDevice[]> {
    return await db
      .select()
      .from(hardwareDevices)
      .where(eq(hardwareDevices.status, "online"));
  }

  async createDevice(device: InsertHardwareDevice): Promise<HardwareDevice> {
    const [created] = await db
      .insert(hardwareDevices)
      .values(device)
      .returning();
    return created;
  }

  async updateDevice(deviceId: string, updates: UpdateHardwareDevice): Promise<HardwareDevice | undefined> {
    const [updated] = await db
      .update(hardwareDevices)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(hardwareDevices.deviceId, deviceId))
      .returning();
    return updated || undefined;
  }

  async deleteDevice(deviceId: string): Promise<boolean> {
    const result = await db
      .delete(hardwareDevices)
      .where(eq(hardwareDevices.deviceId, deviceId))
      .returning();
    return result.length > 0;
  }

  // Locker Hardware
  async getLockerHardware(lockerNumber: number): Promise<LockerHardware | undefined> {
    const [locker] = await db
      .select()
      .from(lockerHardware)
      .where(eq(lockerHardware.lockerNumber, lockerNumber));
    return locker || undefined;
  }

  async getAllLockerHardware(): Promise<LockerHardware[]> {
    return await db.select().from(lockerHardware);
  }

  async getLockersByDevice(deviceId: string): Promise<LockerHardware[]> {
    return await db
      .select()
      .from(lockerHardware)
      .where(eq(lockerHardware.deviceId, deviceId));
  }

  async getLockersByState(state: LockerHardwareState): Promise<LockerHardware[]> {
    return await db
      .select()
      .from(lockerHardware)
      .where(eq(lockerHardware.hardwareState, state));
  }

  async createLockerHardware(locker: InsertLockerHardware): Promise<LockerHardware> {
    const [created] = await db
      .insert(lockerHardware)
      .values(locker)
      .returning();
    return created;
  }

  async updateLockerHardware(lockerNumber: number, updates: UpdateLockerHardware): Promise<LockerHardware | undefined> {
    const [updated] = await db
      .update(lockerHardware)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(lockerHardware.lockerNumber, lockerNumber))
      .returning();
    return updated || undefined;
  }

  async deleteLockerHardware(lockerNumber: number): Promise<boolean> {
    const result = await db
      .delete(lockerHardware)
      .where(eq(lockerHardware.lockerNumber, lockerNumber))
      .returning();
    return result.length > 0;
  }

  async bulkCreateLockerHardware(lockers: InsertLockerHardware[]): Promise<LockerHardware[]> {
    if (lockers.length === 0) return [];
    return await db
      .insert(lockerHardware)
      .values(lockers)
      .returning();
  }

  // Locker Commands
  async getCommand(id: string): Promise<LockerCommand | undefined> {
    const [command] = await db
      .select()
      .from(lockerCommands)
      .where(eq(lockerCommands.id, id));
    return command || undefined;
  }

  async getPendingCommands(deviceId?: string): Promise<LockerCommand[]> {
    if (deviceId) {
      return await db
        .select()
        .from(lockerCommands)
        .where(
          and(
            eq(lockerCommands.deviceId, deviceId),
            eq(lockerCommands.status, "pending")
          )
        )
        .orderBy(lockerCommands.issuedAt);
    }
    return await db
      .select()
      .from(lockerCommands)
      .where(eq(lockerCommands.status, "pending"))
      .orderBy(lockerCommands.issuedAt);
  }

  async createCommand(command: InsertLockerCommand): Promise<LockerCommand> {
    const [created] = await db
      .insert(lockerCommands)
      .values(command)
      .returning();
    return created;
  }

  async updateCommand(id: string, updates: UpdateLockerCommand): Promise<LockerCommand | undefined> {
    const [updated] = await db
      .update(lockerCommands)
      .set(updates)
      .where(eq(lockerCommands.id, id))
      .returning();
    return updated || undefined;
  }

  async getCommandsByLocker(lockerNumber: number, limit = 50): Promise<LockerCommand[]> {
    return await db
      .select()
      .from(lockerCommands)
      .where(eq(lockerCommands.lockerNumber, lockerNumber))
      .orderBy(desc(lockerCommands.issuedAt))
      .limit(limit);
  }

  // Locker Events
  async createEvent(event: InsertLockerEvent): Promise<LockerEvent> {
    const [created] = await db
      .insert(lockerEvents)
      .values(event)
      .returning();
    return created;
  }

  async getEventsByLocker(lockerNumber: number, limit = 100): Promise<LockerEvent[]> {
    return await db
      .select()
      .from(lockerEvents)
      .where(eq(lockerEvents.lockerNumber, lockerNumber))
      .orderBy(desc(lockerEvents.recordedAt))
      .limit(limit);
  }

  async getRecentEvents(limit = 100): Promise<LockerEvent[]> {
    return await db
      .select()
      .from(lockerEvents)
      .orderBy(desc(lockerEvents.recordedAt))
      .limit(limit);
  }

  // State Machine Operations
  async reserveLocker(lockerNumber: number, lockerLogId: string): Promise<LockerHardware | undefined> {
    const locker = await this.getLockerHardware(lockerNumber);
    if (!locker || locker.hardwareState !== "idle") {
      return undefined;
    }

    // Create unlock_shoe command
    const command = await this.createCommand({
      lockerNumber,
      commandType: "unlock_shoe",
      deviceId: locker.deviceId || undefined,
      expiresAt: new Date(Date.now() + 30000), // 30 seconds timeout
    });

    // Update locker state
    return await this.updateLockerHardware(lockerNumber, {
      hardwareState: "reserved",
      currentLockerLogId: lockerLogId,
      lastCommandId: command.id,
    });
  }

  async confirmKeyRemoved(lockerNumber: number): Promise<LockerHardware | undefined> {
    const locker = await this.getLockerHardware(lockerNumber);
    if (!locker || !["shoe_unlocked", "reserved"].includes(locker.hardwareState)) {
      return undefined;
    }

    // Create unlock_wardrobe command
    const command = await this.createCommand({
      lockerNumber,
      commandType: "unlock_wardrobe",
      deviceId: locker.deviceId || undefined,
      expiresAt: new Date(Date.now() + 30000),
    });

    return await this.updateLockerHardware(lockerNumber, {
      hardwareState: "wardrobe_in_use",
      keyInserted: false,
      lastCommandId: command.id,
    });
  }

  async checkoutLocker(lockerNumber: number): Promise<LockerHardware | undefined> {
    const locker = await this.getLockerHardware(lockerNumber);
    if (!locker || !["wardrobe_in_use", "key_removed"].includes(locker.hardwareState)) {
      return undefined;
    }

    // Create lock_all command
    const command = await this.createCommand({
      lockerNumber,
      commandType: "lock_all",
      deviceId: locker.deviceId || undefined,
      expiresAt: new Date(Date.now() + 30000),
    });

    return await this.updateLockerHardware(lockerNumber, {
      hardwareState: "locked",
      lastCommandId: command.id,
    });
  }

  async resetLocker(lockerNumber: number): Promise<LockerHardware | undefined> {
    const locker = await this.getLockerHardware(lockerNumber);
    if (!locker) return undefined;

    return await this.updateLockerHardware(lockerNumber, {
      hardwareState: "idle",
      currentLockerLogId: undefined,
      keyInserted: true,
      doorOpen: false,
    });
  }
}

export const storage = new DatabaseStorage();
