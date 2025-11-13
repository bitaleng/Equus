import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import LockerButton from "@/components/LockerButton";
import LockerOptionsDialog from "@/components/LockerOptionsDialog";
import TodayStatusTable from "@/components/TodayStatusTable";
import SalesSummary from "@/components/SalesSummary";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Menu, X, Maximize2, ChevronDown } from "lucide-react";
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
import PatternLockDialog from "@/components/PatternLockDialog";
import { getBusinessDay, getBusinessDayRange, getTimeType, getBasePrice, calculateAdditionalFee } from "@shared/businessDay";
import * as localDb from "@/lib/localDb";
import { combinePayments } from "@/lib/utils";
import type { LockerLog as SharedLockerLog } from "@shared/schema";

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
}

interface LockerGroup {
  id: string;
  name: string;
  startNumber: number;
  endNumber: number;
  sortOrder: number;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedLocker, setSelectedLocker] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [childLockerAlertOpen, setChildLockerAlertOpen] = useState(false);
  const [childLockerParent, setChildLockerParent] = useState<number | null>(null);
  const [settlementReminderOpen, setSettlementReminderOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
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

  // Ref to store latest activeLockers for barcode scanner
  const activeLockersRef = useRef<LockerLog[]>([]);
  

  // Load settings from localStorage
  const settings = localDb.getSettings();
  const businessDayStartHour = settings.businessDayStartHour;
  const dayPrice = settings.dayPrice;
  const nightPrice = settings.nightPrice;
  const discountAmount = settings.discountAmount;
  const foreignerPrice = settings.foreignerPrice;
  const domesticCheckpointHour = settings.domesticCheckpointHour;
  const foreignerAdditionalFeePeriod = settings.foreignerAdditionalFeePeriod;
  
  // Toggle left panel (Today Status + Sales Summary) visibility
  const handleTogglePanel = () => {
    if (isPanelCollapsed) {
      // Expanding panel - require pattern
      setShowPatternDialog(true);
    } else {
      // Collapsing panel - no pattern required
      setIsPanelCollapsed(true);
    }
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
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Global barcode scanner listener
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = 0;
    
    const handleBarcodeScan = (e: KeyboardEvent) => {
      // Skip if a dialog is open
      if (dialogOpen || childLockerAlertOpen || settlementReminderOpen || showPatternDialog) {
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
        
        // Look up locker number by barcode
        const lockerNumber = localDb.getLockerNumberByBarcode(barcode);
        
        if (lockerNumber) {
          // Check if this is a child locker by looking up in activeLockersRef (always fresh)
          const activeLog = activeLockersRef.current.find(log => log.lockerNumber === lockerNumber);
          if (activeLog && activeLog.parentLocker) {
            setChildLockerParent(activeLog.parentLocker);
            setChildLockerAlertOpen(true);
            return;
          }
          
          // Open locker dialog
          setSelectedLocker(lockerNumber);
          setDialogOpen(true);
          
          toast({
            title: "락카 선택",
            description: `${lockerNumber}번 락카가 선택되었습니다.`,
          });
        } else {
          toast({
            title: "바코드 미등록",
            description: "등록되지 않은 바코드입니다.",
            variant: "destructive",
          });
        }
        
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
  }, [dialogOpen, childLockerAlertOpen, settlementReminderOpen, showPatternDialog, toast]);

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
  }, [currentTime, businessDayStartHour]);

  // Load data on mount and set up refresh interval
  useEffect(() => {
    loadData();
    
    const interval = setInterval(() => {
      loadData();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const loadData = () => {
    try {
      const businessDay = getBusinessDay(new Date(), businessDayStartHour);
      
      const activeData = localDb.getActiveLockers();
      setActiveLockers(activeData);
      activeLockersRef.current = activeData;
      
      // 디버깅: 락커 21, 45번 데이터 출력
      const locker21 = activeData.find(l => l.lockerNumber === 21);
      const locker45 = activeData.find(l => l.lockerNumber === 45);
      if (locker21) console.log('락커 21번 데이터:', locker21);
      if (locker45) console.log('락커 45번 데이터:', locker45);
      
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
            id: `additionalfee_${event.id}`,
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
      const activeSales = entries.filter(e => !e.cancelled).reduce((sum, e) => sum + (e.finalPrice || 0), 0);
      const totalVisitors = entries.filter(e => !e.cancelled).length; // 추가요금은 entries에 없으므로 자동 제외
      const cancellations = entries.filter(e => e.cancelled).length;
      const foreignerCount = entries.filter(e => e.optionType === 'foreigner' && !e.cancelled).length;
      const dayVisitors = entries.filter(e => e.timeType === '주간' && !e.cancelled).length;
      const nightVisitors = entries.filter(e => e.timeType === '야간' && !e.cancelled).length;
      
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
        totalSales: activeSales, // 오늘 입실 요금만 (추가요금은 additionalFeeSales로 별도 전달)
        cancellations,
        totalDiscount: 0,
        foreignerCount,
        foreignerSales: 0,
        dayVisitors,
        nightVisitors
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
  
  lockerGroups.forEach(group => {
    for (let i = group.startNumber; i <= group.endNumber; i++) {
      lockerStates[i] = 'empty';
      additionalFeeCounts[i] = 0;
      lockerTimeTypes[i] = 'day';
      lockerParents[i] = null;
    }
  });
  
  activeLockers.forEach(log => {
    lockerStates[log.lockerNumber] = 'in-use';
    lockerEntryTimes[log.lockerNumber] = new Date(log.entryTime);
    lockerParents[log.lockerNumber] = log.parentLocker || null;
    
    // 외국인 여부 확인
    const isForeigner = log.optionType === 'foreigner';
    
    // Calculate additional fee for this locker
    const { additionalFee, midnightsPassed, additionalFeeCount } = calculateAdditionalFee(
      log.entryTime,
      log.timeType,
      dayPrice,
      nightPrice,
      currentTime,
      isForeigner,
      foreignerPrice,
      domesticCheckpointHour,
      foreignerAdditionalFeePeriod
    );
    
    // 추가요금 횟수를 그대로 저장 (0이면 추가요금 없음)
    additionalFeeCounts[log.lockerNumber] = additionalFeeCount;
    
    // Store time type (convert Korean to English)
    const convertedTimeType = log.timeType === '주간' ? 'day' : 'night';
    lockerTimeTypes[log.lockerNumber] = convertedTimeType;
    
    // 디버깅: 특정 락커 변환 결과 출력
    if (log.lockerNumber === 6 || log.lockerNumber === 21 || log.lockerNumber === 45) {
      console.log(`락커 ${log.lockerNumber}번 상세:`, {
        외국인여부: isForeigner ? '외국인' : '내국인',
        원본timeType: log.timeType,
        변환후timeType: convertedTimeType,
        입실시각: new Date(log.entryTime).toLocaleString('ko-KR'),
        현재시각: currentTime.toLocaleString('ko-KR'),
        자정넘긴횟수_또는_24시간단위: midnightsPassed,
        추가요금횟수: additionalFeeCount + '회',
        추가요금금액: additionalFee.toLocaleString() + '원',
        nightPrice설정: nightPrice.toLocaleString() + '원',
        foreignerPrice설정: foreignerPrice.toLocaleString() + '원',
        색상: additionalFeeCount > 0 ? '레드' : (convertedTimeType === 'day' ? '노란색' : '블루')
      });
    }
  });
  
  // 빈 락커 개수 계산
  const emptyLockerCount = Object.values(lockerStates).filter(state => state === 'empty').length;

  const handleLockerClick = async (lockerNumber: number) => {
    const state = lockerStates[lockerNumber];
    
    if (state === 'empty') {
      const timeType = getTimeType(currentTime);
      const basePrice = getBasePrice(timeType, dayPrice, nightPrice);
      
      setNewLockerInfo({ lockerNumber, timeType, basePrice });
      setSelectedLocker(lockerNumber);
      setDialogOpen(true);
    } else if (state === 'in-use') {
      // Check if this is a child locker
      const parentLocker = lockerParents[lockerNumber];
      if (parentLocker) {
        // Show child locker alert instead of options dialog
        setChildLockerParent(parentLocker);
        setChildLockerAlertOpen(true);
      } else {
        // Normal locker - show options dialog
        setNewLockerInfo(null);
        setSelectedLocker(lockerNumber);
        setDialogOpen(true);
      }
    }
  };

  const selectedEntry = selectedLocker && !newLockerInfo
    ? activeLockers.find(log => log.lockerNumber === selectedLocker)
    : null;

  const handleApplyOption = async (
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
    }>,
    paymentCash?: number,
    paymentCard?: number,
    paymentTransfer?: number
  ) => {
    // Handle new locker entry
    if (newLockerInfo) {
      const now = new Date();
      const businessDay = getBusinessDay(now, businessDayStartHour);
      let optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' = 'none';
      let finalPrice = newLockerInfo.basePrice;
      let optionAmount: number | undefined;

      if (option === 'direct_price' && customAmount) {
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

      const lockerLogId = await localDb.createEntry({
        lockerNumber: newLockerInfo.lockerNumber,
        timeType: newLockerInfo.timeType,
        basePrice: newLockerInfo.basePrice,
        finalPrice,
        businessDay,
        optionType,
        optionAmount,
        notes,
        paymentMethod,
        paymentCash,
        paymentCard,
        paymentTransfer,
      });

      // Create rental transaction records for each rented item (at check-in)
      // NOTE: Rental items are SEPARATE revenue from locker entry fee
      // Each rental item has its own payment method, independent of locker entry payment
      if (rentalItems && rentalItems.length > 0 && lockerLogId) {
        rentalItems.forEach(item => {
          // Calculate total revenue for this item
          // 입실 시에는 항상 'received' 상태로 시작하므로 렌탈비 + 보증금
          let revenue = item.rentalFee;
          if (item.depositStatus === 'received') {
            revenue += item.depositAmount;
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
            rentalFee: item.rentalFee,
            depositAmount: item.depositAmount,
            depositStatus: item.depositStatus,
            rentalTime: now,
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

      setNewLockerInfo(null);
      setDialogOpen(false);
      loadData();
      return;
    }

    // Handle existing entry update
    if (!selectedEntry) return;

    let optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' = 'none';
    let finalPrice = selectedEntry.basePrice;
    let optionAmount: number | undefined;

    if (option === 'direct_price' && customAmount) {
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

    localDb.updateEntry(selectedEntry.id, { 
      optionType, 
      optionAmount, 
      finalPrice, 
      notes, 
      paymentMethod,
      paymentCash,
      paymentCard,
      paymentTransfer
    });
    
    // Handle rental items for existing entry (if saving changes)
    if (rentalItems && rentalItems.length > 0) {
      const businessDay = getBusinessDay(new Date(), businessDayStartHour);
      const existingTransactions = localDb.getRentalTransactionsByLockerLog(selectedEntry.id);
      
      rentalItems.forEach(item => {
        // Check if rental transaction already exists for this item
        const existingItem = existingTransactions.find(t => t.itemId === item.itemId);
        
        // Revenue calculation:
        // - received: rental fee + deposit (대여 시)
        // - forfeited (same-day): rental fee + deposit (같은 영업일 반납)
        // - forfeited (cross-day): rental fee only (다른 영업일 반납, 보증금은 이미 대여일 매출)
        // - refunded (cross-day): rental fee only (보증금 환급, 지출 생성)
        // - refunded (same-day): rental fee only (보증금 환급)
        let revenue = item.rentalFee;
        let isCrossDayRefund = false;
        
        if (item.depositStatus === 'received') {
          revenue += item.depositAmount;
        } else if (item.depositStatus === 'forfeited' && existingItem) {
          // 영업일 비교: 대여일과 현재가 같으면 보증금 포함, 다르면 제외
          const rentalBusinessDay = existingItem.businessDay;
          const currentBusinessDay = businessDay;
          if (rentalBusinessDay === currentBusinessDay) {
            revenue += item.depositAmount;
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
            revenue += item.depositAmount;
          }
          // Same-day refund: don't include deposit (revenue = rental fee only)
        }
        
        if (!existingItem) {
          // Create new rental transaction if it doesn't exist
          // rentalTime = 대여품목 체크박스 선택 시점 (현재 시간)
          // Each rental item's revenue is allocated 100% to its own payment method
          const itemPaymentMethod = item.paymentMethod || 'cash';
          let itemPaymentCash = 0;
          let itemPaymentCard = 0;
          let itemPaymentTransfer = 0;
          
          // Allocate 100% of revenue to the selected payment method
          if (itemPaymentMethod === 'cash') {
            itemPaymentCash = revenue;
          } else if (itemPaymentMethod === 'card') {
            itemPaymentCard = revenue;
          } else if (itemPaymentMethod === 'transfer') {
            itemPaymentTransfer = revenue;
          }
          
          localDb.createRentalTransaction({
            lockerLogId: selectedEntry.id,
            lockerNumber: selectedEntry.lockerNumber,
            itemId: item.itemId,
            itemName: item.itemName,
            rentalFee: item.rentalFee,
            depositAmount: item.depositAmount,
            depositStatus: item.depositStatus,
            rentalTime: new Date(),
            returnTime: null,
            businessDay: businessDay,
            paymentMethod: itemPaymentMethod,
            paymentCash: itemPaymentCash > 0 ? itemPaymentCash : undefined,
            paymentCard: itemPaymentCard > 0 ? itemPaymentCard : undefined,
            paymentTransfer: itemPaymentTransfer > 0 ? itemPaymentTransfer : undefined,
            revenue: revenue,
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

  const handleCheckout = async (
    paymentMethod: 'card' | 'cash' | 'transfer', 
    rentalItems?: Array<{
      itemId: string;
      itemName: string;
      rentalFee: number;
      depositAmount: number;
      depositStatus: 'received' | 'refunded' | 'forfeited' | 'none';
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
    }
  ) => {
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
      foreignerAdditionalFeePeriod
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
      });
    } else {
      // Same business day checkout
      // CRITICAL FIX: Update finalPrice to include additional fee for correct display
      // Base price payment stays in locker_logs
      // Additional fee payment goes to additional_fee_events table for independent tracking
      const updatedFinalPrice = selectedEntry.finalPrice + additionalFeeInfo.additionalFee;
      
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
        // additionalFees: removed to prevent duplication with additional_fee_events
      });
    }
    
    // Create additional fee event for ALL checkouts with additional fees
    // This ensures payment method independence between entry and additional fees
    if (additionalFeeInfo.additionalFee > 0) {
      const addFeePayment = additionalFeePayment || {
        method: paymentMethod,
        cash: paymentMethod === 'cash' ? additionalFeeInfo.additionalFee : undefined,
        card: paymentMethod === 'card' ? additionalFeeInfo.additionalFee : undefined,
        transfer: paymentMethod === 'transfer' ? additionalFeeInfo.additionalFee : undefined,
      };
      
      // Apply discount if provided
      const originalAmount = additionalFeeInfo.additionalFee + (addFeePayment.discount || 0);
      const discountAmount = addFeePayment.discount || 0;
      
      localDb.createAdditionalFeeEvent({
        lockerLogId: selectedEntry.id,
        lockerNumber: selectedEntry.lockerNumber,
        checkoutTime: now,
        feeAmount: additionalFeeInfo.additionalFee,
        originalFeeAmount: discountAmount > 0 ? originalAmount : undefined,
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
        
        // Calculate this item's revenue
        let itemRevenue = item.rentalFee;
        
        // 보증금 매출 처리:
        // - 'received': 렌탈비 + 보증금
        // - 'forfeited' (같은 영업일): 렌탈비 + 보증금
        // - 'forfeited' (다른 영업일): 렌탈비만 (보증금은 이미 대여일 매출로 계산됨)
        // - 'refunded': 렌탈비만
        if (item.depositStatus === 'received') {
          itemRevenue += item.depositAmount;
        } else if (item.depositStatus === 'forfeited') {
          // 영업일 비교: 대여일과 반납일이 같으면 보증금 포함, 다르면 제외
          const existingItem = localDb.getRentalTransactionsByLockerLog(selectedEntry.id).find(t => t.itemId === item.itemId);
          if (existingItem) {
            const rentalBusinessDay = existingItem.businessDay;
            const returnBusinessDay = checkoutBusinessDay;
            if (rentalBusinessDay === returnBusinessDay) {
              // 같은 영업일: 보증금 포함
              itemRevenue += item.depositAmount;
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
            rentalFee: item.rentalFee,
            depositAmount: item.depositAmount,
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
    
    loadData();
    setDialogOpen(false);
    setSelectedLocker(null);
  };

  const handleCancel = async () => {
    if (!selectedEntry) return;

    localDb.updateEntry(selectedEntry.id, { 
      status: 'cancelled',
      cancelled: true,
    });
    
    // Automatically cancel child lockers when parent is cancelled
    localDb.cancelChildLockers(selectedEntry.lockerNumber);
    
    loadData();
    setDialogOpen(false);
    setSelectedLocker(null);
  };

  const handleSwap = (fromLocker: number, toLocker: number) => {
    const result = localDb.swapLockers(fromLocker, toLocker);
    
    if (result.success) {
      toast({
        title: "성공",
        description: result.message,
        className: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
      });
      loadData();
      setDialogOpen(false);
      setSelectedLocker(null);
    } else {
      toast({
        title: "오류",
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const todayEntries = todayAllEntries.map(log => ({
    lockerNumber: log.lockerNumber,
    entryTime: log.entryTime ? new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : null,
    timeType: log.timeType,
    basePrice: log.basePrice,
    option: log.optionType === 'none' ? '없음' : 
            log.optionType === 'discount' ? '할인' :
            log.optionType === 'custom' ? `할인직접` :
            log.optionType === 'direct_price' ? '요금직접' :
            '외국인',
    finalPrice: log.finalPrice,
    status: log.status,
    cancelled: log.cancelled,
    notes: log.notes,
    paymentMethod: log.paymentMethod,
    additionalFeeOnly: log.additionalFeeOnly,
    hasSameDayFee: (log as any).hasSameDayFee || false,
  }));

  return (
    <div className="h-full w-full flex bg-background">
      {/* Left Panel - Collapsible */}
      {!isPanelCollapsed && (
        <div className={`border-r flex flex-col ${isLockerPanelCollapsed ? 'flex-1' : 'w-[40%]'}`}>
          {/* Today Status */}
          <div className={`border-b overflow-hidden ${isSalesSummaryCollapsed ? 'flex-1' : 'flex-[3]'}`}>
            <TodayStatusTable
              entries={todayEntries}
              isExpanded={isLockerPanelCollapsed}
              onRowClick={(entry) => {
                setSelectedLocker(entry.lockerNumber);
                setDialogOpen(true);
              }}
              isLockerPanelCollapsed={isLockerPanelCollapsed}
              onToggleLockerPanel={handleToggleLockerPanel}
            />
          </div>

          {/* Sales Summary */}
          {!isSalesSummaryCollapsed && (
            <div className="flex-[2] p-6 overflow-auto">
              <SalesSummary
                date={getBusinessDay(currentTime, businessDayStartHour)}
                totalVisitors={summary?.totalVisitors || 0}
                totalSales={summary?.totalSales || 0}
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
      )}

      {/* Right Panel - Locker Grid */}
      {!isLockerPanelCollapsed && (
        <div className="flex-1 flex flex-col">
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
              <p className="tabular-nums">
                <span className="text-base font-bold text-muted-foreground">{currentTime.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
                <span className="text-[27px] font-semibold text-blue-600 dark:text-blue-400 ml-2">{currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
              </p>
            </div>
            <h1 className="text-xl font-semibold">입실 관리</h1>
          </div>
          
          {/* 2행: 빈락카/주간야간/요금 (좌측) | 범례 (우측) */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground ml-12">
              <span>빈 락커: {emptyLockerCount}개</span>
              <span>{getTimeType(currentTime)} ({getBasePrice(getTimeType(currentTime), dayPrice, nightPrice).toLocaleString()}원)</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-white border-2 border-gray-300"></div>
                <span className="text-xs">빈칸</span>
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
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      )}

      {/* Options Dialog */}
      {(selectedEntry || newLockerInfo) && (
        <LockerOptionsDialog
          open={dialogOpen}
          onClose={() => {
            setDialogOpen(false);
            setNewLockerInfo(null);
          }}
          lockerNumber={selectedEntry?.lockerNumber || newLockerInfo!.lockerNumber}
          basePrice={selectedEntry?.basePrice || newLockerInfo!.basePrice}
          timeType={selectedEntry?.timeType || newLockerInfo!.timeType}
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
          onApply={handleApplyOption}
          onCheckout={handleCheckout}
          onCancel={handleCancel}
          onSwap={handleSwap}
        />
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
            <AlertDialogAction 
              onClick={() => setChildLockerAlertOpen(false)}
              data-testid="button-child-locker-ok"
            >
              확인
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
    </div>
  );
}
