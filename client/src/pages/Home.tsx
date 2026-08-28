import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import LockerButton from "@/components/LockerButton";
import LockerOptionsDialog from "@/components/LockerOptionsDialog";
import TodayStatusTable from "@/components/TodayStatusTable";
import SalesSummary from "@/components/SalesSummary";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useToast } from "@/hooks/use-toast";
import { usePaydayAlert } from "@/hooks/usePaydayAlert";
import { Menu, X, Maximize2, ChevronDown, ChevronUp, LayoutGrid, Columns, Receipt, Plus, Move, PanelRight, PanelRightClose, PanelLeft, Users } from "lucide-react";
import { ResizeEdgeGrip, DockResizeGrip } from "@/components/ResizeEdgeGrip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PatternLockDialog from "@/components/PatternLockDialog";
import { getBusinessDay, getBusinessDayRange, getPreviousBusinessDay, getBasePrice, calculateAdditionalFee, getSettlementCycleOptions, getStagedHourlyOptions, getNightstartOptions, getForeignerPrice, isKoreanHoliday, countExtendedGuestLockers } from "@shared/businessDay";
import type { DomesticAdditionalFeeMode, ExtendedGuestFeeConfig, ExtendedGuestEntry } from "@shared/businessDay";
import * as localDb from "@/lib/localDb";
import { combinePayments } from "@/lib/utils";
import { isTodayStatusLocked, isSalesTabLocked } from "@/lib/menuLock";
import type { LockerLog as SharedLockerLog } from "@shared/schema";
import { LiveClock } from "@/components/LiveClock";

// Extend shared LockerLog with UI-specific fields
interface LockerLog extends Omit<SharedLockerLog, 'entryTime' | 'exitTime' | 'createdAt' | 'updatedAt' | 'notes' | 'paymentMethod' | 'optionAmount'> {
  entryTime: string;
  exitTime: string | null;
  notes?: string;
  paymentMethod?: 'card' | 'cash' | 'transfer';
  optionAmount?: number;
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
}

interface DailySummary {
  businessDay: string;
  totalVisitors: number;
  totalSales: number;
  cancellations: number;
  totalDiscount: number;
  foreignerCount: number;
  foreignerSales: number;
  dayVisitors: number;
  nightVisitors: number;
  totalRefunds: number;
}

interface LockerGroup {
  id: string;
  name: string;
  startNumber: number;
  endNumber: number;
  sortOrder: number;
}

interface OpenDialog {
  lockerNumber: number;
  isMinimized: boolean;
  timeType: '주간' | '야간';
  basePrice: number;
  newLockerInfo?: { lockerNumber: number, timeType: '주간' | '야간', basePrice: number } | null;
}

/** 락카 옵션창 스택에 추가/포커스. 설정이 접기 기본이면 이전 창은 접고 최신만 펼침 */
function upsertLockerDialog(
  prev: Map<number, OpenDialog>,
  dialog: Omit<OpenDialog, 'isMinimized'>
): Map<number, OpenDialog> {
  const defaultCollapsed = localDb.getSettings().lockerStackDefaultCollapsed === true;
  const next = new Map(prev);
  if (defaultCollapsed) {
    for (const [num, info] of Array.from(next.entries())) {
      if (num !== dialog.lockerNumber) {
        next.set(num, { ...info, isMinimized: true });
      }
    }
  }
  next.set(dialog.lockerNumber, { ...dialog, isMinimized: false });
  return next;
}

// 금·토·일 및 한국 공휴일 판정 (공휴일 판정 자체는 shared/businessDay.ts의 isKoreanHoliday로 이동)
function isWeekendOrHoliday(date: Date): boolean {
  const day = date.getDay(); // 0=일, 5=금, 6=토
  if (day === 0 || day === 5 || day === 6) return true;
  return isKoreanHoliday(date);
}

type StatusRawEntry = LockerLog & { additionalFeeOnly?: boolean; hasSameDayFee?: boolean };

function loadStatusEntriesForBusinessDay(
  businessDay: string,
  businessDayStartHour: number
): StatusRawEntry[] {
  const allEntriesFromDb = localDb.getEntriesByEntryTime(businessDay, businessDayStartHour);
  const additionalFeeEvents = localDb.getAdditionalFeeEventsByBusinessDayRange(businessDay, businessDayStartHour);

  const crossDayAdditionalFeeLogIds = new Set(
    additionalFeeEvents
      .filter(e => {
        const event = e as any;
        return event.entryBusinessDay && event.entryBusinessDay !== e.businessDay;
      })
      .map(e => e.lockerLogId)
  );
  const entries = allEntriesFromDb.filter(entry => !crossDayAdditionalFeeLogIds.has(entry.id));

  const sameDayAdditionalFeeLogIds = new Set(
    additionalFeeEvents
      .filter(e => {
        const event = e as any;
        return event.entryBusinessDay && event.entryBusinessDay === e.businessDay;
      })
      .map(e => e.lockerLogId)
  );

  const additionalFeeEntries: StatusRawEntry[] = additionalFeeEvents
    .filter(event => {
      const e = event as any;
      return e.entryBusinessDay && e.entryBusinessDay !== event.businessDay;
    })
    .map(event => ({
      id: event.lockerLogId,
      lockerNumber: event.lockerNumber,
      entryTime: null as unknown as string,
      exitTime: event.checkoutTime,
      timeType: '추가요금' as any,
      basePrice: 0,
      optionType: 'none' as const,
      optionAmount: 0,
      finalPrice: event.feeAmount,
      status: 'checked_out' as const,
      cancelled: false,
      paymentMethod: event.paymentMethod as any,
      paymentCash: (event as any).paymentCash,
      paymentCard: (event as any).paymentCard,
      paymentTransfer: (event as any).paymentTransfer,
      businessDay: event.businessDay,
      parentLocker: null,
      additionalFeeOnly: true,
    }));

  const entriesWithFeeFlag = entries.map(entry => ({
    ...entry,
    hasSameDayFee: sameDayAdditionalFeeLogIds.has(entry.id),
  }));

  return [...entriesWithFeeFlag, ...additionalFeeEntries].sort((a, b) => {
    const timeA = a.exitTime || a.entryTime || '';
    const timeB = b.exitTime || b.entryTime || '';
    return new Date(timeB).getTime() - new Date(timeA).getTime();
  });
}

function mapToStatusTableEntries(logs: StatusRawEntry[]) {
  return logs.map(log => ({
    id: log.id,
    lockerNumber: log.lockerNumber,
    entryTime: log.entryTime ? new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : null,
    entryTimeRaw: log.entryTime || null,
    exitTime: log.exitTime || null,
    timeType: log.timeType,
    basePrice: log.basePrice,
    option: log.optionType === 'none' ? '없음' :
            log.optionType === 'discount' ? '할인' :
            log.optionType === 'custom' ? `할인직접` :
            log.optionType === 'direct_price' ? '요금직접' :
            (log.optionType as string) === 'free' ? ((log as any).isStaff ? '직원' : '무료입장') :
            '외국인',
    optionType: log.optionType as 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' | 'free',
    finalPrice: log.finalPrice,
    status: log.status,
    cancelled: log.cancelled,
    notes: log.notes,
    paymentMethod: log.paymentMethod,
    paymentCash: log.paymentCash,
    paymentCard: log.paymentCard,
    paymentTransfer: log.paymentTransfer,
    additionalFeeOnly: log.additionalFeeOnly,
    hasSameDayFee: (log as any).hasSameDayFee || false,
    parentLocker: log.parentLocker || null,
    deferredPayment: (log as any).deferredPayment || false,
    refundAmount: (log as any).refundAmount || 0,
    isStaff: (log as any).isStaff || false,
    customerMemo: (log as any).customerMemo || '',
  }));
}

type WorkspaceResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'dock';

function getViewportSize() {
  const vv = window.visualViewport;
  return {
    width: Math.round(vv?.width ?? window.innerWidth),
    height: Math.round(vv?.height ?? window.innerHeight),
  };
}

const WORKSPACE_MODAL_SELECTOR = [
  '[data-radix-alert-dialog-content]',
  '[data-radix-alert-dialog-overlay]',
  '[data-radix-dialog-content]',
  '[data-radix-dialog-overlay]',
  '[role="alertdialog"]',
].join(',');

function isWorkspaceRelatedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-workspace-root]')) return true;
  if (target.closest('[data-workspace-resize]')) return true;
  if (target.closest('[data-radix-popper-content-wrapper]')) return true;
  if (target.closest('[data-radix-select-content]')) return true;
  if (target.closest('[data-radix-select-viewport]')) return true;
  if (target.closest('[data-radix-dropdown-menu-content]')) return true;
  if (target.closest('[data-radix-popover-content]')) return true;
  if (target.closest('[data-radix-dialog-content]')) return true;
  if (target.closest('[data-radix-dialog-overlay]')) return true;
  if (target.closest('[data-radix-alert-dialog-content]')) return true;
  if (target.closest('[data-radix-alert-dialog-overlay]')) return true;
  if (target.closest('[role="alertdialog"]')) return true;
  if (target.closest('[data-sonner-toast]')) return true;
  return false;
}

function eventTouchesWorkspaceRelated(e: Event): boolean {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
  for (const node of path) {
    if (isWorkspaceRelatedTarget(node)) return true;
  }
  return isWorkspaceRelatedTarget(e.target);
}

function isWorkspaceModalOpen(): boolean {
  return !!document.querySelector(WORKSPACE_MODAL_SELECTOR);
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const paydayAlert = usePaydayAlert();
  useEffect(() => {
    if (!paydayAlert.alerting) return;
    toast({
      title: "주급 지급 시간이 다가옵니다",
      description: `${paydayAlert.staffName}님 주급 지급(${paydayAlert.time}) 30분 전입니다. 직원근무 > 근무다이어리에서 확인해주세요.`,
    });
  }, [paydayAlert.alerting, paydayAlert.staffId]);
  const [openDialogs, setOpenDialogs] = useState<Map<number, OpenDialog>>(new Map());
  const [childLockerAlertOpen, setChildLockerAlertOpen] = useState(false);
  const [childLockerParent, setChildLockerParent] = useState<number | null>(null);
  const [childLockerCurrentNumber, setChildLockerCurrentNumber] = useState<number | null>(null);
  const [settlementReminderOpen, setSettlementReminderOpen] = useState(false);
  const currentTimeRef = useRef(new Date());
  // 30초마다 락카 상태 재계산용 (외출초과, 추가요금 등) — 매초 재렌더 방지
  const [lockerTickTime, setLockerTickTime] = useState(new Date());
  const [activeLockers, setActiveLockers] = useState<LockerLog[]>([]);
  const [todayAllEntries, setTodayAllEntries] = useState<(LockerLog & { additionalFeeOnly?: boolean })[]>([]);
  const [yesterdayAllEntries, setYesterdayAllEntries] = useState<(LockerLog & { additionalFeeOnly?: boolean })[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [lockerGroups, setLockerGroups] = useState<LockerGroup[]>([]);
  const [newLockerInfo, setNewLockerInfo] = useState<{lockerNumber: number, timeType: '주간' | '야간', basePrice: number} | null>(null);
  const [additionalFeeSales, setAdditionalFeeSales] = useState<number>(0);
  const [rentalRevenue, setRentalRevenue] = useState<number>(0);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  
  // Panel collapse state — localStorage로 새로고침 후에도 상태 복원
  // isPanelCollapsed: 오늘현황이 잠겨 있으면 새로고침 시 항상 true(입실관리 전체화면)로 강제
  const [isPanelCollapsed, setIsPanelCollapsed] = useState<boolean>(() => {
    if (isTodayStatusLocked()) return true; // 보안 잠금 시 항상 오늘현황 숨김
    const saved = localStorage.getItem('home_panel_collapsed');
    return saved !== null ? saved === 'true' : true; // 기본값: 입실관리 전체화면
  });
  const [isLockerPanelCollapsed, setIsLockerPanelCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('home_locker_panel_collapsed');
    return saved === 'true';
  });
  const [isSalesSummaryCollapsed, setIsSalesSummaryCollapsed] = useState(true);
  const [showPatternDialog, setShowPatternDialog] = useState(false);
  const [overviewMode, setOverviewMode] = useState(false); // H key: overview mode
  const [barcodeTestDialogOpen, setBarcodeTestDialogOpen] = useState(false);
  const [testBarcodeInput, setTestBarcodeInput] = useState("");

  // Quick expense input state
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseItem, setExpenseItem] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');

  // Barcode test button visibility (hidden by default, toggle with 5 clicks on title)
  const [showBarcodeTest, setShowBarcodeTest] = useState(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

  // NFC scan state
  const [isNfcScanning, setIsNfcScanning] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(false);
  const ndefReaderRef = useRef<any>(null);
  const ndefHandlerRef = useRef<any>(null);
  const ndefErrorHandlerRef = useRef<any>(null);

  // Ref to store latest activeLockers for barcode scanner
  const activeLockersRef = useRef<LockerLog[]>([]);
  
  // Ref to track dialog state for NFC scanning
  const dialogOpenRef = useRef(false);
  
  // Ref to track openDialogs state for stale closure prevention
  const openDialogsRef = useRef<Map<number, OpenDialog>>(new Map());

  // Popup workspace visibility toggle
  const [popupsVisible, setPopupsVisible] = useState(true);
  
  // 사용불가 락카 목록 (localStorage)
  const [disabledLockers, setDisabledLockers] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('out_of_service_lockers');
      return saved ? new Set<number>(JSON.parse(saved)) : new Set<number>();
    } catch {
      return new Set<number>();
    }
  });

  // Floating mode for workspace panel
  const [isFloatingMode, setIsFloatingMode] = useState(() => {
    const saved = localStorage.getItem('workspaceFloatingMode');
    return saved === 'true';
  });
  const [floatingPosition, setFloatingPosition] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('workspaceFloatingPosition');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { x: 100, y: 100 };
      }
    }
    return { x: 100, y: 100 };
  });
  const [floatingSize, setFloatingSize] = useState<{ width: number; height: number }>(() => {
    const saved = localStorage.getItem('workspaceFloatingSize');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { width: 450, height: 600 };
      }
    }
    return { width: 450, height: 600 };
  });
  const [dockedWidth, setDockedWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem('workspaceDockedWidth') || '', 10);
    const maxW = typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.55) : 640;
    if (Number.isFinite(saved) && saved >= 280) return Math.min(saved, maxW);
    return Math.min(520, maxW);
  });
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const isResizingRef = useRef(false);
  const resizeEdgeRef = useRef<'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'dock' | null>(null);
  const resizeStartRef = useRef({ mouseX: 0, mouseY: 0, width: 0, height: 0, x: 0, y: 0 });
  const floatingPositionRef = useRef(floatingPosition);
  const floatingSizeRef = useRef(floatingSize);
  const dockedWidthRef = useRef(dockedWidth);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const ignoreWorkspaceDismissUntilRef = useRef(0);
  
  // UI Layout Mode: 'toggle' (기존 토글 방식) or 'tab' (탭 전환 방식)
  const [uiLayoutMode, setUiLayoutMode] = useState<'toggle' | 'tab'>(() => {
    const saved = localStorage.getItem('uiLayoutMode');
    return (saved === 'tab' || saved === 'toggle') ? saved : 'toggle';
  });
  const [activeTab, setActiveTab] = useState<'locker' | 'status' | 'sales'>('locker');
  
  // Tab security: require authentication when switching to 'status' or 'sales' tab
  const [showTabAuthDialog, setShowTabAuthDialog] = useState(false);
  const [showSalesTabAuthDialog, setShowSalesTabAuthDialog] = useState(false);
  
  // Layout mode change security: require authentication when switching modes
  const [showLayoutModeAuthDialog, setShowLayoutModeAuthDialog] = useState(false);
  const [pendingLayoutMode, setPendingLayoutMode] = useState<'toggle' | 'tab' | null>(null);

  // Load settings from localStorage
  const settings = localDb.getSettings();
  const businessDayStartHour = settings.businessDayStartHour;
  const dayPrice = settings.dayPrice;
  const nightPrice = settings.nightPrice;
  const discountAmount = settings.discountAmount;
  const foreignerPrice = settings.foreignerPrice;
  const resolveForeignerPrice = (timeType: '주간' | '야간') =>
    getForeignerPrice(timeType, settings as any);
  const domesticCheckpointHour = settings.domesticCheckpointHour;
  const foreignerAdditionalFeePeriod = settings.foreignerAdditionalFeePeriod;
  const domesticAdditionalFeeMode: DomesticAdditionalFeeMode =
    (settings as any).domesticAdditionalFeeMode === 'pending4'
      ? 'stagedHourly'
      : ((settings as any).domesticAdditionalFeeMode || 'nextday');
  const nightStartHour = parseInt(((settings as any).nightStartTime || '19:00').split(':')[0], 10);
  const settlementCycleOpts = getSettlementCycleOptions(settings as any);
  const stagedHourlyOpts = getStagedHourlyOptions(settings as any);
  const nightstartOpts = getNightstartOptions(settings as any);
  const outingTimeLimitMinutes: number = (settings as any).outingTimeLimitMinutes || 0;
  const outingTimeLimitWeekendMinutes: number = (settings as any).outingTimeLimitWeekendMinutes || 0;
  
  // Toggle left panel (Today Status + Sales Summary) visibility
  const handleTogglePanel = () => {
    if (isPanelCollapsed) {
      if (isTodayStatusLocked()) {
        setShowPatternDialog(true);
      } else {
        setIsPanelCollapsed(false);
        localStorage.setItem('home_panel_collapsed', 'false');
      }
    } else {
      setIsPanelCollapsed(true);
      localStorage.setItem('home_panel_collapsed', 'true');
    }
  };

  // UI Layout Mode 변경 핸들러
  const handleLayoutModeChange = (mode: 'toggle' | 'tab') => {
    if (mode === uiLayoutMode) return;

    if (isTodayStatusLocked()) {
      setPendingLayoutMode(mode);
      setShowLayoutModeAuthDialog(true);
      return;
    }

    applyLayoutModeChange(mode);
  };
  
  // 실제 레이아웃 모드 변경 적용
  const applyLayoutModeChange = (mode: 'toggle' | 'tab') => {
    setUiLayoutMode(mode);
    localStorage.setItem('uiLayoutMode', mode);
    
    if (mode === 'tab') {
      setActiveTab('locker');
      setIsPanelCollapsed(false);
      localStorage.setItem('home_panel_collapsed', 'false');
      setIsLockerPanelCollapsed(false);
      localStorage.setItem('home_locker_panel_collapsed', 'false');
    } else {
      setIsPanelCollapsed(true);
      localStorage.setItem('home_panel_collapsed', 'true');
      setIsLockerPanelCollapsed(false);
      localStorage.setItem('home_locker_panel_collapsed', 'false');
      setIsSalesSummaryCollapsed(true);
    }
  };
  
  // Layout mode 변경 인증 성공 핸들러
  const handleLayoutModeAuthSuccess = () => {
    setShowLayoutModeAuthDialog(false);
    if (pendingLayoutMode) {
      applyLayoutModeChange(pendingLayoutMode);
      setPendingLayoutMode(null);
    }
  };

  // 도킹 위치 (좌/우)
  const [dockedSide, setDockedSide] = useState<'left' | 'right'>(() => {
    return (localStorage.getItem('workspaceDockedSide') as 'left' | 'right') || 'right';
  });
  const dockedSideRef = useRef(dockedSide);

  useEffect(() => { floatingPositionRef.current = floatingPosition; }, [floatingPosition]);
  useEffect(() => { floatingSizeRef.current = floatingSize; }, [floatingSize]);
  useEffect(() => { dockedWidthRef.current = dockedWidth; }, [dockedWidth]);
  useEffect(() => { dockedSideRef.current = dockedSide; }, [dockedSide]);

  const WORKSPACE_MIN_W = 320;
  const WORKSPACE_MIN_H = 280;
  const WORKSPACE_MIN_DOCK_W = 280;

  const persistWorkspaceLayout = useCallback(() => {
    localStorage.setItem('workspaceFloatingPosition', JSON.stringify(floatingPositionRef.current));
    localStorage.setItem('workspaceFloatingSize', JSON.stringify(floatingSizeRef.current));
    localStorage.setItem('workspaceDockedWidth', String(dockedWidthRef.current));
  }, []);

  const applyResizeMove = useCallback((clientX: number, clientY: number) => {
    const edge = resizeEdgeRef.current;
    if (!edge) return;
    const start = resizeStartRef.current;
    const dx = clientX - start.mouseX;
    const dy = clientY - start.mouseY;
    const { width: maxW, height: maxH } = getViewportSize();

    if (edge === 'dock') {
      const side = dockedSideRef.current;
      const next = side === 'right' ? start.width - dx : start.width + dx;
      const maxDock = Math.max(WORKSPACE_MIN_DOCK_W, maxW - 72);
      const clamped = Math.max(WORKSPACE_MIN_DOCK_W, Math.min(maxDock, next));
      setDockedWidth(clamped);
      return;
    }

    let width = start.width;
    let height = start.height;
    let x = start.x;
    let y = start.y;

    if (edge.includes('e')) width = start.width + dx;
    if (edge.includes('w')) {
      width = start.width - dx;
      x = start.x + dx;
    }
    if (edge.includes('s')) height = start.height + dy;
    if (edge.includes('n')) {
      height = start.height - dy;
      y = start.y + dy;
    }

    width = Math.max(WORKSPACE_MIN_W, Math.min(maxW, width));
    height = Math.max(WORKSPACE_MIN_H, Math.min(maxH, height));

    if (edge.includes('w')) x = start.x + start.width - width;
    if (edge.includes('n')) y = start.y + start.height - height;

    x = Math.max(0, Math.min(maxW - width, x));
    y = Math.max(0, Math.min(maxH - height, y));

    setFloatingSize({ width, height });
    setFloatingPosition({ x, y });
  }, []);

  const handleResizeStart = useCallback((
    edge: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'dock',
    clientX: number,
    clientY: number
  ) => {
    isResizingRef.current = true;
    isDraggingRef.current = false;
    resizeEdgeRef.current = edge;
    const size = floatingSizeRef.current;
    const pos = floatingPositionRef.current;
    resizeStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      width: edge === 'dock' ? dockedWidthRef.current : size.width,
      height: size.height,
      x: pos.x,
      y: pos.y,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor =
      edge === 'dock' ? 'ew-resize'
      : edge === 'n' || edge === 's' ? 'ns-resize'
      : edge === 'e' || edge === 'w' ? 'ew-resize'
      : edge === 'ne' || edge === 'sw' ? 'nesw-resize'
      : 'nwse-resize';
  }, []);

  const handleResizePointerDown = useCallback((
    edge: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'dock',
    e: React.MouseEvent | React.TouchEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if ('touches' in e) {
      if (e.touches.length !== 1) return;
      handleResizeStart(edge, e.touches[0].clientX, e.touches[0].clientY);
    } else {
      handleResizeStart(edge, e.clientX, e.clientY);
    }
  }, [handleResizeStart]);

  const toggleDockedSide = useCallback(() => {
    setDockedSide(prev => {
      const next = prev === 'right' ? 'left' : 'right';
      localStorage.setItem('workspaceDockedSide', next);
      return next;
    });
  }, []);

  // 플로팅 모드 토글
  const toggleFloatingMode = useCallback(() => {
    setIsFloatingMode(prev => {
      const newValue = !prev;
      localStorage.setItem('workspaceFloatingMode', String(newValue));
      return newValue;
    });
  }, []);

  // 플로팅 창 드래그 시작 (마우스)
  const handleFloatingDragStart = useCallback((e: React.MouseEvent) => {
    if (isResizingRef.current) return;
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - floatingPositionRef.current.x,
      y: e.clientY - floatingPositionRef.current.y
    };
    e.preventDefault();
  }, []);

  // 플로팅 창 드래그 시작 (터치)
  const handleFloatingTouchStart = useCallback((e: React.TouchEvent) => {
    if (isResizingRef.current) return;
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      const touch = e.touches[0];
      dragOffsetRef.current = {
        x: touch.clientX - floatingPositionRef.current.x,
        y: touch.clientY - floatingPositionRef.current.y
      };
    }
  }, []);

  // 플로팅 창 드래그 중 (마우스)
  const handleFloatingDragMove = useCallback((e: MouseEvent) => {
    if (isResizingRef.current) {
      applyResizeMove(e.clientX, e.clientY);
      return;
    }
    if (!isDraggingRef.current) return;
    
    const size = floatingSizeRef.current;
    const { width: maxW, height: maxH } = getViewportSize();
    const newX = Math.max(0, Math.min(maxW - size.width, e.clientX - dragOffsetRef.current.x));
    const newY = Math.max(0, Math.min(maxH - size.height, e.clientY - dragOffsetRef.current.y));
    
    setFloatingPosition({ x: newX, y: newY });
  }, [applyResizeMove]);

  // 플로팅 창 드래그 중 (터치)
  const handleFloatingTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (isResizingRef.current) {
      applyResizeMove(touch.clientX, touch.clientY);
      e.preventDefault();
      return;
    }
    if (!isDraggingRef.current) return;
    
    const size = floatingSizeRef.current;
    const { width: maxW, height: maxH } = getViewportSize();
    const newX = Math.max(0, Math.min(maxW - size.width, touch.clientX - dragOffsetRef.current.x));
    const newY = Math.max(0, Math.min(maxH - size.height, touch.clientY - dragOffsetRef.current.y));
    
    setFloatingPosition({ x: newX, y: newY });
    e.preventDefault(); // 스크롤 방지
  }, [applyResizeMove]);

  // 플로팅 창 드래그/리사이즈 종료
  const handleFloatingDragEnd = useCallback(() => {
    const wasBusy = isDraggingRef.current || isResizingRef.current;
    isDraggingRef.current = false;
    isResizingRef.current = false;
    resizeEdgeRef.current = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    if (wasBusy) persistWorkspaceLayout();
  }, [persistWorkspaceLayout]);

  // 플로팅 창 드래그/리사이즈 이벤트 리스너 (마우스 + 터치)
  useEffect(() => {
    window.addEventListener('mousemove', handleFloatingDragMove);
    window.addEventListener('mouseup', handleFloatingDragEnd);
    window.addEventListener('touchmove', handleFloatingTouchMove, { passive: false });
    window.addEventListener('touchend', handleFloatingDragEnd);
    window.addEventListener('touchcancel', handleFloatingDragEnd);
    return () => {
      window.removeEventListener('mousemove', handleFloatingDragMove);
      window.removeEventListener('mouseup', handleFloatingDragEnd);
      window.removeEventListener('touchmove', handleFloatingTouchMove);
      window.removeEventListener('touchend', handleFloatingDragEnd);
      window.removeEventListener('touchcancel', handleFloatingDragEnd);
    };
  }, [handleFloatingDragMove, handleFloatingTouchMove, handleFloatingDragEnd]);

  useEffect(() => {
    const clampLayout = () => {
      // 레이아웃(layout) 뷰포트만 사용 — visualViewport는 안드로이드에서 화면 키보드가
      // 뜨면 그만큼 줄어드는데, 이걸 기준으로 삼으면 키보드 뜰 때마다 창이 영구적으로
      // 작아져서 저장돼버린다(키보드 내려가도 원래 크기로 안 돌아옴). window.innerWidth/Height는
      // 키보드 유무와 무관하게 유지되므로 회전 등 실제 창 크기 변화에만 반응한다.
      const width = Math.round(window.innerWidth);
      const height = Math.round(window.innerHeight);
      const maxDock = Math.max(WORKSPACE_MIN_DOCK_W, width - 72);
      setDockedWidth((w) => {
        const next = Math.min(Math.max(w, WORKSPACE_MIN_DOCK_W), maxDock);
        dockedWidthRef.current = next;
        return next;
      });
      setFloatingSize((s) => {
        const next = {
          width: Math.min(Math.max(s.width, WORKSPACE_MIN_W), width),
          height: Math.min(Math.max(s.height, WORKSPACE_MIN_H), height),
        };
        floatingSizeRef.current = next;
        return next;
      });
      setFloatingPosition((p) => {
        const size = floatingSizeRef.current;
        const next = {
          x: Math.max(0, Math.min(width - size.width, p.x)),
          y: Math.max(0, Math.min(height - size.height, p.y)),
        };
        floatingPositionRef.current = next;
        return next;
      });
    };
    window.addEventListener('resize', clampLayout);
    clampLayout();
    return () => {
      window.removeEventListener('resize', clampLayout);
    };
  }, []);

  useEffect(() => {
    if (openDialogs.size === 0 || !popupsVisible) return;
    const onPointerDown = (e: PointerEvent) => {
      if (isResizingRef.current || isDraggingRef.current) return;
      if (Date.now() < ignoreWorkspaceDismissUntilRef.current) return;
      // 추가요금/대여 알림 등 모달이 떠 있으면 작업공간을 숨기지 않음.
      // 닫기 직후 같은 탭이 뒤로 통과해도 숨기지 않도록 잠깐 무시한다.
      if (isWorkspaceModalOpen()) {
        ignoreWorkspaceDismissUntilRef.current = Date.now() + 500;
        return;
      }
      if (eventTouchesWorkspaceRelated(e)) return;
      setPopupsVisible(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [openDialogs.size, popupsVisible]);

  // Tab change handler with security check
  const handleTabChange = (newTab: string) => {
    const targetTab = newTab as 'locker' | 'status' | 'sales';

    if (activeTab !== targetTab) {
      if (targetTab === 'status' && isTodayStatusLocked()) {
        setShowTabAuthDialog(true);
        return;
      }
      if (targetTab === 'sales' && isSalesTabLocked()) {
        setShowSalesTabAuthDialog(true);
        return;
      }
    }
    setActiveTab(targetTab);
  };

  // Handle successful tab authentication (오늘현황)
  const handleTabAuthSuccess = () => {
    setActiveTab('status');
    setShowTabAuthDialog(false);
  };

  // Handle successful tab authentication (매출집계)
  const handleSalesTabAuthSuccess = () => {
    setActiveTab('sales');
    setShowSalesTabAuthDialog(false);
  };

  // Toggle barcode test button with 5 consecutive clicks on title
  const handleTitleClick = () => {
    clickCountRef.current += 1;

    // Clear existing timer
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    // Reset count after 2 seconds of inactivity
    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
    }, 2000);

    // Toggle on 5th click
    if (clickCountRef.current >= 5) {
      setShowBarcodeTest(prev => !prev);
      clickCountRef.current = 0;
      toast({
        title: showBarcodeTest ? "바코드 테스트 숨김" : "바코드 테스트 표시",
        description: showBarcodeTest ? "바코드 테스트 버튼이 숨겨졌습니다." : "바코드 테스트 버튼이 표시되었습니다.",
      });
    }
  };

  // Quick expense add handler
  const handleAddQuickExpense = () => {
    if (!expenseItem.trim()) {
      toast({
        variant: "destructive",
        title: "입력 오류",
        description: "지출항목을 입력해주세요.",
      });
      return;
    }

    if (!expenseAmount || Number(expenseAmount) <= 0) {
      toast({
        variant: "destructive",
        title: "입력 오류",
        description: "올바른 금액을 입력해주세요.",
      });
      return;
    }

    const settings = localDb.getSettings();
    const now = new Date();
    const businessDay = getBusinessDay(now, settings.businessDayStartHour);
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5);
    const amount = Number(expenseAmount);
    
    localDb.createExpense({
      date: dateStr,
      time: timeStr,
      category: expenseItem.trim(),
      amount: amount,
      quantity: 1,
      paymentMethod: expensePaymentMethod,
      paymentCash: expensePaymentMethod === 'cash' ? amount : undefined,
      paymentCard: expensePaymentMethod === 'card' ? amount : undefined,
      paymentTransfer: expensePaymentMethod === 'transfer' ? amount : undefined,
      businessDay,
    });

    toast({
      title: "지출 등록 완료",
      description: `${expenseItem} ${amount.toLocaleString()}원이 등록되었습니다.`,
    });

    setExpenseDialogOpen(false);
    setExpenseItem('');
    setExpenseAmount('');
    setExpensePaymentMethod('cash');
    
    loadData();
  };
  
  // Toggle right panel (Locker Management) visibility
  const handleToggleLockerPanel = () => {
    const next = !isLockerPanelCollapsed;
    setIsLockerPanelCollapsed(next);
    localStorage.setItem('home_locker_panel_collapsed', next ? 'true' : 'false');
  };
  
  // Pattern verified, expand left panel
  const handlePatternCorrect = () => {
    setIsPanelCollapsed(false);
    localStorage.setItem('home_panel_collapsed', 'false');
  };

  // Update current time every second
  useEffect(() => {
    // 매초 ref만 갱신 (re-render 없음) — 클릭 핸들러용
    const timer = setInterval(() => {
      currentTimeRef.current = new Date();
    }, 1000);
    // 30초마다 락카 계산 state 갱신 (외출초과·추가요금 표시)
    const slowTick = setInterval(() => setLockerTickTime(new Date()), 30000);
    return () => { clearInterval(timer); clearInterval(slowTick); };
  }, []);

  // Check NFC support
  useEffect(() => {
    if ('NDEFReader' in window) {
      setNfcSupported(true);
    }
  }, []);

  // Update dialogOpenRef when openDialogs changes
  useEffect(() => {
    dialogOpenRef.current = openDialogs.size > 0 || childLockerAlertOpen || settlementReminderOpen || showPatternDialog || barcodeTestDialogOpen;
  }, [openDialogs, childLockerAlertOpen, settlementReminderOpen, showPatternDialog, barcodeTestDialogOpen]);

  // Process scanned barcode (shared logic for both hardware scanner and manual test)
  const processScannedBarcode = useCallback((barcode: string, lockerParentsMap: { [key: number]: number | null }, currentActiveLockers: LockerLog[]) => {
    // Look up locker number by barcode
    const lockerNumber = localDb.getLockerNumberByBarcode(barcode);
    
    if (!lockerNumber) {
      toast({
        title: "바코드 미등록",
        description: "등록되지 않은 바코드입니다.",
        variant: "destructive",
      });
      return false;
    }
    
    // Log the scan (for anti-fraud tracking)
    try {
      localDb.addScanLog(lockerNumber);
    } catch (error) {
      console.error('Failed to log scan:', error);
    }
    
    // Check if locker is currently in use
    const isInUse = currentActiveLockers.some(log => log.lockerNumber === lockerNumber);
    
    if (!isInUse) {
      // Empty locker: add to openDialogs for multi-popup display
      const timeType = localDb.getTimeTypeWithSettings(new Date());
      const basePrice = getBasePrice(timeType, dayPrice, nightPrice);
      
      setOpenDialogs(prev => upsertLockerDialog(prev, {
        lockerNumber,
        timeType,
        basePrice,
        newLockerInfo: { lockerNumber, timeType, basePrice }
      }));
      
      // Show popup workspace when barcode scanned
      setPopupsVisible(true);
      
      toast({
        title: "락카 선택",
        description: `${lockerNumber}번 락카가 선택되었습니다.`,
      });
    } else {
      // Locker in use: check if this is a child locker
      const parentLockerNumber = lockerParentsMap[lockerNumber];
      if (parentLockerNumber) {
        // Child locker: show alert only
        setChildLockerParent(parentLockerNumber);
        setChildLockerCurrentNumber(lockerNumber);
        setChildLockerAlertOpen(true);
      } else {
        // Parent or independent locker: add to openDialogs
        setOpenDialogs(prev => upsertLockerDialog(prev, {
          lockerNumber,
          timeType: currentActiveLockers.find(l => l.lockerNumber === lockerNumber)?.timeType || '주간',
          basePrice: currentActiveLockers.find(l => l.lockerNumber === lockerNumber)?.basePrice || 0
        }));
        
        // Show popup workspace when barcode scanned
        setPopupsVisible(true);
        
        toast({
          title: "락카 선택",
          description: `${lockerNumber}번 락카가 선택되었습니다.`,
        });
      }
    }
    
    return true;
  }, [toast, dayPrice, nightPrice]);

  // Handle NFC scan toggle
  const handleNfcScan = useCallback(async () => {
    if (!('NDEFReader' in window)) {
      toast({
        title: "NFC 미지원",
        description: "이 브라우저는 Web NFC API를 지원하지 않습니다.",
        variant: "destructive",
      });
      return;
    }

    // If already scanning, stop it
    if (isNfcScanning) {
      setIsNfcScanning(false);
      if (ndefReaderRef.current) {
        if (ndefHandlerRef.current) {
          ndefReaderRef.current.removeEventListener("reading", ndefHandlerRef.current);
        }
        if (ndefErrorHandlerRef.current) {
          ndefReaderRef.current.removeEventListener("readingerror", ndefErrorHandlerRef.current);
        }
      }
      ndefReaderRef.current = null;
      ndefHandlerRef.current = null;
      ndefErrorHandlerRef.current = null;
      toast({
        title: "NFC 감지 중지",
        description: "NFC 자동 감지가 중지되었습니다.",
      });
      return;
    }

    // Start NFC scanning
    try {
      const ndef = new (window as any).NDEFReader();
      ndefReaderRef.current = ndef;
      
      toast({
        title: "NFC 자동 감지 시작",
        description: "락카키를 핸드폰에 가져다 대면 자동으로 인식됩니다.",
      });

      await ndef.scan();

      const handleReading = ({ serialNumber }: any) => {
        // Skip if any dialog is open
        if (dialogOpenRef.current) {
          return;
        }
        
        // Convert serial number to UID format
        const uid = serialNumber.toUpperCase().replace(/:/g, "");
        
        // Look up locker number by RFID UID
        const lockerNumber = localDb.getLockerNumberByRfid(uid);
        
        if (!lockerNumber) {
          toast({
            title: "RFID 미등록",
            description: "등록되지 않은 RFID입니다. 시스템 설정에서 먼저 등록해주세요.",
            variant: "destructive",
          });
          return;
        }
        
        // Log the scan (for anti-fraud tracking)
        try {
          localDb.addScanLog(lockerNumber);
        } catch (error) {
          console.error('Failed to log scan:', error);
        }
        
        // Build current locker parents map
        const currentLockerParents: { [key: number]: number | null } = {};
        activeLockersRef.current.forEach(log => {
          currentLockerParents[log.lockerNumber] = log.parentLocker || null;
        });
        
        // Check if locker is currently in use
        const isInUse = activeLockersRef.current.some(log => log.lockerNumber === lockerNumber);
        
        if (!isInUse) {
          // Empty locker: add to openDialogs for multi-popup display
          // Use current time at the moment of scan, not the time when scanning started
          const scanTime = new Date();
          const timeType = localDb.getTimeTypeWithSettings(scanTime);
          const basePrice = getBasePrice(timeType, dayPrice, nightPrice);
          
          setOpenDialogs(prev => upsertLockerDialog(prev, {
            lockerNumber,
            timeType,
            basePrice,
            newLockerInfo: { lockerNumber, timeType, basePrice }
          }));
          
          // Show popup workspace when NFC scanned
          setPopupsVisible(true);
          
          toast({
            title: "NFC 스캔 완료",
            description: `${lockerNumber}번 락카가 선택되었습니다.`,
          });
        } else {
          // Locker in use: check if this is a child locker
          const parentLockerNumber = currentLockerParents[lockerNumber];
          if (parentLockerNumber) {
            // Child locker: show alert only
            setChildLockerParent(parentLockerNumber);
            setChildLockerCurrentNumber(lockerNumber);
            setChildLockerAlertOpen(true);
          } else {
            // Parent or independent locker: add to openDialogs
            setOpenDialogs(prev => upsertLockerDialog(prev, {
              lockerNumber,
              timeType: activeLockersRef.current.find(l => l.lockerNumber === lockerNumber)?.timeType || '주간',
              basePrice: activeLockersRef.current.find(l => l.lockerNumber === lockerNumber)?.basePrice || 0
            }));
            
            // Show popup workspace when NFC scanned
            setPopupsVisible(true);
            
            toast({
              title: "NFC 스캔 완료",
              description: `${lockerNumber}번 락카가 선택되었습니다.`,
            });
          }
        }
      };

      ndefHandlerRef.current = handleReading;
      ndef.addEventListener("reading", handleReading);

      const handleError = () => {
        toast({
          title: "NFC 읽기 실패",
          description: "NFC 태그를 읽을 수 없습니다. 다시 시도해주세요.",
          variant: "destructive",
        });
      };

      ndefErrorHandlerRef.current = handleError;
      ndef.addEventListener("readingerror", handleError);

      setIsNfcScanning(true);

    } catch (error: any) {
      setIsNfcScanning(false);
      
      if (error.name === 'NotAllowedError') {
        toast({
          title: "NFC 권한 거부",
          description: "NFC 사용 권한이 필요합니다. 브라우저 설정에서 NFC 권한을 허용해주세요.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "NFC 스캔 실패",
          description: `오류: ${error.message || '알 수 없는 오류'}`,
          variant: "destructive",
        });
      }
    }
  }, [isNfcScanning, toast, dayPrice, nightPrice]);

  // Cleanup NFC listener on unmount
  useEffect(() => {
    return () => {
      if (ndefReaderRef.current) {
        if (ndefHandlerRef.current) {
          ndefReaderRef.current.removeEventListener("reading", ndefHandlerRef.current);
        }
        if (ndefErrorHandlerRef.current) {
          ndefReaderRef.current.removeEventListener("readingerror", ndefErrorHandlerRef.current);
        }
      }
    };
  }, []);

  // Global barcode scanner listener
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = 0;
    
    const handleBarcodeScan = (e: KeyboardEvent) => {
      // Allow barcode scanning even when dialogs are open (for multi-popup)
      if (childLockerAlertOpen || settlementReminderOpen || showPatternDialog) {
        return;
      }
      
      // Skip if target is an input element
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }
      
      const now = Date.now();
      
      // Reset buffer if more than 100ms has passed (human typing)
      if (now - lastKeyTime > 100) {
        barcodeBuffer = '';
      }
      
      // Enter key = scan complete
      if (e.key === 'Enter' && barcodeBuffer.length > 0) {
        const barcode = barcodeBuffer;
        barcodeBuffer = '';
        
        // Build current locker parents map
        const currentLockerParents: { [key: number]: number | null } = {};
        activeLockersRef.current.forEach(log => {
          currentLockerParents[log.lockerNumber] = log.parentLocker || null;
        });
        
        processScannedBarcode(barcode, currentLockerParents, activeLockersRef.current);
        
        e.preventDefault();
        return;
      }
      
      // Add character to buffer (only non-special keys)
      if (e.key.length === 1) {
        barcodeBuffer += e.key;
        lastKeyTime = now;
      }
    };
    
    document.addEventListener('keypress', handleBarcodeScan);
    
    return () => {
      document.removeEventListener('keypress', handleBarcodeScan);
    };
  }, [childLockerAlertOpen, settlementReminderOpen, showPatternDialog, processScannedBarcode]);

  // Keyboard shortcut: H key for overview mode
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // H key (shift+H or h) toggles overview mode
      if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Don't trigger if typing in an input field
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        
        setOverviewMode(prev => !prev);
      }
      
      // ESC key closes all minimized dialogs
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        
        setOpenDialogs(new Map());
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Check for settlement reminder
  useEffect(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    
    // Calculate total minutes from midnight for current time and target time
    const currentTotalMinutes = currentHour * 60 + currentMinutes;
    const targetTotalMinutes = businessDayStartHour * 60;
    
    // Check if current time is within 30 minutes of business day start hour
    // Handle wrap-around for midnight cases (e.g., 23:30 to 00:30 when target is 0:00)
    let minutesDiff = currentTotalMinutes - targetTotalMinutes;
    if (minutesDiff > 12 * 60) {
      minutesDiff -= 24 * 60; // Wrap backward (e.g., 23:30 when target is 0:00)
    } else if (minutesDiff < -12 * 60) {
      minutesDiff += 24 * 60; // Wrap forward (e.g., 00:30 when target is 23:00)
    }
    
    const isNearSettlementTime = Math.abs(minutesDiff) <= 30;
    
    if (isNearSettlementTime) {
      // Use local date string to avoid UTC drift
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;
      
      const lastReminder = localStorage.getItem('last_settlement_reminder_date');
      
      if (lastReminder !== today) {
        setSettlementReminderOpen(true);
        localStorage.setItem('last_settlement_reminder_date', today);
      }
    }
  }, [lockerTickTime, businessDayStartHour]);

  // Sync openDialogsRef with openDialogs state
  useEffect(() => {
    openDialogsRef.current = openDialogs;
  }, [openDialogs]);

  // Settings에서 사용불가 락카 변경 시 동기화
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'out_of_service_lockers') {
        try {
          const saved = e.newValue;
          setDisabledLockers(saved ? new Set<number>(JSON.parse(saved)) : new Set<number>());
        } catch {
          setDisabledLockers(new Set<number>());
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Load data on mount and set up refresh interval
  useEffect(() => {
    loadData();
    
    const scheduleLoad = () => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => loadData(), { timeout: 4000 });
      } else {
        setTimeout(loadData, 0);
      }
    };
    const interval = setInterval(scheduleLoad, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadData = () => {
    try {
      const businessDay = getBusinessDay(new Date(), businessDayStartHour);
      const yesterdayBusinessDay = getPreviousBusinessDay(businessDay);
      
      const activeData = localDb.getActiveLockers();
      setActiveLockers(activeData);
      activeLockersRef.current = activeData;
      
      const allEntries = loadStatusEntriesForBusinessDay(businessDay, businessDayStartHour);
      setTodayAllEntries(allEntries);
      setYesterdayAllEntries(loadStatusEntriesForBusinessDay(yesterdayBusinessDay, businessDayStartHour));

      const additionalFeeEvents = localDb.getAdditionalFeeEventsByBusinessDayRange(businessDay, businessDayStartHour);
      const entries = allEntries.filter(e => !e.additionalFeeOnly);
      // 추가요금만 있는 항목은 방문인원에서 제외 (이전 영업일 입실 고객)
      // 자식 락카(parentLocker가 있는 락카)도 방문인원에서 제외 (한 손님이 여러 락카 사용)
      // 후불결제(deferredPayment = true)는 매출에서 제외 - 결제완료 시점에만 반영
      const activeEntries = entries.filter(e => !e.cancelled && !(e as any).deferredPayment);
      const totalRefundsToday = activeEntries.reduce((sum, e) => sum + ((e as any).refundAmount || 0), 0);
      const activeSales = activeEntries.reduce((sum, e) => sum + (e.finalPrice || 0), 0) - totalRefundsToday;
      const totalVisitors = entries.filter(e => !e.cancelled && !(e as any).parentLocker && !(e as any).isStaff).length;
      const cancellations = entries.filter(e => e.cancelled).length;
      const foreignerCount = entries.filter(e => e.optionType === 'foreigner' && !e.cancelled && !(e as any).parentLocker && !(e as any).isStaff).length;
      const dayVisitors = entries.filter(e => e.timeType === '주간' && !e.cancelled && !(e as any).parentLocker && !(e as any).isStaff).length;
      const nightVisitors = entries.filter(e => e.timeType === '야간' && !e.cancelled && !(e as any).parentLocker && !(e as any).isStaff).length;
      
      // Calculate additional fee sales from the already-fetched events (checkout_time 기준)
      // CRITICAL FIX: 다른 영업일 추가요금만 합산 (같은 영업일은 finalPrice에 포함됨)
      const additionalFees = additionalFeeEvents
        .filter(event => {
          const e = event as any;
          return e.entryBusinessDay && e.entryBusinessDay !== event.businessDay;
        })
        .reduce((sum, event) => sum + event.feeAmount, 0);
      setAdditionalFeeSales(additionalFees);
      
      setSummary({
        businessDay,
        totalVisitors,
        totalSales: activeSales, // 오늘 입실 요금만 (추가요금은 additionalFeeSales로 별도 전달, 환불 차감 포함)
        cancellations,
        totalDiscount: 0,
        foreignerCount,
        foreignerSales: 0,
        dayVisitors,
        nightVisitors,
        totalRefunds: totalRefundsToday,
      });
      setLockerGroups(localDb.getLockerGroups());
      
      // Get rental revenue for today (비즈니스 데이 범위 기준)
      const rentalTransactions = localDb.getRentalTransactionsByBusinessDayRange(businessDay, businessDayStartHour);
      const rentalRev = rentalTransactions.reduce((sum, txn) => sum + txn.revenue, 0);
      setRentalRevenue(rentalRev);
      
      // Get total expenses for today
      const expenseSummary = localDb.getExpenseSummaryByBusinessDay(businessDay);
      setTotalExpenses(Number(expenseSummary.total) || 0);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  // Calculate all locker numbers from groups and their states
  const lockerStates: { [key: number]: 'empty' | 'in-use' | 'disabled' } = {};
  const additionalFeeCounts: { [key: number]: number } = {};
  const lockerTimeTypes: { [key: number]: 'day' | 'night' } = {};
  const lockerEntryTimes: { [key: number]: Date } = {};
  const lockerParents: { [key: number]: number | null } = {};
  const lockerDeferredPayments: { [key: number]: boolean } = {}; // 후불결제 여부
  const lockerCustomerMemos: { [key: number]: string } = {}; // 손님 메모
  const lockerOutingStatus: { [key: number]: boolean } = {}; // 외출 중 여부
  const lockerOutingStartedAt: { [key: number]: string | null } = {}; // 외출 시작 시각
  const lockerOutingExceeded: { [key: number]: boolean } = {}; // 외출 시간 초과 여부
  const lockerStaffStatus: { [key: number]: boolean } = {}; // 직원 사용 여부
  const lockerLongTermStatus: { [key: number]: boolean } = {}; // 장기투숙 여부
  const lockerCheckoutWarning: { [key: number]: boolean } = {}; // 장기투숙 퇴실경고
  
  lockerGroups.forEach(group => {
    for (let i = group.startNumber; i <= group.endNumber; i++) {
      lockerStates[i] = 'empty';
      additionalFeeCounts[i] = 0;
      lockerTimeTypes[i] = 'day';
      lockerParents[i] = null;
      lockerDeferredPayments[i] = false;
      lockerCustomerMemos[i] = '';
      lockerOutingStatus[i] = false;
      lockerOutingStartedAt[i] = null;
      lockerOutingExceeded[i] = false;
      lockerStaffStatus[i] = false;
      lockerLongTermStatus[i] = false;
      lockerCheckoutWarning[i] = false;
    }
  });
  
  activeLockers.forEach(log => {
    lockerStates[log.lockerNumber] = 'in-use';
    lockerEntryTimes[log.lockerNumber] = new Date(log.entryTime);
    lockerParents[log.lockerNumber] = log.parentLocker || null;
    lockerDeferredPayments[log.lockerNumber] = (log as any).deferredPayment || false; // 후불결제 여부
    lockerCustomerMemos[log.lockerNumber] = (log as any).customerMemo || ''; // 손님 메모
    lockerOutingStatus[log.lockerNumber] = !!(log as any).isOuting; // 외출 중 여부
    lockerStaffStatus[log.lockerNumber] = !!(log as any).isStaff; // 직원 사용 여부
    const isLongTerm = !!(log as any).isLongTerm;
    lockerLongTermStatus[log.lockerNumber] = isLongTerm;
    const outingStartedAt = (log as any).outingStartedAt || null;
    lockerOutingStartedAt[log.lockerNumber] = outingStartedAt;
    // 외출 시간 초과 여부 계산 (평일/휴일 분리 적용)
    if (!!(log as any).isOuting && outingStartedAt) {
      // 외출이 시작된 시각 기준으로 평일/휴일 판단
      // (현재 시각 기준으로 하면 자정 이후 요일이 바뀌어 기준이 달라지는 문제 발생)
      const outingStartDate = new Date(outingStartedAt);
      const effectiveLimit = isWeekendOrHoliday(outingStartDate)
        ? outingTimeLimitWeekendMinutes
        : outingTimeLimitMinutes;
      if (effectiveLimit > 0) {
        const outingElapsedMs = lockerTickTime.getTime() - outingStartDate.getTime();
        lockerOutingExceeded[log.lockerNumber] = outingElapsedMs > effectiveLimit * 60 * 1000;
      } else {
        lockerOutingExceeded[log.lockerNumber] = false;
      }
    } else {
      lockerOutingExceeded[log.lockerNumber] = false;
    }

    // 장기투숙: 예정 퇴실 30분 전부터 퇴실경고
    if (isLongTerm && (log as any).plannedCheckoutAt) {
      const planned = new Date((log as any).plannedCheckoutAt);
      if (!Number.isNaN(planned.getTime())) {
        const warnAt = planned.getTime() - 30 * 60 * 1000;
        lockerCheckoutWarning[log.lockerNumber] = lockerTickTime.getTime() >= warnAt;
      }
    }
    
    // 외국인 여부 확인
    const isForeigner = log.optionType === 'foreigner';
    
    // 장기투숙은 추가요금 로직 완전 무시
    if (isLongTerm) {
      additionalFeeCounts[log.lockerNumber] = 0;
    } else {
      // Calculate additional fee for this locker
      const { additionalFee, midnightsPassed, additionalFeeCount } = calculateAdditionalFee(
        log.entryTime,
        log.timeType,
        dayPrice,
        nightPrice,
        lockerTickTime,
        isForeigner,
        resolveForeignerPrice(log.timeType),
        domesticCheckpointHour,
        foreignerAdditionalFeePeriod,
        false,
        domesticAdditionalFeeMode,
        nightStartHour,
        settlementCycleOpts,
        stagedHourlyOpts,
        nightstartOpts
      );
      
      // 추가요금 완납 여부 확인: 현재 추가요금이 (지불된 금액 + 선지급 금액) 이하면 완납
      const paidAmount = (log as any).additionalFeePaidAmount || 0;
      const prepaidAmount = (log as any).prepaidAdditionalFee || 0;
      const totalPaidAmount = paidAmount + prepaidAmount;
      const hasUnpaidAdditionalFee = additionalFee > totalPaidAmount;
      
      // 미지불 추가요금이 있을 때만 횟수 표시
      additionalFeeCounts[log.lockerNumber] = hasUnpaidAdditionalFee ? additionalFeeCount : 0;
    }
    
    // Store time type (convert Korean to English)
    const convertedTimeType = log.timeType === '주간' ? 'day' : 'night';
    lockerTimeTypes[log.lockerNumber] = convertedTimeType;
  });
  
  // 빈 락커 개수 계산
  const emptyLockerCount = Object.values(lockerStates).filter(state => state === 'empty').length;

  // 연장객: 추가요금(내국인=야간요금 풀요금, 외국인=주기요금)이 최소 1회 부과되었고 그 추가요금이 완납된 락커 수
  // ("추가N회" 배지는 미납 안내일 뿐 납부 결과가 아니므로, 완납되지 않은 미수 상태는 세지 않는다)
  // (락커당 며칠을 더 머물든 1로만 카운트 — 누적이 아니라 그날의 스냅샷)
  const extendedGuestConfig: ExtendedGuestFeeConfig = {
    dayPrice, nightPrice,
    foreignerPrice: settings.foreignerPrice, foreignerSeparateDayNight: settings.foreignerSeparateDayNight,
    foreignerDayPrice: settings.foreignerDayPrice, foreignerNightPrice: settings.foreignerNightPrice,
    domesticCheckpointHour, foreignerAdditionalFeePeriod,
    domesticAdditionalFeeMode, nightStartHour, settlementCycleOpts, stagedHourlyOpts, nightstartOpts,
  };
  const extendedGuestCount = countExtendedGuestLockers(
    activeLockers as unknown as ExtendedGuestEntry[],
    lockerTickTime,
    extendedGuestConfig
  );

  const handleLockerClick = async (lockerNumber: number) => {
    const state = lockerStates[lockerNumber];

    if (state === 'empty') {
      const timeType = localDb.getTimeTypeWithSettings(new Date());
      const basePrice = getBasePrice(timeType, dayPrice, nightPrice);
      
      // Log the locker click (for scan tracking)
      try {
        localDb.addScanLog(lockerNumber);
      } catch (error) {
        console.error('Failed to log locker click:', error);
      }
      
      // Add to openDialogs for multi-popup display
      setOpenDialogs(prev => upsertLockerDialog(prev, {
        lockerNumber,
        timeType,
        basePrice,
        newLockerInfo: { lockerNumber, timeType, basePrice }
      }));
      
      // Show popup workspace when locker is clicked
      setPopupsVisible(true);
    } else if (state === 'in-use') {
      // Check if this is a child locker
      const parentLockerNumber = lockerParents[lockerNumber];
      if (parentLockerNumber) {
        // Child locker: show alert only
        setChildLockerParent(parentLockerNumber);
        setChildLockerCurrentNumber(lockerNumber);
        setChildLockerAlertOpen(true);
      } else {
        // Parent or independent locker: add to openDialogs
        const entry = activeLockers.find(log => log.lockerNumber === lockerNumber);
        if (entry) {
          setOpenDialogs(prev => upsertLockerDialog(prev, {
            lockerNumber,
            timeType: entry.timeType,
            basePrice: entry.basePrice
          }));
          
          // Show popup workspace when locker is clicked
          setPopupsVisible(true);
        }
      }
    }
  };

  const handleApplyOption = async (
    lockerNumber: number,
    option: string, 
    customAmount?: number, 
    notes?: string, 
    paymentMethod?: 'card' | 'cash' | 'transfer',
    rentalItems?: Array<{
      itemId: string;
      itemName: string;
      rentalFee: number;
      depositAmount: number;
      depositStatus: 'received' | 'refunded' | 'forfeited' | 'none';
      paymentMethod: 'cash' | 'card' | 'transfer';
      isCashReceipt?: boolean;
      vatAppliedRentalFee?: number;
      vatAppliedDepositAmount?: number;
      quantity?: number;
    }>,
    paymentCash?: number,
    paymentCard?: number,
    paymentTransfer?: number,
    deferredPayment?: boolean, // 후불결제 여부
    customerMemo?: string, // 손님 메모
    noAdditionalFee?: boolean, // 추가요금없음 (VIP 등)
    prepaidAdditionalFee?: number, // 추가요금 선지급 금액
    isCashReceipt?: boolean, // 현금영수증 발행 여부
    additionalFeePaymentMethod?: 'card' | 'cash' | 'transfer', // 추가요금 결제방식
    isStaff?: boolean, // 직원 입실 여부
    editedEntryTime?: string, // 입실시간 소급 수정 (사용 중만)
    longTermStay?: {
      plannedCheckoutAt: string;
      dailyFee: number;
      discount: number;
      stayDays: number;
    } | null,
    prepaidAdditionalFeeCash?: number, // 선지급 중 현금 분리결제 금액
    prepaidAdditionalFeeCard?: number, // 선지급 중 카드 분리결제 금액
    prepaidAdditionalFeeTransfer?: number, // 선지급 중 이체 분리결제 금액
  ) => {
    // Use ref to get the latest openDialogs state (prevents stale closure issue)
    const currentOpenDialogs = openDialogsRef.current;
    
    // Get dialog info for this locker
    const dialogInfo = currentOpenDialogs.get(lockerNumber);
    if (!dialogInfo) {
      console.error('[handleApplyOption] No dialogInfo found for locker', lockerNumber);
      return;
    }
    
    const newLockerInfo = dialogInfo.newLockerInfo;
    
    // Handle new locker entry
    if (newLockerInfo) {
      // 옵션창이 열린 시간(스캔 시간)을 입실시간으로 사용
      // 스캔 로그가 없는 경우(예외 상황) 현재 시간 사용
      const dialogOpenedTime = localDb.getLatestUnprocessedScanTime(lockerNumber) || new Date();
      const businessDay = getBusinessDay(dialogOpenedTime, businessDayStartHour);
      let optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' | 'free' = 'none';
      let finalPrice = newLockerInfo.basePrice;
      let optionAmount: number | undefined;

      if (option === 'free') {
        optionType = 'free';
        finalPrice = 0;
        optionAmount = 0;
      } else if ((option === 'direct_price' || option === 'long_term') && customAmount !== undefined) {
        optionType = 'direct_price';
        finalPrice = customAmount;
        optionAmount = customAmount;
      } else if (option === 'foreigner') {
        optionType = 'foreigner';
        // customAmount: 외국인 요금에 함께 적용된 할인/할증액 (음수=할인). LockerOptionsDialog에서
        // 계산해 넘겨준 값을 그대로 신뢰 — 여기서 무시하면 재오픈 시 할인 정보가 사라짐(버그였음).
        finalPrice = Math.max(0, resolveForeignerPrice(newLockerInfo.timeType) + (customAmount || 0));
        optionAmount = customAmount;
      } else if (option === 'discount') {
        optionType = 'discount';
        finalPrice = Math.max(0, newLockerInfo.basePrice - discountAmount);
        optionAmount = discountAmount;
      } else if (option === 'custom' && customAmount) {
        optionType = 'custom';
        finalPrice = Math.max(0, newLockerInfo.basePrice - customAmount);
        optionAmount = customAmount;
      }

      // 후불결제인 경우: 결제금액을 0으로 설정 (결제완료 버튼 눌렀을 때 실제 금액 기록)
      // finalPrice는 유지 (나중에 결제완료 시 참조용)
      // 일일요약(updateDailySummary)에서 deferred_payment=1인 항목은 매출에서 자동 제외됨
      const actualPaymentCash = deferredPayment ? 0 : (paymentCash || 0);
      const actualPaymentCard = deferredPayment ? 0 : (paymentCard || 0);
      const actualPaymentTransfer = deferredPayment ? 0 : (paymentTransfer || 0);

      // 선지급금은 다이얼로그에서 이미 결제 버킷에 포함하여 전달됨 (중복 합산 방지)
      const prepaidAmount = prepaidAdditionalFee || 0;
      const totalPaymentCash = actualPaymentCash;
      const totalPaymentCard = actualPaymentCard;
      const totalPaymentTransfer = actualPaymentTransfer;

      // 결제 금액 합계로 finalPrice 계산 (부가세 + 선지급금 포함)
      const paymentSum = totalPaymentCash + totalPaymentCard + totalPaymentTransfer;
      const actualFinalPrice = deferredPayment || optionType === 'free'
        ? finalPrice + prepaidAmount
        : paymentSum || (finalPrice + prepaidAmount);

      const lockerLogId = localDb.createEntry({
        lockerNumber: newLockerInfo.lockerNumber,
        timeType: newLockerInfo.timeType,
        basePrice: newLockerInfo.basePrice,
        finalPrice: actualFinalPrice,  // 기본요금 + 선지급금 포함
        businessDay,
        optionType,
        optionAmount,
        notes,
        paymentMethod,
        paymentCash: totalPaymentCash,
        paymentCard: totalPaymentCard,
        paymentTransfer: totalPaymentTransfer,
        entryTime: dialogOpenedTime,  // 옵션창 열린 시간을 입실시간으로 기록
        deferredPayment: deferredPayment || false,  // 후불결제 여부
        customerMemo: customerMemo || undefined,  // 손님 메모
        noAdditionalFee: !!longTermStay || noAdditionalFee || false,  // 장기투숙·VIP 추가요금 면제
        prepaidAdditionalFee: prepaidAdditionalFee || 0,  // 추가요금 선지급 (총액)
        prepaidAdditionalFeeCash: prepaidAdditionalFeeCash || 0,  // 선지급 중 현금
        prepaidAdditionalFeeCard: prepaidAdditionalFeeCard || 0,  // 선지급 중 카드
        prepaidAdditionalFeeTransfer: prepaidAdditionalFeeTransfer || 0,  // 선지급 중 이체
        isCashReceipt: isCashReceipt || false,  // 현금영수증 발행 여부
        additionalFeePaymentMethod: additionalFeePaymentMethod,  // 추가요금 결제방식
        isStaff: isStaff || false,  // 직원 입실 여부
        isLongTerm: !!longTermStay,
        plannedCheckoutAt: longTermStay?.plannedCheckoutAt || null,
        longTermDailyFee: longTermStay?.dailyFee || 0,
        longTermDiscount: longTermStay?.discount || 0,
        longTermDays: longTermStay?.stayDays || 0,
      });

      // Mark the scan log as processed (if there was a scan)
      try {
        localDb.markLatestScanAsProcessedByLocker(lockerNumber);
      } catch (error) {
        console.error('Failed to mark scan log as processed:', error);
      }

      // Create rental transaction records for each rented item (at check-in)
      // NOTE: Rental items are SEPARATE revenue from locker entry fee
      // Each rental item has its own payment method, independent of locker entry payment
      if (rentalItems && rentalItems.length > 0 && lockerLogId) {
        rentalItems.forEach(item => {
          // Calculate total revenue for this item (부가세 포함 금액 사용)
          // vatAppliedRentalFee, vatAppliedDepositAmount가 있으면 사용, 없으면 기본값
          const actualRentalFee = item.vatAppliedRentalFee ?? item.rentalFee;
          const actualDepositAmount = item.vatAppliedDepositAmount ?? item.depositAmount;
          
          // 입실 시에는 항상 'received' 상태로 시작하므로 렌탈비 + 보증금
          let revenue = actualRentalFee;
          if (item.depositStatus === 'received') {
            revenue += actualDepositAmount;
          }
          // 'forfeited'는 반납 시에만 발생하므로 여기서는 처리 불필요
          
          // Allocate full revenue to the item's payment method
          // DO NOT mix with locker entry payment - these are separate revenue streams
          const itemPaymentMethod = item.paymentMethod || 'cash';
          let itemPaymentCash = 0;
          let itemPaymentCard = 0;
          let itemPaymentTransfer = 0;
          
          if (itemPaymentMethod === 'cash') {
            itemPaymentCash = revenue;
          } else if (itemPaymentMethod === 'card') {
            itemPaymentCard = revenue;
          } else if (itemPaymentMethod === 'transfer') {
            itemPaymentTransfer = revenue;
          }
          
          localDb.createRentalTransaction({
            lockerLogId: lockerLogId,
            lockerNumber: newLockerInfo.lockerNumber,
            itemId: item.itemId,
            itemName: item.itemName,
            rentalFee: actualRentalFee,  // 부가세 포함 금액 저장 (단가×수량 합계)
            depositAmount: actualDepositAmount,  // 부가세 포함 금액 저장
            depositStatus: item.depositStatus,
            rentalTime: dialogOpenedTime,  // 옵션창 열린 시간 사용
            returnTime: null,
            businessDay: businessDay,
            paymentMethod: itemPaymentMethod,
            paymentCash: itemPaymentCash,
            paymentCard: itemPaymentCard,
            paymentTransfer: itemPaymentTransfer,
            revenue: revenue,
            quantity: item.quantity ?? 1,
          });
        });
      }

      // Mark the most recent scan for this locker as processed
      localDb.markLatestScanAsProcessedByLocker(newLockerInfo.lockerNumber);

      // Remove this dialog from openDialogs
      setOpenDialogs(prev => {
        const next = new Map(prev);
        next.delete(lockerNumber);
        return next;
      });
      loadData();
      return;
    }

    // Handle existing entry update - find by lockerNumber in activeLockers
    const selectedEntry = activeLockers.find(log => log.lockerNumber === lockerNumber);
    if (!selectedEntry) return;

    let effectiveBasePrice = selectedEntry.basePrice;

    // 입실시간 소급 수정 (사용 중만, 미래 불가 — DB 함수에서 재검증)
    if (editedEntryTime) {
      const result = localDb.updateEntryTime(selectedEntry.id, new Date(editedEntryTime));
      if (!result.success) {
        console.error('[handleApplyOption] updateEntryTime failed:', result.message);
        toast({
          title: "입실시간 수정 실패",
          description: result.message,
          variant: "destructive",
        });
        return;
      }
      if (typeof result.newBasePrice === 'number') {
        effectiveBasePrice = result.newBasePrice;
      }
    }

    let optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' | 'free' = 'none';
    let finalPrice = effectiveBasePrice;
    let optionAmount: number | undefined;

    if (option === 'free') {
      optionType = 'free';
      finalPrice = 0;
      optionAmount = 0;
    } else if ((option === 'direct_price' || option === 'long_term') && customAmount !== undefined) {
      optionType = 'direct_price';
      finalPrice = customAmount;
      optionAmount = customAmount;
    } else if (option === 'foreigner') {
      optionType = 'foreigner';
      const tt = (editedEntryTime
        ? localDb.getTimeTypeWithSettings(new Date(editedEntryTime))
        : selectedEntry.timeType) as '주간' | '야간';
      // customAmount: 외국인 요금에 함께 적용된 할인/할증액 (음수=할인). LockerOptionsDialog에서
      // 계산해 넘겨준 값을 그대로 신뢰 — 여기서 무시하면 재오픈 시 할인 정보가 사라짐(버그였음).
      finalPrice = Math.max(0, resolveForeignerPrice(tt) + (customAmount || 0));
      optionAmount = customAmount;
    } else if (option === 'discount') {
      optionType = 'discount';
      finalPrice = effectiveBasePrice - discountAmount;
      optionAmount = discountAmount;
    } else if (option === 'custom' && customAmount) {
      optionType = 'custom';
      finalPrice = effectiveBasePrice - customAmount;
      optionAmount = customAmount;
    }

    // 후불결제인 경우: 결제금액을 0으로 설정
    // finalPrice는 유지 (일일요약에서 deferred_payment=1인 항목은 매출에서 자동 제외됨)
    const actualPaymentCash = deferredPayment ? 0 : (paymentCash || 0);
    const actualPaymentCard = deferredPayment ? 0 : (paymentCard || 0);
    const actualPaymentTransfer = deferredPayment ? 0 : (paymentTransfer || 0);

    // 선지급금은 다이얼로그에서 이미 결제 버킷에 포함하여 전달됨 (중복 합산 방지)
    const prepaidAmount = prepaidAdditionalFee || 0;
    const totalPaymentCash = actualPaymentCash;
    const totalPaymentCard = actualPaymentCard;
    const totalPaymentTransfer = actualPaymentTransfer;

    // 결제 금액 합계로 actualFinalPrice 계산 (부가세 + 선지급금 포함)
    // paymentSumUpdate = 실제 결제금액 합계 (VAT 포함), 항상 이 값 우선 사용
    const paymentSumUpdate = totalPaymentCash + totalPaymentCard + totalPaymentTransfer;
    const actualFinalPrice = deferredPayment || optionType === 'free'
      ? finalPrice + prepaidAmount
      : paymentSumUpdate || (finalPrice + prepaidAmount);

    localDb.updateEntry(selectedEntry.id, { 
      optionType, 
      optionAmount, 
      finalPrice: actualFinalPrice,  // 결제금액 합계(VAT 포함)를 최종요금으로 저장
      notes, 
      paymentMethod,
      paymentCash: totalPaymentCash,
      paymentCard: totalPaymentCard,
      paymentTransfer: totalPaymentTransfer,
      deferredPayment: deferredPayment || false,
      customerMemo: customerMemo || undefined,  // 손님 메모
      noAdditionalFee: !!longTermStay || noAdditionalFee || false,  // 장기투숙·VIP 추가요금 면제
      prepaidAdditionalFee: prepaidAdditionalFee || 0,  // 추가요금 선지급 상태 유지 (총액)
      prepaidAdditionalFeeCash: prepaidAdditionalFeeCash || 0,  // 선지급 중 현금
      prepaidAdditionalFeeCard: prepaidAdditionalFeeCard || 0,  // 선지급 중 카드
      prepaidAdditionalFeeTransfer: prepaidAdditionalFeeTransfer || 0,  // 선지급 중 이체
      isCashReceipt: isCashReceipt || false,  // 현금영수증 발행 여부 유지
      additionalFeePaymentMethod: additionalFeePaymentMethod,  // 추가요금 결제방식 유지
      isLongTerm: !!longTermStay,
      plannedCheckoutAt: longTermStay?.plannedCheckoutAt || null,
      longTermDailyFee: longTermStay?.dailyFee || 0,
      longTermDiscount: longTermStay?.discount || 0,
      longTermDays: longTermStay?.stayDays || 0,
    });
    
    // Handle rental items for existing entry (if saving changes)
    if (rentalItems && rentalItems.length > 0) {
      const businessDay = getBusinessDay(new Date(), businessDayStartHour);
      const existingTransactions = localDb.getRentalTransactionsByLockerLog(selectedEntry.id);
      
      rentalItems.forEach(item => {
        // Check if an ACTIVE (non-returned) rental transaction exists for this item
        // Exclude returnCompleted=1 so re-rental creates a new transaction
        const existingItem = existingTransactions.find(t => t.itemId === item.itemId && t.returnCompleted !== 1);
        
        const incomingFee = item.vatAppliedRentalFee ?? item.rentalFee;
        const incomingDeposit = item.vatAppliedDepositAmount ?? item.depositAmount;
        const incomingQty = item.quantity ?? 1;
        const existingQty = Number(existingItem?.quantity) > 0 ? Number(existingItem.quantity) : 1;
        const quantityChanged = !!existingItem && existingQty !== incomingQty;
        
        // 수량 변경 시에는 새 금액 사용, 그 외 기존 트랜잭션은 DB 금액 유지
        const actualRentalFee = existingItem && !quantityChanged
          ? existingItem.rentalFee
          : incomingFee;
        const actualDepositAmount = existingItem ? existingItem.depositAmount : incomingDeposit;
        
        // Revenue calculation (부가세 포함 금액 기준):
        // - received: rental fee + deposit (대여 시)
        // - forfeited (same-day): rental fee + deposit (같은 영업일 반납)
        // - forfeited (cross-day): rental fee only (다른 영업일 반납, 보증금은 이미 대여일 매출)
        // - refunded (cross-day): rental fee only (보증금 환급, 지출 생성)
        // - refunded (same-day): rental fee only (보증금 환급)
        let revenue = actualRentalFee;
        let isCrossDayRefund = false;
        
        if (item.depositStatus === 'received') {
          revenue += actualDepositAmount;
        } else if (item.depositStatus === 'forfeited' && existingItem) {
          // 영업일 비교: 대여일과 현재가 같으면 보증금 포함, 다르면 제외
          const rentalBusinessDay = existingItem.businessDay;
          const currentBusinessDay = businessDay;
          if (rentalBusinessDay === currentBusinessDay) {
            revenue += actualDepositAmount;
          }
          // 다른 영업일이면 보증금 제외 (이미 대여일 매출)
        } else if (item.depositStatus === 'refunded' && existingItem) {
          // Determine return timestamp: use existing returnTime if set, otherwise current time
          const returnTimestamp = existingItem.returnTime ? new Date(existingItem.returnTime) : new Date();
          
          // Check if cross-day refund using actual/expected return timestamp
          const rentalBusinessDay = existingItem.businessDay;
          const returnBusinessDay = getBusinessDay(returnTimestamp, businessDayStartHour);
          isCrossDayRefund = (rentalBusinessDay !== returnBusinessDay);
          
          if (isCrossDayRefund) {
            // Cross-day refund: include deposit in rental day revenue
            revenue += actualDepositAmount;
          }
          // Same-day refund: don't include deposit (revenue = rental fee only)
        }
        
        if (!existingItem) {
          // Create new rental transaction if it doesn't exist
          // rentalTime = 대여품목 체크박스 선택 시점 (현재 시간)
          // Each rental item's revenue is allocated 100% to its own payment method
          const itemPaymentMethod = item.paymentMethod || 'cash';
          
          // 부가세 포함 금액 사용
          const actualRentalFee = item.vatAppliedRentalFee ?? item.rentalFee;
          const actualDepositAmount = item.vatAppliedDepositAmount ?? item.depositAmount;
          
          // Revenue 재계산 (부가세 포함)
          let actualRevenue = actualRentalFee;
          if (item.depositStatus === 'received') {
            actualRevenue += actualDepositAmount;
          }
          
          let itemPaymentCash = 0;
          let itemPaymentCard = 0;
          let itemPaymentTransfer = 0;
          
          // Allocate 100% of revenue to the selected payment method
          if (itemPaymentMethod === 'cash') {
            itemPaymentCash = actualRevenue;
          } else if (itemPaymentMethod === 'card') {
            itemPaymentCard = actualRevenue;
          } else if (itemPaymentMethod === 'transfer') {
            itemPaymentTransfer = actualRevenue;
          }
          
          localDb.createRentalTransaction({
            lockerLogId: selectedEntry.id,
            lockerNumber: selectedEntry.lockerNumber,
            itemId: item.itemId,
            itemName: item.itemName,
            rentalFee: actualRentalFee,  // 부가세 포함 금액 저장 (단가×수량 합계)
            depositAmount: actualDepositAmount,  // 부가세 포함 금액 저장
            depositStatus: item.depositStatus,
            rentalTime: new Date(),
            returnTime: null,
            businessDay: businessDay,
            paymentMethod: itemPaymentMethod,
            paymentCash: itemPaymentCash > 0 ? itemPaymentCash : undefined,
            paymentCard: itemPaymentCard > 0 ? itemPaymentCard : undefined,
            paymentTransfer: itemPaymentTransfer > 0 ? itemPaymentTransfer : undefined,
            revenue: actualRevenue,
            quantity: item.quantity ?? 1,
          });
        } else {
          // Update existing rental transaction
          const updateData: any = {
            depositStatus: item.depositStatus,
            revenue: revenue,
          };
          
          if (quantityChanged) {
            updateData.rentalFee = actualRentalFee;
            updateData.quantity = incomingQty;
            const itemPaymentMethod = item.paymentMethod || existingItem.paymentMethod || 'cash';
            updateData.paymentMethod = itemPaymentMethod;
            updateData.paymentCash = itemPaymentMethod === 'cash' ? revenue : 0;
            updateData.paymentCard = itemPaymentMethod === 'card' ? revenue : 0;
            updateData.paymentTransfer = itemPaymentMethod === 'transfer' ? revenue : 0;
          }
          
          // If deposit status changed to refunded/forfeited and returnTime is not set, set it now
          const isStatusChanging = (item.depositStatus === 'refunded' || item.depositStatus === 'forfeited') && !existingItem.returnTime;
          if (isStatusChanging) {
            updateData.returnTime = new Date();
            // Note: Cross-day refund expense is now automatically created by updateRentalTransaction
          }
          
          localDb.updateRentalTransaction(existingItem.id, updateData);
        }
      });
    }
    
    loadData();
  };

  const handleUnlinkChildLocker = () => {
    if (!childLockerCurrentNumber) return;
    try {
      const result = localDb.unlinkChildLocker(childLockerCurrentNumber);
      if (result.success) {
        toast({ title: "묶기 해제 완료", description: result.message });
        setChildLockerAlertOpen(false);
        loadData();
      } else {
        toast({ variant: "destructive", title: "묶기 해제 실패", description: result.message });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "오류", description: "묶기 해제 중 오류가 발생했습니다." });
    }
  };

  const handleCheckout = async (
    lockerNumber: number,
    paymentMethod: 'card' | 'cash' | 'transfer', 
    rentalItems?: Array<{
      itemId: string;
      itemName: string;
      rentalFee: number;
      depositAmount: number;
      depositStatus: 'received' | 'refunded' | 'forfeited' | 'none';
      isCashReceipt?: boolean;
      vatAppliedRentalFee?: number;
      vatAppliedDepositAmount?: number;
      quantity?: number;
    }>,
    paymentCash?: number,
    paymentCard?: number,
    paymentTransfer?: number,
    additionalFeePayment?: {
      method: 'card' | 'cash' | 'transfer';
      cash?: number;
      card?: number;
      transfer?: number;
      discount?: number;
    },
    customerMemo?: string,
    refundAmount?: number,
    refundNote?: string,
    refundMethod?: 'cash' | 'card' | 'transfer',
    exitTimeISO?: string
  ) => {
    const selectedEntry = activeLockers.find(log => log.lockerNumber === lockerNumber);
    if (!selectedEntry) return;

    const now = exitTimeISO ? new Date(exitTimeISO) : new Date();
    if (Number.isNaN(now.getTime())) return;
    const entryBusinessDay = (selectedEntry as any).businessDay;
    const checkoutBusinessDay = getBusinessDay(now, businessDayStartHour);
    
    // Calculate additional fee if any
    const isCurrentlyForeigner = selectedEntry.optionType === 'foreigner';
    const additionalFeeInfo = calculateAdditionalFee(
      selectedEntry.entryTime,
      selectedEntry.timeType,
      dayPrice,
      nightPrice,
      now,
      isCurrentlyForeigner,
      resolveForeignerPrice(selectedEntry.timeType),
      domesticCheckpointHour,
      foreignerAdditionalFeePeriod,
      false,
      domesticAdditionalFeeMode,
      nightStartHour,
      settlementCycleOpts,
      stagedHourlyOpts,
      nightstartOpts
    );
    
    // If checking out on a different business day (after settlement time):
    // DO NOT update basePrice, optionAmount, finalPrice, or payment fields
    // (they should remain as originally set on entry day for accurate entry-day revenue reporting)
    // Additional fee is recorded separately in additional_fee_events table
    if (entryBusinessDay !== checkoutBusinessDay) {
      // Different business day - only update status and exitTime
      // Keep original finalPrice intact so entry-day totals remain correct
      // Additional fee payment is recorded separately in additional_fee_events table
      localDb.updateEntry(selectedEntry.id, { 
        status: 'checked_out',
        exitTime: now,
        customerMemo: customerMemo,
        ...(refundAmount && refundAmount > 0 ? {
          refundAmount,
          refundNote,
          refundTime: now.toISOString(),
          refundMethod: refundMethod || 'cash',
        } : {}),
      });
    } else {
      // Same business day checkout
      // CRITICAL FIX: Update finalPrice to include additional fee for correct display
      // Base price payment stays in locker_logs
      // Additional fee payment goes to additional_fee_events table for independent tracking
      // 추가요금 할인 반영: 할인이 있으면 할인된 금액으로 finalPrice 업데이트
      // 부가세가 적용된 추가요금을 additionalFeePayment에서 계산
      const actualAdditionalFee = (additionalFeePayment?.cash || 0) + (additionalFeePayment?.card || 0) + (additionalFeePayment?.transfer || 0);
      const updatedFinalPrice = selectedEntry.finalPrice + actualAdditionalFee;
      
      // DO NOT store additionalFees in locker_logs.additional_fees column for same-day checkouts
      // It's already tracked in additional_fee_events table below
      // Storing it in both places causes double-counting in LogsPage
      localDb.updateEntry(selectedEntry.id, { 
        status: 'checked_out',
        exitTime: now,
        paymentMethod: paymentMethod,
        paymentCash: paymentCash,
        paymentCard: paymentCard,
        paymentTransfer: paymentTransfer,
        finalPrice: updatedFinalPrice,
        customerMemo: customerMemo,
        // additionalFees: removed to prevent duplication with additional_fee_events
        ...(refundAmount && refundAmount > 0 ? {
          refundAmount,
          refundNote,
          refundTime: now.toISOString(),
          refundMethod: refundMethod || 'cash',
        } : {}),
      });
    }
    
    // Create additional fee event for ALL checkouts with additional fees
    // This ensures payment method independence between entry and additional fees
    // 할인으로 청구액이 0원이 되어도 전액할인 기록을 남김
    if (additionalFeeInfo.additionalFee > 0) {
      // 할인 계산: 원래 추가요금에서 할인금액 차감
      const discountAmount = additionalFeePayment?.discount || 0;
      // 부가세가 적용된 실제 결제 금액을 additionalFeePayment에서 계산
      const actualFeeAmount = (additionalFeePayment?.cash || 0) + (additionalFeePayment?.card || 0) + (additionalFeePayment?.transfer || 0);
      // 전액할인처럼 결제액 0 + discount만 있는 경우도 0원으로 기록
      const discountedFee = actualFeeAmount > 0
        ? actualFeeAmount
        : Math.max(0, additionalFeeInfo.additionalFee - discountAmount);
      
      const addFeePayment = additionalFeePayment || {
        method: paymentMethod,
        cash: paymentMethod === 'cash' ? discountedFee : undefined,
        card: paymentMethod === 'card' ? discountedFee : undefined,
        transfer: paymentMethod === 'transfer' ? discountedFee : undefined,
      };
      
      localDb.createAdditionalFeeEvent({
        lockerLogId: selectedEntry.id,
        lockerNumber: selectedEntry.lockerNumber,
        checkoutTime: now,
        feeAmount: discountedFee,  // 할인·부가세 반영된 실제 청구액 (전액할인 시 0)
        originalFeeAmount: discountAmount > 0 ? additionalFeeInfo.additionalFee : undefined,  // 할인 전 원래 금액
        discountAmount: discountAmount,
        businessDay: checkoutBusinessDay,
        paymentMethod: addFeePayment.method,
        paymentCash: discountedFee === 0 ? undefined : addFeePayment.cash,
        paymentCard: discountedFee === 0 ? undefined : addFeePayment.card,
        paymentTransfer: discountedFee === 0 ? undefined : addFeePayment.transfer,
      });
      
      // CRITICAL: Update checkout business day summary to include additional fee revenue
      // Without this, additional fees won't appear in today's sales!
      localDb.updateDailySummary(checkoutBusinessDay);
    }
    
    // Update rental transaction records for each rented item
    if (rentalItems && rentalItems.length > 0) {
      rentalItems.forEach(item => {
        // Find existing rental transaction for this item
        const existingTransactions = localDb.getRentalTransactionsByLockerLog(selectedEntry.id);
        // Only match ACTIVE (non-returned) transactions — re-rented items need a new transaction
        const existingItem = existingTransactions.find(t => t.itemId === item.itemId && t.returnCompleted !== 1);
        
        // 부가세 포함 금액 사용 (기존 트랜잭션이 있으면 DB의 값 유지, 없으면 새 값 사용)
        const actualRentalFee = existingItem ? existingItem.rentalFee : (item.vatAppliedRentalFee ?? item.rentalFee);
        const actualDepositAmount = existingItem ? existingItem.depositAmount : (item.vatAppliedDepositAmount ?? item.depositAmount);
        
        // Calculate this item's revenue (부가세 포함 금액 기준)
        let itemRevenue = actualRentalFee;
        
        // 보증금 매출 처리:
        // - 'received': 렌탈비 + 보증금
        // - 'forfeited' (같은 영업일): 렌탈비 + 보증금
        // - 'forfeited' (다른 영업일): 렌탈비만 (보증금은 이미 대여일 매출로 계산됨)
        // - 'refunded': 렌탈비만
        if (item.depositStatus === 'received') {
          itemRevenue += actualDepositAmount;
        } else if (item.depositStatus === 'forfeited') {
          // 영업일 비교: 대여일과 반납일이 같으면 보증금 포함, 다르면 제외
          if (existingItem) {
            const rentalBusinessDay = existingItem.businessDay;
            const returnBusinessDay = checkoutBusinessDay;
            if (rentalBusinessDay === returnBusinessDay) {
              // 같은 영업일: 보증금 포함
              itemRevenue += actualDepositAmount;
            }
            // 다른 영업일: 보증금 제외 (이미 대여일 매출로 계산됨)
          }
        }
        // Note: Cross-day refund expense is now automatically created by updateRentalTransaction
        
        if (existingItem) {
          // Update existing rental transaction - only update deposit status and return time
          // DO NOT update payment fields - they were already set correctly at check-in
          localDb.updateRentalTransaction(existingItem.id, {
            depositStatus: item.depositStatus,
            returnTime: now,
            businessDay: checkoutBusinessDay,
            revenue: itemRevenue,
          });
        } else {
          // Fallback: Create new rental transaction if not found (defensive coding)
          // This should rarely happen - payment info will be missing
          localDb.createRentalTransaction({
            lockerLogId: selectedEntry.id,
            lockerNumber: selectedEntry.lockerNumber,
            itemId: item.itemId,
            itemName: item.itemName,
            rentalFee: actualRentalFee,  // 부가세 포함 금액 저장 (단가×수량 합계)
            depositAmount: actualDepositAmount,  // 부가세 포함 금액 저장
            depositStatus: item.depositStatus,
            rentalTime: selectedEntry.entryTime,
            returnTime: now,
            businessDay: checkoutBusinessDay,
            paymentMethod: paymentMethod,
            revenue: itemRevenue,
            quantity: item.quantity ?? 1,
          });
        }
      });
    }
    
    // Automatically unlink child lockers when parent checks out
    localDb.unlinkChildLockers(selectedEntry.lockerNumber, now.toISOString());
    
    // Remove this dialog from openDialogs
    setOpenDialogs(prev => {
      const next = new Map(prev);
      next.delete(lockerNumber);
      return next;
    });
    
    loadData();
  };

  const handleCancel = async (lockerNumber: number) => {
    const selectedEntry = activeLockers.find(log => log.lockerNumber === lockerNumber);
    if (!selectedEntry) return;

    localDb.updateEntry(selectedEntry.id, { 
      status: 'cancelled',
      cancelled: true,
    });
    
    // Automatically cancel child lockers when parent is cancelled
    localDb.cancelChildLockers(selectedEntry.lockerNumber);
    
    // Remove this dialog from openDialogs
    setOpenDialogs(prev => {
      const next = new Map(prev);
      next.delete(lockerNumber);
      return next;
    });
    
    loadData();
  };

  const handleSwap = (lockerNumber: number, toLocker: number) => {
    const fromLocker = lockerNumber;
    const result = localDb.swapLockers(fromLocker, toLocker);
    
    if (result.success) {
      toast({
        title: "성공",
        description: result.message,
        className: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
      });
      
      // Remove this dialog from openDialogs
      setOpenDialogs(prev => {
        const next = new Map(prev);
        next.delete(lockerNumber);
        return next;
      });
      
      loadData();
    } else {
      toast({
        title: "오류",
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const todayBusinessDay = getBusinessDay(new Date(), businessDayStartHour);
  const yesterdayBusinessDay = getPreviousBusinessDay(todayBusinessDay);
  const todayEntries = mapToStatusTableEntries(todayAllEntries);
  const yesterdayEntries = mapToStatusTableEntries(yesterdayAllEntries);
  
  // 퇴실 취소 핸들러
  const handleReverseCheckout = (entry: { id?: string; lockerNumber: number }) => {
    if (!entry.id) {
      toast({
        title: "오류",
        description: "퇴실 취소에 필요한 정보가 없습니다.",
        variant: "destructive"
      });
      return;
    }
    
    const result = localDb.reverseCheckout(entry.id);
    if (result.success) {
      toast({
        title: "퇴실 취소 완료",
        description: result.message,
      });
      loadData();
    } else {
      toast({
        title: "퇴실 취소 실패",
        description: result.message,
        variant: "destructive"
      });
    }
  };

  // 락카 그리드 렌더링 함수 (토글/탭 모드 공용)
  const renderLockerLegend = (includeStaff = false, includeDisabled = false) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="entry-legend-chip">
        <div className="entry-legend-swatch bg-white border border-gray-300 dark:bg-slate-700 dark:border-slate-500" />
        <span>빈락카</span>
      </div>
      <div className="entry-legend-chip">
        <div className="entry-legend-swatch bg-[#22C55E]" />
        <span>이전영업일</span>
      </div>
      <div className="entry-legend-chip">
        <div className="entry-legend-swatch bg-[#FFD700]" />
        <span>주간</span>
      </div>
      <div className="entry-legend-chip">
        <div className="entry-legend-swatch bg-[#7B68EE]" />
        <span>야간</span>
      </div>
      <div className="entry-legend-chip">
        <div className="entry-legend-swatch bg-[#FF4444]" />
        <span>추가요금</span>
      </div>
      {includeStaff && (
        <div className="entry-legend-chip">
          <div className="entry-legend-swatch bg-[#FF69B4]" />
          <span>직원</span>
        </div>
      )}
      {includeDisabled && disabledLockers.size > 0 && (
        <div className="entry-legend-chip">
          <div className="entry-legend-swatch bg-gray-200 border border-gray-300 dark:bg-gray-700 dark:border-gray-500" />
          <span>사용불가</span>
        </div>
      )}
    </div>
  );

  const renderLockerStats = () => (
    <div className="flex flex-wrap gap-2">
      <div className="entry-stat-chip">
        <span className="text-muted-foreground dark:text-black">사용중</span>
        <span className="stat-value">{activeLockers.length}</span>
        <span className="text-muted-foreground dark:text-black">개</span>
      </div>
      <div className="entry-stat-chip">
        <span className="text-muted-foreground dark:text-black">방문객</span>
        <span className="stat-value">{summary?.totalVisitors || 0}</span>
        <span className="text-muted-foreground dark:text-black">명</span>
      </div>
      <div className="entry-stat-chip" data-testid="chip-extended-guest-count">
        <span className="text-muted-foreground dark:text-black">연장객</span>
        <span className="stat-value">{extendedGuestCount}</span>
        <span className="text-muted-foreground dark:text-black">명</span>
      </div>
    </div>
  );

  const renderLockerGrid = (isFullWidth: boolean = false) => (
    <div className={`flex-1 min-h-0 overflow-auto entry-mgmt-surface ${isFullWidth ? 'p-8' : 'p-6'}`}>
      {lockerGroups.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <p>락커 그룹이 설정되지 않았습니다.</p>
          <p className="text-sm mt-2">설정 페이지에서 락커 그룹을 추가해주세요.</p>
        </div>
      ) : (
        <div className="space-y-8 w-full">
          {lockerGroups.map((group) => (
            <div key={group.id} className="w-full">
              <h3 className={`locker-group-title text-base font-semibold tracking-tight text-foreground/90 ${isFullWidth ? "justify-center" : ""}`}>
                {group.name}
                {overviewMode && <span className="text-xs font-normal text-muted-foreground">(전체보기: H)</span>}
              </h3>
              <div className={`grid w-full ${
                overviewMode 
                  ? "grid-cols-12 gap-2.5" 
                  : isFullWidth 
                    ? "grid-cols-8 gap-3.5" 
                    : "grid-cols-8 gap-2.5 max-w-4xl"
              }`}>
                {Array.from(
                  { length: group.endNumber - group.startNumber + 1 },
                  (_, i) => group.startNumber + i
                ).map((num) => (
                  <LockerButton
                    key={num}
                    number={num}
                    status={lockerStates[num] || 'empty'}
                    additionalFeeCount={additionalFeeCounts[num] || 0}
                    timeType={lockerTimeTypes[num] || 'day'}
                    entryTime={lockerEntryTimes[num]}
                    businessDayStartHour={businessDayStartHour}
                    onClick={() => handleLockerClick(num)}
                    isExpanded={isFullWidth}
                    parentLocker={lockerParents[num] || null}
                    deferredPayment={lockerDeferredPayments[num] || false}
                    customerMemo={lockerCustomerMemos[num] || ''}
                    isOuting={lockerOutingStatus[num] || false}
                    outingExceeded={lockerOutingExceeded[num] || false}
                    isStaff={lockerStaffStatus[num] || false}
                    isLongTerm={lockerLongTermStatus[num] || false}
                    checkoutWarning={lockerCheckoutWarning[num] || false}
                    outOfService={disabledLockers.has(num)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // 오늘현황 + 매출집계 렌더링 함수 (탭 모드용 - 좌우 배치 with 반응형 분리선)
  const renderTodayStatusWithSales = () => (
    <div className="h-full overflow-hidden flex flex-col">
      <TodayStatusTable
        entries={todayEntries}
        yesterdayEntries={yesterdayEntries}
        yesterdayBusinessDay={yesterdayBusinessDay}
        isExpanded={true}
        onReverseCheckout={handleReverseCheckout}
        onRowClick={(entry) => {
          const existingEntry = activeLockers.find(log => log.lockerNumber === entry.lockerNumber);
          if (existingEntry) {
            setOpenDialogs(prev => upsertLockerDialog(prev, {
              lockerNumber: entry.lockerNumber,
              timeType: existingEntry.timeType,
              basePrice: existingEntry.basePrice
            }));
            setPopupsVisible(true);
          }
        }}
        isLockerPanelCollapsed={false}
        onToggleLockerPanel={() => {}}
        hideToggleButton={true}
      />
    </div>
  );

  return (
    <div className="flex-1 min-h-0 w-full bg-background flex flex-col">
      {/* 탭 모드 UI */}
      {uiLayoutMode === 'tab' ? (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* 탭 헤더 */}
          <div className="entry-mgmt-header flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-4">
              <TabsList className="bg-muted/60 shadow-2xs dark:bg-transparent dark:shadow-none dark:border dark:border-gray-400 dark:text-gray-400">
                <TabsTrigger
                  value="locker"
                  data-testid="tab-locker"
                  className="dark:data-[state=active]:bg-transparent dark:data-[state=active]:shadow-none dark:data-[state=active]:text-white dark:text-gray-400"
                >
                  입실 관리
                </TabsTrigger>
                <TabsTrigger
                  value="status"
                  data-testid="tab-status"
                  className="dark:data-[state=active]:bg-transparent dark:data-[state=active]:shadow-none dark:data-[state=active]:text-white dark:text-gray-400"
                >
                  오늘현황
                </TabsTrigger>
                <TabsTrigger
                  value="sales"
                  data-testid="tab-sales"
                  className="dark:data-[state=active]:bg-transparent dark:data-[state=active]:shadow-none dark:data-[state=active]:text-white dark:text-gray-400"
                >
                  매출집계
                </TabsTrigger>
              </TabsList>
              <LiveClock />
            </div>
            <div className="flex items-center gap-2">
              {activeTab === 'locker' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpenseDialogOpen(true)}
                  data-testid="button-quick-expense-tab"
                  className="bg-card/80 shadow-2xs"
                >
                  <Receipt className="h-4 w-4 mr-2" />
                  지출입력
                </Button>
              )}
              {activeTab === 'locker' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation('/staff-logs')}
                  data-testid="button-staff-logs-tab"
                  className={paydayAlert.alerting ? "animate-payday-blink" : "bg-card/80 shadow-2xs"}
                >
                  <Users className="h-4 w-4 mr-2" />
                  직원근무
                </Button>
              )}
              {nfcSupported && activeTab === 'locker' && (
                <Button
                  variant={isNfcScanning ? "default" : "outline"}
                  size="sm"
                  onClick={handleNfcScan}
                  data-testid="button-nfc-scan-tab"
                  className={`text-xs ${isNfcScanning ? "" : "bg-card/80 shadow-2xs"}`}
                >
                  {isNfcScanning ? "감지 중지" : "자동감지"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLayoutModeChange('toggle')}
                data-testid="button-mode-toggle"
                title="토글 모드로 전환"
                className="bg-card/80 shadow-2xs"
              >
                <Columns className="h-4 w-4 mr-1" />
                토글모드
              </Button>
            </div>
          </div>

          {/* 입실 관리 탭 */}
          <TabsContent value="locker" className="flex-1 min-h-0 flex flex-col mt-0 overflow-hidden data-[state=active]:flex">
            {/* 락카 상태 정보 */}
            <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border/70 bg-muted/40">
              {renderLockerStats()}
              {renderLockerLegend(false, true)}
            </div>
            {renderLockerGrid(true)}
          </TabsContent>

          {/* 오늘현황 탭 */}
          <TabsContent value="status" className="flex-1 flex flex-col mt-0 overflow-hidden data-[state=active]:flex">
            {renderTodayStatusWithSales()}
          </TabsContent>

          {/* 매출집계 탭 */}
          <TabsContent value="sales" className="flex-1 flex flex-col mt-0 overflow-auto data-[state=active]:flex">
            <div className="p-6">
              <SalesSummary
                date={getBusinessDay(new Date(), businessDayStartHour)}
                totalVisitors={summary?.totalVisitors || 0}
                totalSales={summary?.totalSales || 0}
                totalRefunds={summary?.totalRefunds || 0}
                cancellations={summary?.cancellations || 0}
                foreignerCount={summary?.foreignerCount || 0}
                dayVisitors={summary?.dayVisitors || 0}
                nightVisitors={summary?.nightVisitors || 0}
                additionalFeeSales={additionalFeeSales}
                rentalRevenue={rentalRevenue}
                totalExpenses={totalExpenses}
                onExpenseAdded={loadData}
                isCollapsed={false}
                onToggleCollapse={() => {}}
              />
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        /* 토글 모드 UI (기존) */
        <ResizablePanelGroup 
          direction="horizontal" 
          className="h-full"
          key={`panel-group-${isPanelCollapsed}-${isLockerPanelCollapsed}`}
        >
          {/* Left Panel - Collapsible */}
          {!isPanelCollapsed && (
            <>
              <ResizablePanel 
                defaultSize={isLockerPanelCollapsed ? 100 : 40} 
                minSize={20} 
                maxSize={isLockerPanelCollapsed ? 100 : 70}
                className="flex flex-col"
              >
                <div className="h-full border-r border-border/70 flex flex-col bg-muted/30">
                  {/* Today Status */}
                  <div className={`border-b border-border/70 overflow-hidden ${isSalesSummaryCollapsed ? 'flex-1' : 'flex-[3]'}`}>
                    <TodayStatusTable
                      entries={todayEntries}
                      yesterdayEntries={yesterdayEntries}
                      yesterdayBusinessDay={yesterdayBusinessDay}
                      isExpanded={isLockerPanelCollapsed}
                      onReverseCheckout={handleReverseCheckout}
                      onRowClick={(entry) => {
                        // Add to openDialogs for multi-popup display
                        const existingEntry = activeLockers.find(log => log.lockerNumber === entry.lockerNumber);
                        if (existingEntry) {
                          setOpenDialogs(prev => upsertLockerDialog(prev, {
                            lockerNumber: entry.lockerNumber,
                            timeType: existingEntry.timeType,
                            basePrice: existingEntry.basePrice
                          }));
                          // Show popup workspace
                          setPopupsVisible(true);
                        }
                      }}
                      isLockerPanelCollapsed={isLockerPanelCollapsed}
                      onToggleLockerPanel={handleToggleLockerPanel}
                    />
                  </div>

                  {/* Sales Summary */}
                  {!isSalesSummaryCollapsed && (
                    <div className="flex-[2] p-6 overflow-auto bg-gradient-to-b from-transparent to-muted/20">
                      <SalesSummary
                        date={getBusinessDay(new Date(), businessDayStartHour)}
                        totalVisitors={summary?.totalVisitors || 0}
                        totalSales={summary?.totalSales || 0}
                        totalRefunds={summary?.totalRefunds || 0}
                        cancellations={summary?.cancellations || 0}
                        foreignerCount={summary?.foreignerCount || 0}
                        dayVisitors={summary?.dayVisitors || 0}
                        nightVisitors={summary?.nightVisitors || 0}
                        additionalFeeSales={additionalFeeSales}
                        rentalRevenue={rentalRevenue}
                        totalExpenses={totalExpenses}
                        onExpenseAdded={loadData}
                        isCollapsed={isSalesSummaryCollapsed}
                        onToggleCollapse={() => setIsSalesSummaryCollapsed(!isSalesSummaryCollapsed)}
                      />
                  </div>
                )}

                {/* Sales Summary Collapsed Toggle Button */}
                {isSalesSummaryCollapsed && (
                  <div className="p-3 border-t border-border/70">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsSalesSummaryCollapsed(false)}
                      className="w-full bg-card/80 shadow-2xs"
                      data-testid="button-expand-sales"
                    >
                      <ChevronDown className="h-4 w-4 mr-2" />
                      매출집계 펼치기
                    </Button>
                  </div>
                )}
              </div>
            </ResizablePanel>
            {!isLockerPanelCollapsed && <ResizableHandle withHandle />}
          </>
        )}

        {/* Right Panel - Locker Grid */}
        {!isLockerPanelCollapsed && (
          <ResizablePanel defaultSize={isPanelCollapsed ? 100 : 60} className="flex flex-col">
        {/* Header */}
        <div className="entry-mgmt-header px-6 py-4">
          {/* 1행: 햄버거 + 날짜/시간 (좌측) | 입실 관리 (우측) */}
          <div className="flex items-center justify-between gap-3 mb-3.5">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleTogglePanel}
                data-testid="button-toggle-panel"
                className="rounded-xl hover:bg-muted/80"
              >
                {isPanelCollapsed ? <Menu className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
              </Button>
              <LiveClock />
            </div>
            <div className="flex items-center gap-2">
              {nfcSupported && (
                <Button
                  variant={isNfcScanning ? "default" : "outline"}
                  size="sm"
                  onClick={handleNfcScan}
                  data-testid="button-nfc-scan"
                  className={`text-xs ${isNfcScanning ? "" : "bg-card/80 shadow-2xs"}`}
                >
                  {isNfcScanning ? "감지 중지" : "자동감지"}
                </Button>
              )}
              {showBarcodeTest && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBarcodeTestDialogOpen(true)}
                  data-testid="button-barcode-test"
                  className="text-xs bg-card/80 shadow-2xs"
                >
                  바코드테스트
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLayoutModeChange('tab')}
                data-testid="button-mode-tab"
                title="탭 모드로 전환"
                className="text-xs bg-card/80 shadow-2xs"
              >
                <LayoutGrid className="h-4 w-4 mr-1" />
                탭모드
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpenseDialogOpen(true)}
                data-testid="button-quick-expense-header"
                className="bg-card/80 shadow-2xs"
              >
                <Receipt className="h-4 w-4 mr-2" />
                지출입력
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation('/staff-logs')}
                data-testid="button-staff-logs-header"
                className={paydayAlert.alerting ? "animate-payday-blink" : "bg-card/80 shadow-2xs"}
              >
                <Users className="h-4 w-4 mr-2" />
                직원근무
              </Button>
              <h1 
                className="text-xl font-semibold tracking-tight cursor-pointer select-none pl-1" 
                onClick={handleTitleClick}
                data-testid="title-entry-management"
              >
                입실 관리
              </h1>
            </div>
          </div>
          
          {/* 2행: 사용중 락카수/총방문인원 (좌측) | 범례 (우측) */}
          <div className="flex items-center justify-between gap-3">
            <div className="ml-12">
              {renderLockerStats()}
            </div>
            {renderLockerLegend(true, false)}
          </div>
        </div>

          {/* Locker Grid */}
          <div 
            className={`flex-1 min-h-0 overflow-auto entry-mgmt-surface ${isPanelCollapsed && !overviewMode ? 'p-8' : 'p-6'}`}
          >
          {lockerGroups.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p>락커 그룹이 설정되지 않았습니다.</p>
              <p className="text-sm mt-2">설정 페이지에서 락커 그룹을 추가해주세요.</p>
            </div>
          ) : (
            <div className="space-y-8 w-full">
              {lockerGroups.map((group) => (
                <div key={group.id} className="w-full">
                  <h3 className={`locker-group-title text-base font-semibold tracking-tight text-foreground/90 ${isPanelCollapsed && !overviewMode ? "justify-center" : ""}`}>
                    {group.name}
                    {overviewMode && <span className="text-xs font-normal text-muted-foreground">(전체보기: H)</span>}
                  </h3>
                  <div className={`grid w-full ${
                    overviewMode 
                      ? "grid-cols-12 gap-2.5" 
                      : isPanelCollapsed 
                        ? "grid-cols-8 gap-3.5" 
                        : "grid-cols-8 gap-2.5 max-w-4xl"
                  }`}>
                    {Array.from(
                      { length: group.endNumber - group.startNumber + 1 },
                      (_, i) => group.startNumber + i
                    ).map((num) => (
                      <LockerButton
                        key={num}
                        number={num}
                        status={lockerStates[num] || 'empty'}
                        additionalFeeCount={additionalFeeCounts[num] || 0}
                        timeType={lockerTimeTypes[num] || 'day'}
                        entryTime={lockerEntryTimes[num]}
                        businessDayStartHour={businessDayStartHour}
                        onClick={() => handleLockerClick(num)}
                        isExpanded={isPanelCollapsed && !overviewMode}
                        parentLocker={lockerParents[num] || null}
                        deferredPayment={lockerDeferredPayments[num] || false}
                        customerMemo={lockerCustomerMemos[num] || ''}
                        isOuting={lockerOutingStatus[num] || false}
                        outingExceeded={lockerOutingExceeded[num] || false}
                        isStaff={lockerStaffStatus[num] || false}
                        isLongTerm={lockerLongTermStatus[num] || false}
                        checkoutWarning={lockerCheckoutWarning[num] || false}
                        outOfService={disabledLockers.has(num)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
          </ResizablePanel>
        )}
      </ResizablePanelGroup>
      )}

      {/* Multi-Popup Workspace - Docked or Floating Mode */}
      {/* display:none으로 숨김 (언마운트 X) → 결제방식 등 내부 state 보존 */}
      {openDialogs.size > 0 && (
        <div
          ref={workspaceRef}
          data-workspace-root="true"
          className={`locker-workspace-shell z-50 flex flex-col min-w-0 ${
            settings.lockerWorkspaceStyle === 'basic' ? 'style-basic' : ''
          } ${
            isFloatingMode
              ? "fixed rounded-[1.35rem]"
              : dockedSide === 'right'
                ? "fixed right-0 top-0 bottom-0"
                : "fixed left-0 top-0 bottom-0"
          }`}
          style={isFloatingMode ? {
            left: floatingPosition.x,
            top: floatingPosition.y,
            width: floatingSize.width,
            height: floatingSize.height,
            display: popupsVisible ? undefined : 'none',
          } : {
            width: dockedWidth,
            display: popupsVisible ? undefined : 'none',
          }}
        >
          {isFloatingMode ? (
            <>
              <div className="absolute top-0 left-3 right-3 h-3 cursor-ns-resize z-[60]" data-workspace-resize="true" onMouseDown={(e) => handleResizePointerDown('n', e)} onTouchStart={(e) => handleResizePointerDown('n', e)} title="높이 조절" />
              <div className="absolute bottom-0 left-3 right-3 h-3 cursor-ns-resize z-[60]" data-workspace-resize="true" onMouseDown={(e) => handleResizePointerDown('s', e)} onTouchStart={(e) => handleResizePointerDown('s', e)} title="높이 조절" />
              <div className="absolute left-0 top-3 bottom-3 w-3 cursor-ew-resize z-[60]" data-workspace-resize="true" onMouseDown={(e) => handleResizePointerDown('w', e)} onTouchStart={(e) => handleResizePointerDown('w', e)} title="너비 조절" />
              <div className="absolute right-0 top-3 bottom-3 w-3 cursor-ew-resize z-[60]" data-workspace-resize="true" onMouseDown={(e) => handleResizePointerDown('e', e)} onTouchStart={(e) => handleResizePointerDown('e', e)} title="너비 조절" />
              <ResizeEdgeGrip edge="n" onDown={handleResizePointerDown} testId="workspace-resize-n" dataWorkspaceResize tone="glass" />
              <ResizeEdgeGrip edge="s" onDown={handleResizePointerDown} testId="workspace-resize-s" dataWorkspaceResize tone="glass" />
              <ResizeEdgeGrip edge="w" onDown={handleResizePointerDown} testId="workspace-resize-w" dataWorkspaceResize tone="glass" />
              <ResizeEdgeGrip edge="e" onDown={handleResizePointerDown} testId="workspace-resize-e" dataWorkspaceResize tone="glass" />
              <ResizeEdgeGrip edge="nw" onDown={handleResizePointerDown} testId="workspace-resize-nw" dataWorkspaceResize tone="glass" />
              <ResizeEdgeGrip edge="ne" onDown={handleResizePointerDown} testId="workspace-resize-ne" dataWorkspaceResize tone="glass" />
              <ResizeEdgeGrip edge="sw" onDown={handleResizePointerDown} testId="workspace-resize-sw" dataWorkspaceResize tone="glass" />
              <ResizeEdgeGrip edge="se" onDown={handleResizePointerDown} testId="workspace-resize-se" dataWorkspaceResize tone="glass" />
            </>
          ) : (
            <>
              <div
                className={`absolute top-0 bottom-0 z-[60] w-3 cursor-ew-resize touch-none ${
                  dockedSide === 'right' ? 'left-0' : 'right-0'
                }`}
                data-workspace-resize="true"
                onMouseDown={(e) => handleResizePointerDown('dock', e)}
                onTouchStart={(e) => handleResizePointerDown('dock', e)}
                title="너비 조절"
                data-testid="workspace-dock-resize"
              />
              <DockResizeGrip
                side={dockedSide}
                onDown={(e) => handleResizePointerDown('dock', e)}
                testId="workspace-dock-resize-grip"
                dataWorkspaceResize
                tone="glass"
              />
            </>
          )}
          {/* Workspace Header */}
          <div 
            className={`locker-workspace-header flex flex-wrap items-center justify-between gap-2 px-4 py-3 min-w-0 ${
              isFloatingMode ? "cursor-move rounded-t-[1.35rem]" : ""
            }`}
            onMouseDown={isFloatingMode ? handleFloatingDragStart : undefined}
            onTouchStart={isFloatingMode ? handleFloatingTouchStart : undefined}
          >
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              {isFloatingMode && <Move className="w-4 h-4 opacity-60 shrink-0" />}
              <h3 className="font-semibold text-lg truncate">처리중인 고객</h3>
              <span className="locker-workspace-count-badge px-2 py-1 rounded-full text-sm font-bold">
                {openDialogs.size}명
              </span>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              {openDialogs.size > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOpenDialogs(prev => {
                        const next = new Map(prev);
                        for (const [num, info] of Array.from(next.entries())) {
                          next.set(num, { ...info, isMinimized: false });
                        }
                        return next;
                      });
                    }}
                    className="locker-workspace-header-btn text-white/90 hover:bg-white/15 gap-1"
                    title="모든 락카 옵션창 펼치기"
                    data-testid="button-expand-all-locker-dialogs"
                  >
                    <ChevronDown className="w-4 h-4" />
                    일괄 펼치기
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOpenDialogs(prev => {
                        const next = new Map(prev);
                        for (const [num, info] of Array.from(next.entries())) {
                          next.set(num, { ...info, isMinimized: true });
                        }
                        return next;
                      });
                    }}
                    className="locker-workspace-header-btn text-white/90 hover:bg-white/15 gap-1"
                    title="모든 락카 옵션창 접기"
                    data-testid="button-collapse-all-locker-dialogs"
                  >
                    <ChevronUp className="w-4 h-4" />
                    일괄 접기
                  </Button>
                </>
              )}
              {!isFloatingMode && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleDockedSide}
                  className="locker-workspace-header-btn text-white/90 hover:bg-white/15"
                  title={dockedSide === 'right' ? '좌측으로 이동' : '우측으로 이동'}
                  data-testid="button-toggle-docked-side"
                >
                  {dockedSide === 'right' ? <PanelLeft className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={toggleFloatingMode}
                className="locker-workspace-header-btn text-white/90 hover:bg-white/15"
                title={isFloatingMode ? "우측 도킹" : "플로팅 모드"}
                data-testid="button-toggle-floating"
              >
                {isFloatingMode ? <PanelRight className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setPopupsVisible(false)}
                className="locker-workspace-header-btn text-white/90 hover:bg-white/15"
                title="임시로 숨기기"
              >
                ⊟
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setOpenDialogs(new Map())}
                className="locker-workspace-header-btn text-white/90 hover:bg-white/15"
                title="모두 닫기 (ESC)"
              >
                ✕
              </Button>
            </div>
          </div>
          
          {/* Scrollable Popup Stack - 최근 선택 순으로 역순 표시 (나중에 선택한 락카가 위에) */}
          <div className="locker-workspace-body flex-1 overflow-y-auto p-4 space-y-4">
            {Array.from(openDialogs.entries()).reverse().map(([lockerNumber, dialogInfo]) => {
              const selectedEntry = activeLockers.find(log => log.lockerNumber === lockerNumber);
              const newLockerInfo = dialogInfo.newLockerInfo;
              
              return (
                <div
                  key={lockerNumber}
                  className="locker-opt-popup-shell overflow-hidden min-w-0"
                  style={{ minHeight: dialogInfo.isMinimized ? '60px' : 'min(500px, calc(100% - 1rem))' }}
                >
                  {dialogInfo.isMinimized ? (
                    // Minimized view
                    <div 
                      className="locker-opt-minimized flex items-center justify-between px-4 py-3 cursor-pointer"
                      onClick={() => {
                        setOpenDialogs(prev => {
                          const info = prev.get(lockerNumber);
                          if (!info) return prev;
                          return upsertLockerDialog(prev, {
                            lockerNumber: info.lockerNumber,
                            timeType: info.timeType,
                            basePrice: info.basePrice,
                            newLockerInfo: info.newLockerInfo,
                          });
                        });
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="locker-opt-badge locker-opt-badge-sm flex items-center justify-center shrink-0 rounded-2xl font-bold tabular-nums">
                          {lockerNumber}
                        </div>
                        <div>
                          <p className="font-semibold">{lockerNumber}번 락카</p>
                          <p className="text-sm text-muted-foreground">
                            {selectedEntry ? '사용중' : '신규 입실'}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">
                        펼치기 ▼
                      </Button>
                    </div>
                  ) : (
                    // Full view - 헤더는 LockerOptionsDialog 내부에서 표시
                    <div className="flex flex-col h-full">
                      <div className="flex-1 overflow-hidden">
                        <LockerOptionsDialog
                          open={true}
                          onClose={() => {
                            setOpenDialogs(prev => {
                              const next = new Map(prev);
                              next.delete(lockerNumber);
                              return next;
                            });
                            loadData(); // 다이얼로그 닫힐 때 데이터 새로고침 (후불결제 완료 등 반영)
                          }}
                          lockerNumber={lockerNumber}
                          basePrice={selectedEntry?.basePrice || newLockerInfo?.basePrice || 0}
                          timeType={selectedEntry?.timeType || newLockerInfo?.timeType || '주간'}
                          entryTime={selectedEntry?.entryTime}
                          currentNotes={selectedEntry?.notes}
                          currentPaymentMethod={selectedEntry?.paymentMethod}
                          currentPaymentCash={selectedEntry?.paymentCash}
                          currentPaymentCard={selectedEntry?.paymentCard}
                          currentPaymentTransfer={selectedEntry?.paymentTransfer}
                          currentOptionType={selectedEntry?.optionType}
                          currentOptionAmount={selectedEntry?.optionAmount}
                          currentFinalPrice={selectedEntry?.finalPrice}
                          discountAmount={discountAmount}
                          foreignerPrice={foreignerPrice}
                          dayPrice={dayPrice}
                          nightPrice={nightPrice}
                          isInUse={!!selectedEntry}
                          currentLockerLogId={selectedEntry?.id}
                          currentDeferredPayment={(selectedEntry as any)?.deferredPayment || false}
                          currentCustomerMemo={(selectedEntry as any)?.customerMemo || ""}
                          currentNoAdditionalFee={(selectedEntry as any)?.noAdditionalFee || false}
                          currentPrepaidAdditionalFee={(selectedEntry as any)?.prepaidAdditionalFee || 0}
                          currentPrepaidAdditionalFeeCash={(selectedEntry as any)?.prepaidAdditionalFeeCash || 0}
                          currentPrepaidAdditionalFeeCard={(selectedEntry as any)?.prepaidAdditionalFeeCard || 0}
                          currentPrepaidAdditionalFeeTransfer={(selectedEntry as any)?.prepaidAdditionalFeeTransfer || 0}
                          currentIsCashReceipt={(selectedEntry as any)?.isCashReceipt || false}
                          currentAdditionalFeePaymentMethod={(selectedEntry as any)?.additionalFeePaymentMethod}
                          currentIsStaff={!!(selectedEntry as any)?.isStaff}
                          currentIsLongTerm={!!(selectedEntry as any)?.isLongTerm}
                          currentPlannedCheckoutAt={(selectedEntry as any)?.plannedCheckoutAt || undefined}
                          currentLongTermDailyFee={(selectedEntry as any)?.longTermDailyFee}
                          currentLongTermDiscount={(selectedEntry as any)?.longTermDiscount}
                          isOuting={lockerOutingStatus[lockerNumber] || false}
                          onToggleOuting={(_newIsOuting, _newMemo) => {
                            loadData();
                          }}
                          onApply={(option, customAmount, notes, paymentMethod, rentalItems, paymentCash, paymentCard, paymentTransfer, deferredPayment, customerMemo, noAdditionalFee, prepaidAdditionalFee, isCashReceipt, additionalFeePaymentMethod, isStaff, editedEntryTime, longTermStay, prepaidAdditionalFeeCash, prepaidAdditionalFeeCard, prepaidAdditionalFeeTransfer) =>
                            handleApplyOption(lockerNumber, option, customAmount, notes, paymentMethod, rentalItems, paymentCash, paymentCard, paymentTransfer, deferredPayment, customerMemo, noAdditionalFee, prepaidAdditionalFee, isCashReceipt, additionalFeePaymentMethod, isStaff, editedEntryTime, longTermStay, prepaidAdditionalFeeCash, prepaidAdditionalFeeCard, prepaidAdditionalFeeTransfer)
                          }
                          onCheckout={(paymentMethod, rentalItems, paymentCash, paymentCard, paymentTransfer, additionalFeePayment, customerMemo, refundAmount, refundNote, refundMethod, exitTimeISO) => 
                            handleCheckout(lockerNumber, paymentMethod, rentalItems, paymentCash, paymentCard, paymentTransfer, additionalFeePayment, customerMemo, refundAmount, refundNote, refundMethod, exitTimeISO)
                          }
                          onCancel={() => handleCancel(lockerNumber)}
                          onSwap={(fromLocker, toLocker) => handleSwap(lockerNumber, toLocker)}
                          onPaymentComplete={() => loadData()}
                          onMinimize={() => {
                            setOpenDialogs(prev => {
                              const next = new Map(prev);
                              const info = next.get(lockerNumber);
                              if (info) {
                                next.set(lockerNumber, { ...info, isMinimized: true });
                              }
                              return next;
                            });
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating "Show Workspace" Button - Only visible when popups are hidden */}
      {openDialogs.size > 0 && !popupsVisible && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            size="lg"
            onClick={() => setPopupsVisible(true)}
            className="shadow-2xl px-6 py-6 text-base font-semibold"
            data-testid="button-show-workspace"
          >
            <span className="flex items-center gap-2">
              📋 작업공간 보기
              <span className="px-2 py-1 rounded-full bg-primary-foreground text-primary text-sm font-bold ml-2">
                {openDialogs.size}
              </span>
            </span>
          </Button>
        </div>
      )}

      {/* Settlement Reminder Dialog */}
      <AlertDialog open={settlementReminderOpen} onOpenChange={setSettlementReminderOpen}>
        <AlertDialogContent data-testid="dialog-settlement-reminder">
          <AlertDialogHeader>
            <AlertDialogTitle>정산 시간 알림</AlertDialogTitle>
            <AlertDialogDescription>
              오늘 {businessDayStartHour}시 정산 시간입니다.
              <br />
              어제 영업 내역을 확인하고 정산을 완료해주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-reminder-later">나중에</AlertDialogCancel>
            <AlertDialogAction 
              data-testid="button-go-closing"
              onClick={() => {
                setSettlementReminderOpen(false);
                setLocation('/closing');
              }}
            >
              정산하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Child Locker Alert Dialog */}
      <AlertDialog open={childLockerAlertOpen} onOpenChange={setChildLockerAlertOpen}>
        <AlertDialogContent data-testid="dialog-child-locker-alert">
          <AlertDialogHeader>
            <AlertDialogTitle>묶인 락카 안내</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="text-base">
                이 락카는 <span className="font-semibold text-primary">{childLockerParent}번 락카</span>에 묶여 있습니다.
              </p>
              <p className="text-sm text-muted-foreground">
                묶인 락카는 요금 없이 사용되며, {childLockerParent}번 락카 퇴실 시 자동으로 함께 퇴실됩니다.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setChildLockerAlertOpen(false)}
              data-testid="button-child-locker-cancel"
            >
              닫기
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlinkChildLocker}
              data-testid="button-child-locker-unlink"
              className="bg-destructive text-destructive-foreground"
            >
              묶기 해제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pattern Lock Dialog for Left Panel Expansion */}
      <PatternLockDialog
        open={showPatternDialog}
        onOpenChange={setShowPatternDialog}
        onPatternCorrect={handlePatternCorrect}
        title="패널 잠금 해제"
        description="패턴을 그려서 오늘현황 및 매출집계 패널을 열어주세요."
        testId="dialog-panel-pattern"
      />

      {/* Pattern Lock Dialog for Tab Switch Security (locker → status) */}
      <PatternLockDialog
        open={showTabAuthDialog}
        onOpenChange={setShowTabAuthDialog}
        onPatternCorrect={handleTabAuthSuccess}
        title="오늘현황 잠금 해제"
        description="매출 정보를 보려면 패턴을 그리거나 비밀번호를 입력하세요."
        testId="dialog-tab-auth"
      />

      {/* Pattern Lock Dialog for Sales Tab Switch Security */}
      <PatternLockDialog
        open={showSalesTabAuthDialog}
        onOpenChange={setShowSalesTabAuthDialog}
        onPatternCorrect={handleSalesTabAuthSuccess}
        title="매출집계 잠금 해제"
        description="매출집계를 보려면 패턴을 그리거나 비밀번호를 입력하세요."
        testId="dialog-sales-tab-auth"
      />

      {/* Pattern Lock Dialog for Layout Mode Change Security (tab → toggle) */}
      <PatternLockDialog
        open={showLayoutModeAuthDialog}
        onOpenChange={setShowLayoutModeAuthDialog}
        onPatternCorrect={handleLayoutModeAuthSuccess}
        title="토글모드 전환"
        description="토글모드로 전환하려면 패턴을 그리거나 비밀번호를 입력하세요."
        testId="dialog-layout-mode-auth"
      />

      {/* Barcode Test Dialog */}
      <Dialog open={barcodeTestDialogOpen} onOpenChange={setBarcodeTestDialogOpen}>
        <DialogContent data-testid="dialog-barcode-test">
          <DialogHeader>
            <DialogTitle>바코드 테스트</DialogTitle>
            <DialogDescription>
              바코드를 입력하여 등록된 락카 번호를 확인할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-barcode-input">바코드 입력</Label>
              <Input
                id="test-barcode-input"
                type="text"
                placeholder="바코드를 입력하세요"
                value={testBarcodeInput}
                onChange={(e) => setTestBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (!testBarcodeInput.trim()) {
                      toast({
                        title: "입력 필요",
                        description: "바코드를 입력해주세요.",
                        variant: "destructive",
                      });
                      return;
                    }
                    
                    // Build current locker parents map
                    const currentLockerParents: { [key: number]: number | null } = {};
                    activeLockers.forEach(log => {
                      currentLockerParents[log.lockerNumber] = log.parentLocker || null;
                    });
                    
                    const success = processScannedBarcode(testBarcodeInput.trim(), currentLockerParents, activeLockers);
                    if (success) {
                      setBarcodeTestDialogOpen(false);
                      setTestBarcodeInput("");
                    }
                  }
                }}
                data-testid="input-test-barcode"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBarcodeTestDialogOpen(false);
                setTestBarcodeInput("");
              }}
              data-testid="button-cancel-test"
            >
              닫기
            </Button>
            <Button
              onClick={() => {
                if (!testBarcodeInput.trim()) {
                  toast({
                    title: "입력 필요",
                    description: "바코드를 입력해주세요.",
                    variant: "destructive",
                  });
                  return;
                }
                
                // Build current locker parents map
                const currentLockerParents: { [key: number]: number | null } = {};
                activeLockers.forEach(log => {
                  currentLockerParents[log.lockerNumber] = log.parentLocker || null;
                });
                
                const success = processScannedBarcode(testBarcodeInput.trim(), currentLockerParents, activeLockers);
                if (success) {
                  setBarcodeTestDialogOpen(false);
                  setTestBarcodeInput("");
                }
              }}
              data-testid="button-test-barcode"
            >
              테스트
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Expense Input Dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              빠른 지출 입력
            </DialogTitle>
            <DialogDescription>
              현재 영업일의 지출을 빠르게 등록합니다.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="expense-item">지출항목</Label>
              <Input
                id="expense-item"
                type="text"
                value={expenseItem}
                onChange={(e) => setExpenseItem(e.target.value)}
                placeholder="지출항목 입력 (예: 음료수, 세제 등)"
                data-testid="input-expense-item"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-amount">금액 (원)</Label>
              <Input
                id="expense-amount"
                type="text"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                placeholder="금액 입력"
                data-testid="input-expense-amount"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-payment">결제방법</Label>
              <Select value={expensePaymentMethod} onValueChange={(v) => setExpensePaymentMethod(v as 'card' | 'cash' | 'transfer')}>
                <SelectTrigger id="expense-payment" data-testid="select-expense-payment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">현금</SelectItem>
                  <SelectItem value="card">카드</SelectItem>
                  <SelectItem value="transfer">계좌이체</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)} data-testid="button-cancel-expense">
              취소
            </Button>
            <Button onClick={handleAddQuickExpense} data-testid="button-submit-expense">
              <Plus className="h-4 w-4 mr-2" />
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
