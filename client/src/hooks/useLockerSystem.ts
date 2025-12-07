import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface LockerHardware {
  id: number;
  deviceId: number;
  lockerNumber: number;
  lockerType: "shoe" | "wardrobe";
  shoeLockerNumber?: number;
  lockState: "locked" | "unlocked";
  doorState: "closed" | "open";
  hasKey: boolean;
  occupancyState: "idle" | "reserved" | "shoe_unlocked" | "key_removed" | "wardrobe_in_use" | "checkout_pending" | "locked";
  currentSessionId?: string;
  lastEventAt?: string;
}

export interface LockerStatusResponse {
  success: boolean;
  lockers: LockerHardware[];
  timestamp: string;
}

export interface LockerCommand {
  id: number;
  lockerId: number;
  lockerNumber?: number;
  commandType: string;
  status: string;
  issuedAt: string;
  executedAt?: string;
  errorMessage?: string;
}

interface WSMessage {
  type: string;
  data?: any;
  lockerNumber?: number;
  event?: string;
  timestamp?: string;
  error?: string;
}

export function useLockerSystem() {
  const queryClient = useQueryClient();
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/lockers`);

    ws.onopen = () => {
      setWsConnected(true);
      console.log("[WS] Connected to locker system");
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        handleWSMessage(message);
      } catch (e) {
        console.error("[WS] Failed to parse message:", e);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      console.log("[WS] Disconnected, reconnecting in 3s...");
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
      console.error("[WS] Error:", error);
    };

    wsRef.current = ws;
  }, []);

  const handleWSMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case "connected":
        console.log("[WS] Server confirmed connection");
        break;
      case "locker_update":
        queryClient.invalidateQueries({ queryKey: ["/api/lockers/hardware"] });
        break;
      case "command_result":
        console.log("[WS] Command result:", message);
        queryClient.invalidateQueries({ queryKey: ["/api/lockers/hardware"] });
        break;
      case "error":
        console.error("[WS] Server error:", message.error);
        break;
    }
  }, [queryClient]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const { data: lockersData, isLoading, error, refetch } = useQuery<LockerHardware[]>({
    queryKey: ["/api/lockers/hardware"],
    refetchInterval: 30000,
  });

  const reserveMutation = useMutation({
    mutationFn: async ({ lockerNumber, sessionId, customerId }: { lockerNumber: number; sessionId: string; customerId?: string }) => {
      const res = await apiRequest("POST", `/api/lockers/${lockerNumber}/reserve`, { sessionId, customerId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lockers/hardware"] });
    },
  });

  const confirmKeyRemovedMutation = useMutation({
    mutationFn: async ({ lockerNumber }: { lockerNumber: number }) => {
      const res = await apiRequest("POST", `/api/lockers/${lockerNumber}/confirm-key-removed`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lockers/hardware"] });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({ lockerNumber, force }: { lockerNumber: number; force?: boolean }) => {
      const res = await apiRequest("POST", `/api/lockers/${lockerNumber}/checkout`, { force });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lockers/hardware"] });
    },
  });

  const sendCommand = useCallback((lockerNumber: number, commandType: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "command",
        lockerNumber,
        commandType,
      }));
    }
  }, []);

  return {
    lockers: lockersData || [],
    isLoading,
    error,
    wsConnected,
    refetch,
    reserveLocker: reserveMutation.mutateAsync,
    confirmKeyRemoved: confirmKeyRemovedMutation.mutateAsync,
    checkoutLocker: checkoutMutation.mutateAsync,
    sendCommand,
    isReserving: reserveMutation.isPending,
    isConfirming: confirmKeyRemovedMutation.isPending,
    isCheckingOut: checkoutMutation.isPending,
  };
}

export function useHardwareDevices() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{ devices: any[]; success: boolean }>({
    queryKey: ["/api/devices"],
  });

  const registerDeviceMutation = useMutation({
    mutationFn: async (device: { deviceId: string; name: string; ipAddress?: string; sharedSecret: string }) => {
      const res = await apiRequest("POST", "/api/devices", device);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
    },
  });

  const updateDeviceMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; ipAddress?: string; sharedSecret?: string }) => {
      const res = await apiRequest("PATCH", `/api/devices/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
    },
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/devices/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
    },
  });

  return {
    devices: data?.devices || [],
    isLoading,
    error,
    registerDevice: registerDeviceMutation.mutateAsync,
    updateDevice: updateDeviceMutation.mutateAsync,
    deleteDevice: deleteDeviceMutation.mutateAsync,
    isRegistering: registerDeviceMutation.isPending,
    isUpdating: updateDeviceMutation.isPending,
    isDeleting: deleteDeviceMutation.isPending,
  };
}
