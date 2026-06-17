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
import { Menu, X, Maximize2, ChevronDown, LayoutGrid, Columns, Receipt, Plus, Move, PanelRight, PanelRightClose, PanelLeft, Users } from "lucide-react";
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
import { getBusinessDay, getBusinessDayRange, getBasePrice, calculateAdditionalFee } from "@shared/businessDay";
import * as localDb from "@/lib/localDb";
import { combinePayments } from "@/lib/utils";
import { isTodayStatusLocked } from "@/lib/menuLock";
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

// 금·토·일 및 한국 공휴일 판정
function isWeekendOrHoliday(date: Date): boolean {
  const day = date.getDay(); // 0=일, 5=금, 6=토
  if (day === 0 || day === 5 || day === 6) return true;

  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = date.getFullYear();

  // 양력 고정 공휴일
  const fixed: [number, number][] = [
    [1, 1],   // 신정
    [3, 1],   // 삼일절
    [5, 5],   // 어린이날
    [6, 6],   // 현충일
    [8, 15],  // 광복절
    [10, 3],  // 개천절
    [10, 9],  // 한글날
    [12, 25], // 크리스마스
  ];
  if (fixed.some(([hm, hd]) => hm === m && hd === d)) return true;

  // 음력 기반 공휴일 (연도별 사전계산)
  const lunar: Record<number, [number, number][]> = {
    2024: [[2,9],[2,10],[2,11],[2,12],[5,15],[9,16],[9,17],[9,18]],
    2025: [[1,28],[1,29],[1,30],[5,6],[10,5],[10,6],[10,7],[10,8]],
    2026: [[2,16],[2,17],[2,18],[2,19],[5,24],[10,1],[10,2],[10,3]],
    2027: [[2,6],[2,7],[2,8],[2,9],[5,13],[9,20],[9,21],[9,22],[9,23]],
  };
  const yearDates = lunar[y];
  if (yearDates && yearDates.some(([hm, hd]) => hm === m && hd === d)) return true;

  return false;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
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
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [lockerGroups, setLockerGroups] = useState<LockerGroup[]>([]);
  const [newLockerInfo, setNewLockerInfo] = useState<{lockerNumber: number, timeType: '주간' | '야간', basePrice: number} | null>(null);
  const [additionalFeeSales, setAdditionalFeeSales] = useState<number>(0);
  const [rentalRevenue, setRentalRevenue] = useState<number>(0);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  
  // Panel collapse state
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [isLockerPanelCollapsed, setIsLockerPanelCollapsed] = useState(false);
  const [isSalesSummaryCollapsed, setIsSalesSummaryCollapsed] = useState(false);
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
  const [floatingPosition, setFloatingPosition] = useState(() => {
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
  const [floatingSize, setFloatingSize] = useState(() => {
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
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  
  // UI Layout Mode: 'toggle' (기존 토글 방식) or 'tab' (탭 전환 방식)
  const [uiLayoutMode, setUiLayoutMode] = useState<'toggle' | 'tab'>(() => {
    const saved = localStorage.getItem('uiLayoutMode');
    return (saved === 'tab' || saved === 'toggle') ? saved : 'toggle';
  });
  const [activeTab, setActiveTab] = useState<'locker' | 'status'>('locker');
  
  // Tab security: require authentication when switching to 'status' tab
  const [showTabAuthDialog, setShowTabAuthDialog] = useState(false);
  
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
  const domesticCheckpointHour = settings.domesticCheckpointHour;
  const foreignerAdditionalFeePeriod = settings.foreignerAdditionalFeePeriod;
  const domesticAdditionalFeeMode: 'nextday' | 'nightstart' = (settings as any).domesticAdditionalFeeMode || 'nextday';
  const nightStartHour = parseInt(((settings as any).nightStartTime || '19:00').split(':')[0], 10);
  const outingTimeLimitMinutes: number = (settings as any).outingTimeLimitMinutes || 0;
  const outingTimeLimitWeekendMinutes: number = (settings as any).outingTimeLimitWeekendMinutes || 0;
  
  // Toggle left panel (Today Status + Sales Summary) visibility
  const handleTogglePanel = () => {
    if (isPanelCollapsed) {
      if (isTodayStatusLocked()) {
        setShowPatternDialog(true);
      } else {
        setIsPanelCollapsed(false);
      }
    } else {
      setIsPanelCollapsed(true);
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
      // 탭 모드: 입실관리 탭이 기본
      setActiveTab('locker');
      setIsPanelCollapsed(false);
      setIsLockerPanelCollapsed(false);
    } else {
      // 토글 모드: 좌측 패널 접기 (입실관리만 표시), 매출집계 접힌 상태
      setIsPanelCollapsed(true);
      setIsLockerPanelCollapsed(false);
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
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - floatingPosition.x,
      y: e.clientY - floatingPosition.y
    };
    e.preventDefault();
  }, [floatingPosition]);

  // 플로팅 창 드래그 시작 (터치)
  const handleFloatingTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      const touch = e.touches[0];
      dragOffsetRef.current = {
        x: touch.clientX - floatingPosition.x,
        y: touch.clientY - floatingPosition.y
      };
    }
  }, [floatingPosition]);

  // 플로팅 창 드래그 중 (마우스)
  const handleFloatingDragMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    
    // 패널이 화면 밖으로 나가지 않도록 클램핑 (패널 높이 고려)
    const newX = Math.max(0, Math.min(window.innerWidth - floatingSize.width, e.clientX - dragOffsetRef.current.x));
    const newY = Math.max(0, Math.min(window.innerHeight - floatingSize.height, e.clientY - dragOffsetRef.current.y));
    
    setFloatingPosition({ x: newX, y: newY });
  }, [floatingSize.width, floatingSize.height]);

  // 플로팅 창 드래그 중 (터치)
  const handleFloatingTouchMove = useCallback((e: TouchEvent) => {
    if (!isDraggingRef.current || e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    const newX = Math.max(0, Math.min(window.innerWidth - floatingSize.width, touch.clientX - dragOffsetRef.current.x));
    const newY = Math.max(0, Math.min(window.innerHeight - floatingSize.height, touch.clientY - dragOffsetRef.current.y));
    
    setFloatingPosition({ x: newX, y: newY });
    e.preventDefault(); // 스크롤 방지
  }, [floatingSize.width, floatingSize.height]);

  // 플로팅 창 드래그 종료
  const handleFloatingDragEnd = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      // 위치 저장
      localStorage.setItem('workspaceFloatingPosition', JSON.stringify(floatingPosition));
    }
  }, [floatingPosition]);

  // 플로팅 창 드래그 이벤트 리스너 (마우스 + 터치)
  useEffect(() => {
    if (isFloatingMode) {
      // 마우스 이벤트
      window.addEventListener('mousemove', handleFloatingDragMove);
      window.addEventListener('mouseup', handleFloatingDragEnd);
      // 터치 이벤트
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
    }
  }, [isFloatingMode, handleFloatingDragMove, handleFloatingTouchMove, handleFloatingDragEnd]);

  // Tab change handler with security check
  const handleTabChange = (newTab: string) => {
    const targetTab = newTab as 'locker' | 'status';

    if (activeTab === 'locker' && targetTab === 'status' && isTodayStatusLocked()) {
      setShowTabAuthDialog(true);
    } else {
      setActiveTab(targetTab);
    }
  };

  // Handle successful tab authentication
  const handleTabAuthSuccess = () => {
    setActiveTab('status');
    setShowTabAuthDialog(false);
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
    // No pattern lock - just toggle
    setIsLockerPanelCollapsed(!isLockerPanelCollapsed);
  };
  
  // Pattern verified, expand left panel
  const handlePatternCorrect = () => {
    setIsPanelCollapsed(false);
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
      
      setOpenDialogs(prev => new Map(prev).set(lockerNumber, {
        lockerNumber,
        isMinimized: false,
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
        setOpenDialogs(prev => new Map(prev).set(lockerNumber, {
          lockerNumber,
          isMinimized: false,
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
          
          setOpenDialogs(prev => new Map(prev).set(lockerNumber, {
            lockerNumber,
            isMinimized: false,
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
            setOpenDialogs(prev => new Map(prev).set(lockerNumber, {
              lockerNumber,
              isMinimized: false,
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
      
      const activeData = localDb.getActiveLockers();
      setActiveLockers(activeData);
      activeLockersRef.current = activeData;
      
      
      // 비즈니스 데이 기준으로 입실 기록 조회 (입실 시간 기준)
      const allEntriesFromDb = localDb.getEntriesByEntryTime(businessDay, businessDayStartHour);
      
      // Get additional fee events for today (모든 추가요금: 같은 영업일 + 다른 영업일)
      const additionalFeeEvents = localDb.getAdditionalFeeEventsByBusinessDayRange(businessDay, businessDayStartHour);
      
      // CRITICAL FIX: Only exclude entries with CROSS-DAY additional fees
      // Same-day additional fees should NOT exclude the original entry
      const crossDayAdditionalFeeLogIds = new Set(
        additionalFeeEvents
          .filter(e => {
            const event = e as any;
            return event.entryBusinessDay && event.entryBusinessDay !== e.businessDay;
          })
          .map(e => e.lockerLogId)
      );
      const entries = allEntriesFromDb.filter(entry => !crossDayAdditionalFeeLogIds.has(entry.id));
      
      // Identify same-day additional fee entries for badge display
      const sameDayAdditionalFeeLogIds = new Set(
        additionalFeeEvents
          .filter(e => {
            const event = e as any;
            return event.entryBusinessDay && event.entryBusinessDay === e.businessDay;
          })
          .map(e => e.lockerLogId)
      );
      
      // Create pseudo entries ONLY for CROSS-DAY additional fee events
      // Same-day additional fees are already included in the original entry's row
      const additionalFeeEntries = additionalFeeEvents
        .filter(event => {
          const e = event as any;
          return e.entryBusinessDay && e.entryBusinessDay !== event.businessDay;
        })
        .map(event => {
          return {
            // CRITICAL: Use lockerLogId as the id so reverseCheckout can find the correct record
            id: event.lockerLogId,
            lockerNumber: event.lockerNumber,
            entryTime: null, // Always display empty entry time for additional fees
            exitTime: event.checkoutTime,
            timeType: '추가요금' as any, // Special marker for additional fee
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
            additionalFeeOnly: true, // Always exclude from visitor count (displayed as separate row)
          };
        });
      
      // Add same-day additional fee flag to entries
      const entriesWithFeeFlag = entries.map(entry => ({
        ...entry,
        hasSameDayFee: sameDayAdditionalFeeLogIds.has(entry.id),
      }));
      
      // Combine filtered entries with additional fee entries and sort by time
      // 입실 기록은 entry_time, 추가요금 기록은 checkout_time 기준으로 정렬
      const allEntries = [...entriesWithFeeFlag, ...additionalFeeEntries].sort((a, b) => {
        const timeA = a.exitTime || a.entryTime || '';
        const timeB = b.exitTime || b.entryTime || '';
        return new Date(timeB).getTime() - new Date(timeA).getTime(); // 최신순
      });
      setTodayAllEntries(allEntries);
      
      // Calculate summary from entries that were CHECKED IN today (already filtered by getEntriesByBusinessDayRange)
      // 추가요금만 있는 항목은 방문인원에서 제외 (이전 영업일 입실 고객)
      // 자식 락카(parentLocker가 있는 락카)도 방문인원에서 제외 (한 손님이 여러 락카 사용)
      // 후불결제(deferredPayment = true)는 매출에서 제외 - 결제완료 시점에만 반영
      const activeEntries = entries.filter(e => !e.cancelled && !e.deferredPayment);
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
    const outingStartedAt = (log as any).outingStartedAt || null;
    lockerOutingStartedAt[log.lockerNumber] = outingStartedAt;
    // 외출 시간 초과 여부 계산 (평일/휴일 분리 적용)
    if (!!(log as any).isOuting && outingStartedAt) {
      const effectiveLimit = isWeekendOrHoliday(lockerTickTime)
        ? outingTimeLimitWeekendMinutes
        : outingTimeLimitMinutes;
      if (effectiveLimit > 0) {
        const outingElapsedMs = lockerTickTime.getTime() - new Date(outingStartedAt).getTime();
        lockerOutingExceeded[log.lockerNumber] = outingElapsedMs > effectiveLimit * 60 * 1000;
      } else {
        lockerOutingExceeded[log.lockerNumber] = false;
      }
    } else {
      lockerOutingExceeded[log.lockerNumber] = false;
    }
    
    // 외국인 여부 확인
    const isForeigner = log.optionType === 'foreigner';
    
    // Calculate additional fee for this locker
    const { additionalFee, midnightsPassed, additionalFeeCount } = calculateAdditionalFee(
      log.entryTime,
      log.timeType,
      dayPrice,
      nightPrice,
      lockerTickTime,
      isForeigner,
      foreignerPrice,
      domesticCheckpointHour,
      foreignerAdditionalFeePeriod,
      false,
      domesticAdditionalFeeMode,
      nightStartHour
    );
    
    // 추가요금 완납 여부 확인: 현재 추가요금이 (지불된 금액 + 선지급 금액) 이하면 완납
    const paidAmount = (log as any).additionalFeePaidAmount || 0;
    const prepaidAmount = (log as any).prepaidAdditionalFee || 0;
    const totalPaidAmount = paidAmount + prepaidAmount;
    const hasUnpaidAdditionalFee = additionalFee > totalPaidAmount;
    
    // 미지불 추가요금이 있을 때만 횟수 표시
    additionalFeeCounts[log.lockerNumber] = hasUnpaidAdditionalFee ? additionalFeeCount : 0;
    
    // Store time type (convert Korean to English)
    const convertedTimeType = log.timeType === '주간' ? 'day' : 'night';
    lockerTimeTypes[log.lockerNumber] = convertedTimeType;
  });
  
  // 빈 락커 개수 계산
  const emptyLockerCount = Object.values(lockerStates).filter(state => state === 'empty').length;

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
      setOpenDialogs(prev => new Map(prev).set(lockerNumber, {
        lockerNumber,
        isMinimized: false,
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
          setOpenDialogs(prev => new Map(prev).set(lockerNumber, {
            lockerNumber,
            isMinimized: false,
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
    isStaff?: boolean // 직원 입실 여부
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
      } else if (option === 'direct_price' && customAmount) {
        optionType = 'direct_price';
        finalPrice = customAmount;
        optionAmount = customAmount;
      } else if (option === 'foreigner') {
        optionType = 'foreigner';
        finalPrice = foreignerPrice;
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
        noAdditionalFee: noAdditionalFee || false,  // 추가요금없음 (VIP 등)
        prepaidAdditionalFee: prepaidAdditionalFee || 0,  // 추가요금 선지급
        isCashReceipt: isCashReceipt || false,  // 현금영수증 발행 여부
        additionalFeePaymentMethod: additionalFeePaymentMethod,  // 추가요금 결제방식
        isStaff: isStaff || false,  // 직원 입실 여부
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
            rentalFee: actualRentalFee,  // 부가세 포함 금액 저장
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

    let optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' | 'free' = 'none';
    let finalPrice = selectedEntry.basePrice;
    let optionAmount: number | undefined;

    if (option === 'free') {
      optionType = 'free';
      finalPrice = 0;
      optionAmount = 0;
    } else if (option === 'direct_price' && customAmount) {
      optionType = 'direct_price';
      finalPrice = customAmount;
      optionAmount = customAmount;
    } else if (option === 'foreigner') {
      optionType = 'foreigner';
      finalPrice = foreignerPrice;
    } else if (option === 'discount') {
      optionType = 'discount';
      finalPrice = selectedEntry.basePrice - discountAmount;
      optionAmount = discountAmount;
    } else if (option === 'custom' && customAmount) {
      optionType = 'custom';
      finalPrice = selectedEntry.basePrice - customAmount;
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
      noAdditionalFee: noAdditionalFee || false,  // 추가요금없음 상태 유지
      prepaidAdditionalFee: prepaidAdditionalFee || 0,  // 추가요금 선지급 상태 유지
      isCashReceipt: isCashReceipt || false,  // 현금영수증 발행 여부 유지
      additionalFeePaymentMethod: additionalFeePaymentMethod,  // 추가요금 결제방식 유지
    });
    
    // Handle rental items for existing entry (if saving changes)
    if (rentalItems && rentalItems.length > 0) {
      const businessDay = getBusinessDay(new Date(), businessDayStartHour);
      const existingTransactions = localDb.getRentalTransactionsByLockerLog(selectedEntry.id);
      
      rentalItems.forEach(item => {
        // Check if rental transaction already exists for this item
        const existingItem = existingTransactions.find(t => t.itemId === item.itemId);
        
        // 부가세 포함 금액 사용 (기존 트랜잭션이 있으면 DB의 값 유지, 없으면 새 값 사용)
        // 기존 트랜잭션이 있으면 이미 DB에 VAT 적용된 금액이 저장되어 있음
        const actualRentalFee = existingItem ? existingItem.rentalFee : (item.vatAppliedRentalFee ?? item.rentalFee);
        const actualDepositAmount = existingItem ? existingItem.depositAmount : (item.vatAppliedDepositAmount ?? item.depositAmount);
        
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
            rentalFee: actualRentalFee,  // 부가세 포함 금액 저장
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
          });
        } else {
          // Update existing rental transaction
          // DO NOT recalculate payment - keep existing payment info
          // Only update deposit status, revenue, and return time
          const updateData: any = {
            depositStatus: item.depositStatus,
            revenue: revenue,
          };
          
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
    refundMethod?: 'cash' | 'card' | 'transfer'
  ) => {
    const selectedEntry = activeLockers.find(log => log.lockerNumber === lockerNumber);
    if (!selectedEntry) return;

    const now = new Date();
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
      foreignerPrice,
      domesticCheckpointHour,
      foreignerAdditionalFeePeriod,
      false,
      domesticAdditionalFeeMode,
      nightStartHour
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
    if (additionalFeeInfo.additionalFee > 0) {
      // 할인 계산: 원래 추가요금에서 할인금액 차감
      const discountAmount = additionalFeePayment?.discount || 0;
      // 부가세가 적용된 실제 결제 금액을 additionalFeePayment에서 계산
      const actualFeeAmount = (additionalFeePayment?.cash || 0) + (additionalFeePayment?.card || 0) + (additionalFeePayment?.transfer || 0);
      const discountedFee = actualFeeAmount > 0 ? actualFeeAmount : Math.max(0, additionalFeeInfo.additionalFee - discountAmount);
      
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
        feeAmount: discountedFee,  // 부가세 포함된 실제 결제 금액 기록
        originalFeeAmount: discountAmount > 0 ? additionalFeeInfo.additionalFee : undefined,  // 할인 전 원래 금액
        discountAmount: discountAmount,
        businessDay: checkoutBusinessDay,
        paymentMethod: addFeePayment.method,
        paymentCash: addFeePayment.cash,
        paymentCard: addFeePayment.card,
        paymentTransfer: addFeePayment.transfer,
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
        const existingItem = existingTransactions.find(t => t.itemId === item.itemId);
        
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
            rentalFee: actualRentalFee,  // 부가세 포함 금액 저장
            depositAmount: actualDepositAmount,  // 부가세 포함 금액 저장
            depositStatus: item.depositStatus,
            rentalTime: selectedEntry.entryTime,
            returnTime: now,
            businessDay: checkoutBusinessDay,
            paymentMethod: paymentMethod,
            revenue: itemRevenue,
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

  const todayEntries = todayAllEntries.map(log => ({
    id: log.id,
    lockerNumber: log.lockerNumber,
    entryTime: log.entryTime ? new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : null,
    entryTimeRaw: log.entryTime || null, // 입실시간 원본 ISO 문자열 (정렬용)
    exitTime: log.exitTime || null, // 퇴실시간 (ISO 문자열 그대로 전달 - 정렬용)
    timeType: log.timeType,
    basePrice: log.basePrice,
    option: log.optionType === 'none' ? '없음' : 
            log.optionType === 'discount' ? '할인' :
            log.optionType === 'custom' ? `할인직접` :
            log.optionType === 'direct_price' ? '요금직접' :
            (log.optionType as string) === 'free' ? ((log as any).isStaff ? '직원' : '무료입장') :
            '외국인',
    optionType: log.optionType as 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' | 'free', // 필터용
    finalPrice: log.finalPrice,
    status: log.status,
    cancelled: log.cancelled,
    notes: log.notes,
    paymentMethod: log.paymentMethod,
    paymentCash: log.paymentCash, // 분리결제 표시용
    paymentCard: log.paymentCard, // 분리결제 표시용
    paymentTransfer: log.paymentTransfer, // 분리결제 표시용
    additionalFeeOnly: log.additionalFeeOnly,
    hasSameDayFee: (log as any).hasSameDayFee || false,
    parentLocker: log.parentLocker || null,
    deferredPayment: (log as any).deferredPayment || false,
    refundAmount: (log as any).refundAmount || 0,
    isStaff: (log as any).isStaff || false,
  }));
  
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
  const renderLockerGrid = (isFullWidth: boolean = false) => (
    <div className={`flex-1 overflow-auto ${isFullWidth ? 'p-8' : 'p-6'}`}>
      {lockerGroups.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <p>락커 그룹이 설정되지 않았습니다.</p>
          <p className="text-sm mt-2">설정 페이지에서 락커 그룹을 추가해주세요.</p>
        </div>
      ) : (
        <div className="space-y-8 w-full">
          {lockerGroups.map((group) => (
            <div key={group.id} className="w-full">
              <h3 className={`text-lg font-semibold mb-3 ${isFullWidth ? "text-center" : ""}`}>
                {group.name}
                {overviewMode && <span className="ml-2 text-xs text-muted-foreground">(전체보기: H)</span>}
              </h3>
              <div className={`grid w-full ${
                overviewMode 
                  ? "grid-cols-12 gap-2" 
                  : isFullWidth 
                    ? "grid-cols-8 gap-4" 
                    : "grid-cols-8 gap-2 max-w-4xl"
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
    <ResizablePanelGroup direction="horizontal" className="flex-1">
      {/* 왼쪽: 오늘입실현황 테이블 */}
      <ResizablePanel defaultSize={60} minSize={30} maxSize={80}>
        <div className="h-full overflow-hidden">
          <TodayStatusTable
            entries={todayEntries}
            isExpanded={true}
            onReverseCheckout={handleReverseCheckout}
            onRowClick={(entry) => {
              const existingEntry = activeLockers.find(log => log.lockerNumber === entry.lockerNumber);
              if (existingEntry) {
                setOpenDialogs(prev => new Map(prev).set(entry.lockerNumber, {
                  lockerNumber: entry.lockerNumber,
                  isMinimized: false,
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
      </ResizablePanel>
      
      {/* 반응형 분리선 */}
      <ResizableHandle withHandle />
      
      {/* 오른쪽: 매출집계 */}
      <ResizablePanel defaultSize={40} minSize={20} maxSize={70}>
        <div className="h-full p-6 overflow-auto">
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
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  return (
    <div className="h-full w-full bg-background">
      {/* 탭 모드 UI */}
      {uiLayoutMode === 'tab' ? (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="h-full flex flex-col overflow-hidden">
          {/* 탭 헤더 */}
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
            <div className="flex items-center gap-4">
              <TabsList>
                <TabsTrigger value="locker" data-testid="tab-locker">입실 관리</TabsTrigger>
                <TabsTrigger value="status" data-testid="tab-status">오늘현황</TabsTrigger>
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
                  className="text-xs"
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
              >
                <Columns className="h-4 w-4 mr-1" />
                토글모드
              </Button>
            </div>
          </div>

          {/* 입실 관리 탭 */}
          <TabsContent value="locker" className="flex-1 flex flex-col mt-0 overflow-hidden data-[state=active]:flex">
            {/* 락카 상태 정보 */}
            <div className="flex items-center justify-between px-6 py-3 border-b">
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span>사용중: {activeLockers.length}개</span>
                <span>방문객: {summary?.totalVisitors || 0}명</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-white border-2 border-gray-300"></div>
                  <span className="text-xs">빈락카</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-[#22C55E] border-2 border-[#16A34A]"></div>
                  <span className="text-xs">이전영업일</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-[#FFD700] border-2 border-[#FFC700]"></div>
                  <span className="text-xs">주간</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-[#7B68EE] border-2 border-[#6A5ACD]"></div>
                  <span className="text-xs">야간</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-[#FF4444] border-2 border-[#CC0000]"></div>
                  <span className="text-xs">추가요금</span>
                </div>
                {disabledLockers.size > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded bg-gray-200 border-2 border-gray-300"></div>
                    <span className="text-xs">사용불가</span>
                  </div>
                )}
              </div>
            </div>
            {renderLockerGrid(true)}
          </TabsContent>

          {/* 오늘현황 탭 */}
          <TabsContent value="status" className="flex-1 flex flex-col mt-0 overflow-hidden data-[state=active]:flex">
            {renderTodayStatusWithSales()}
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
                <div className="h-full border-r flex flex-col">
                  {/* Today Status */}
                  <div className={`border-b overflow-hidden ${isSalesSummaryCollapsed ? 'flex-1' : 'flex-[3]'}`}>
                    <TodayStatusTable
                      entries={todayEntries}
                      isExpanded={isLockerPanelCollapsed}
                      onReverseCheckout={handleReverseCheckout}
                      onRowClick={(entry) => {
                        // Add to openDialogs for multi-popup display
                        const existingEntry = activeLockers.find(log => log.lockerNumber === entry.lockerNumber);
                        if (existingEntry) {
                          setOpenDialogs(prev => new Map(prev).set(entry.lockerNumber, {
                            lockerNumber: entry.lockerNumber,
                            isMinimized: false,
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
                    <div className="flex-[2] p-6 overflow-auto">
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
                  <div className="p-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsSalesSummaryCollapsed(false)}
                      className="w-full"
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
        <div className="p-6 border-b">
          {/* 1행: 햄버거 + 날짜/시간 (좌측) | 입실 관리 (우측) */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleTogglePanel}
                data-testid="button-toggle-panel"
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
                  className="text-xs"
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
                  className="text-xs"
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
                className="text-xs"
              >
                <LayoutGrid className="h-4 w-4 mr-1" />
                탭모드
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpenseDialogOpen(true)}
                data-testid="button-quick-expense-header"
              >
                <Receipt className="h-4 w-4 mr-2" />
                지출입력
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation('/staff-logs')}
                data-testid="button-staff-logs-header"
              >
                <Users className="h-4 w-4 mr-2" />
                직원근무
              </Button>
              <h1 
                className="text-xl font-semibold cursor-pointer select-none" 
                onClick={handleTitleClick}
                data-testid="title-entry-management"
              >
                입실 관리
              </h1>
            </div>
          </div>
          
          {/* 2행: 사용중 락카수/총방문인원 (좌측) | 범례 (우측) */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground ml-12">
              <span>사용중: {activeLockers.length}개</span>
              <span>방문객: {summary?.totalVisitors || 0}명</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-white border-2 border-gray-300"></div>
                <span className="text-xs">빈락카</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-[#22C55E] border-2 border-[#16A34A]"></div>
                <span className="text-xs">이전영업일</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-[#FFD700] border-2 border-[#FFC700]"></div>
                <span className="text-xs">주간</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-[#7B68EE] border-2 border-[#6A5ACD]"></div>
                <span className="text-xs">야간</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-[#FF4444] border-2 border-[#CC0000]"></div>
                <span className="text-xs">추가요금</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-[#FF69B4] border-2 border-[#FF1493]"></div>
                <span className="text-xs">직원</span>
              </div>
            </div>
          </div>
        </div>

          {/* Locker Grid */}
          <div 
            className={`flex-1 overflow-auto ${isPanelCollapsed && !overviewMode ? 'p-8' : 'p-6'}`}
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
                  <h3 className={`text-lg font-semibold mb-3 ${isPanelCollapsed && !overviewMode ? "text-center" : ""}`}>
                    {group.name}
                    {overviewMode && <span className="ml-2 text-xs text-muted-foreground">(전체보기: H)</span>}
                  </h3>
                  <div className={`grid w-full ${
                    overviewMode 
                      ? "grid-cols-12 gap-2" 
                      : isPanelCollapsed 
                        ? "grid-cols-8 gap-4" 
                        : "grid-cols-8 gap-2 max-w-4xl"
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

      {/* Backdrop - Click to hide popups temporarily */}
      {openDialogs.size > 0 && popupsVisible && (
        <div 
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setPopupsVisible(false)}
          title="클릭하여 임시로 숨기기"
        />
      )}

      {/* Multi-Popup Workspace - Docked or Floating Mode */}
      {openDialogs.size > 0 && popupsVisible && (
        <div 
          className={`bg-muted/95 backdrop-blur-sm shadow-2xl z-50 flex flex-col ${
            isFloatingMode 
              ? "fixed rounded-lg border-2 border-primary" 
              : dockedSide === 'right'
                ? "fixed right-0 top-0 bottom-0 w-[45%] border-l-4 border-primary"
                : "fixed left-0 top-0 bottom-0 w-[45%] border-r-4 border-primary"
          }`}
          style={isFloatingMode ? {
            left: floatingPosition.x,
            top: floatingPosition.y,
            width: floatingSize.width,
            height: floatingSize.height,
          } : undefined}
        >
          {/* Workspace Header */}
          <div 
            className={`flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground ${
              isFloatingMode ? "cursor-move rounded-t-lg" : ""
            }`}
            onMouseDown={isFloatingMode ? handleFloatingDragStart : undefined}
            onTouchStart={isFloatingMode ? handleFloatingTouchStart : undefined}
          >
            <div className="flex items-center gap-3">
              {isFloatingMode && <Move className="w-4 h-4 opacity-60" />}
              <h3 className="font-semibold text-lg">처리중인 고객</h3>
              <span className="px-2 py-1 rounded-full bg-primary-foreground text-primary text-sm font-bold">
                {openDialogs.size}명
              </span>
            </div>
            <div className="flex gap-2">
              {!isFloatingMode && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleDockedSide}
                  className="text-primary-foreground hover:bg-primary-foreground/20"
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
                className="text-primary-foreground hover:bg-primary-foreground/20"
                title={isFloatingMode ? "우측 도킹" : "플로팅 모드"}
                data-testid="button-toggle-floating"
              >
                {isFloatingMode ? <PanelRight className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setPopupsVisible(false)}
                className="text-primary-foreground hover:bg-primary-foreground/20"
                title="임시로 숨기기"
              >
                ⊟
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setOpenDialogs(new Map())}
                className="text-primary-foreground hover:bg-primary-foreground/20"
                title="모두 닫기 (ESC)"
              >
                ✕
              </Button>
            </div>
          </div>
          
          {/* Scrollable Popup Stack */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {Array.from(openDialogs.entries()).map(([lockerNumber, dialogInfo]) => {
              const selectedEntry = activeLockers.find(log => log.lockerNumber === lockerNumber);
              const newLockerInfo = dialogInfo.newLockerInfo;
              
              return (
                <div 
                  key={lockerNumber}
                  className="bg-background rounded-lg border-2 border-primary shadow-xl overflow-hidden"
                  style={{ minHeight: dialogInfo.isMinimized ? '60px' : '500px' }}
                >
                  {dialogInfo.isMinimized ? (
                    // Minimized view
                    <div 
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover-elevate active-elevate-2"
                      onClick={() => {
                        setOpenDialogs(prev => {
                          const next = new Map(prev);
                          const info = next.get(lockerNumber);
                          if (info) {
                            next.set(lockerNumber, { ...info, isMinimized: false });
                          }
                          return next;
                        });
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
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
                          currentIsCashReceipt={(selectedEntry as any)?.isCashReceipt || false}
                          currentAdditionalFeePaymentMethod={(selectedEntry as any)?.additionalFeePaymentMethod}
                          currentIsStaff={!!(selectedEntry as any)?.isStaff}
                          isOuting={lockerOutingStatus[lockerNumber] || false}
                          onToggleOuting={(_newIsOuting, _newMemo) => {
                            loadData();
                          }}
                          onApply={(option, customAmount, notes, paymentMethod, rentalItems, paymentCash, paymentCard, paymentTransfer, deferredPayment, customerMemo, noAdditionalFee, prepaidAdditionalFee, isCashReceipt, additionalFeePaymentMethod, isStaff) => 
                            handleApplyOption(lockerNumber, option, customAmount, notes, paymentMethod, rentalItems, paymentCash, paymentCard, paymentTransfer, deferredPayment, customerMemo, noAdditionalFee, prepaidAdditionalFee, isCashReceipt, additionalFeePaymentMethod, isStaff)
                          }
                          onCheckout={(paymentMethod, rentalItems, paymentCash, paymentCard, paymentTransfer, additionalFeePayment, customerMemo, refundAmount, refundNote, refundMethod) => 
                            handleCheckout(lockerNumber, paymentMethod, rentalItems, paymentCash, paymentCard, paymentTransfer, additionalFeePayment, customerMemo, refundAmount, refundNote, refundMethod)
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
