import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import LockerButton from "@/components/LockerButton";
import LockerOptionsDialog from "@/components/LockerOptionsDialog";
import TodayStatusTable from "@/components/TodayStatusTable";
import SalesSummary from "@/components/SalesSummary";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Menu, X } from "lucide-react";
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

interface LockerLog {
  id: string;
  lockerNumber: number;
  entryTime: string;
  exitTime: string | null;
  timeType: '주간' | '야간';
  basePrice: number;
  optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price';
  optionAmount?: number;
  finalPrice: number;
  notes?: string;
  paymentMethod?: 'card' | 'cash' | 'transfer';
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
  status: 'in_use' | 'checked_out' | 'cancelled';
  cancelled: boolean;
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
  const [showPatternDialog, setShowPatternDialog] = useState(false);
  const [overviewMode, setOverviewMode] = useState(false); // H key: overview mode
  
  // macOS Dock-style magnification effect
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  const [lockerScales, setLockerScales] = useState<{ [key: number]: number }>({});
  const lockerRefs = useRef<{ [key: number]: HTMLElement | null }>({});

  // Load settings from localStorage
  const settings = localDb.getSettings();
  const businessDayStartHour = settings.businessDayStartHour;
  const dayPrice = settings.dayPrice;
  const nightPrice = settings.nightPrice;
  const discountAmount = settings.discountAmount;
  const foreignerPrice = settings.foreignerPrice;
  
  // Toggle panel visibility
  const handleTogglePanel = () => {
    if (isPanelCollapsed) {
      // Expanding panel - require pattern
      setShowPatternDialog(true);
    } else {
      // Collapsing panel - no pattern required
      setIsPanelCollapsed(true);
    }
  };
  
  // Pattern verified, expand panel
  const handlePatternCorrect = () => {
    setIsPanelCollapsed(false);
  };
  
  // Calculate scale for Dock-style magnification effect
  const calculateLockerScales = useCallback(() => {
    if (!mousePosition) {
      setLockerScales({});
      return;
    }
    
    const maxDistance = 150; // Maximum distance for magnification effect (pixels)
    const maxScale = 1.5; // Maximum scale factor
    const newScales: { [key: number]: number } = {};
    
    Object.entries(lockerRefs.current).forEach(([lockerNum, element]) => {
      if (!element) {
        newScales[Number(lockerNum)] = 1;
        return;
      }
      
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Calculate distance from mouse to button center
      const dx = mousePosition.x - centerX;
      const dy = mousePosition.y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Calculate scale based on distance (closer = larger)
      if (distance > maxDistance) {
        newScales[Number(lockerNum)] = 1;
      } else {
        const influence = 1 - distance / maxDistance;
        newScales[Number(lockerNum)] = 1 + influence * (maxScale - 1);
      }
    });
    
    setLockerScales(newScales);
  }, [mousePosition]);
  
  // Update scales when mouse position changes
  useEffect(() => {
    calculateLockerScales();
  }, [calculateLockerScales]);
  
  // Handle mouse move over locker grid
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  };
  
  // Handle mouse leave from locker grid
  const handleMouseLeave = () => {
    setMousePosition(null);
  };

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

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
      
      // 디버깅: 락커 21, 45번 데이터 출력
      const locker21 = activeData.find(l => l.lockerNumber === 21);
      const locker45 = activeData.find(l => l.lockerNumber === 45);
      if (locker21) console.log('락커 21번 데이터:', locker21);
      if (locker45) console.log('락커 45번 데이터:', locker45);
      
      // 비즈니스 데이 기준으로 입실 기록 조회 (입실 시간 기준)
      const entries = localDb.getEntriesByEntryTime(businessDay, businessDayStartHour);
      
      // Get additional fee events for today (모든 추가요금: 같은 영업일 + 다른 영업일)
      const additionalFeeEvents = localDb.getAdditionalFeeEventsByBusinessDayRange(businessDay, businessDayStartHour);
      
      // Create pseudo entries for ALL additional fee events
      // Display all as separate rows with empty entry time
      const additionalFeeEntries = additionalFeeEvents.map(event => {
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
      
      // No need to enrich entries with additional fee flags anymore
      // Additional fees are now displayed as separate rows
      const enrichedEntries = entries;
      
      // Combine regular entries with additional fee entries and sort by time
      // 입실 기록은 entry_time, 추가요금 기록은 checkout_time 기준으로 정렬
      const allEntries = [...enrichedEntries, ...additionalFeeEntries].sort((a, b) => {
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
      const additionalFees = additionalFeeEvents.reduce((sum, event) => sum + event.feeAmount, 0);
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
  
  lockerGroups.forEach(group => {
    for (let i = group.startNumber; i <= group.endNumber; i++) {
      lockerStates[i] = 'empty';
      additionalFeeCounts[i] = 0;
      lockerTimeTypes[i] = 'day';
    }
  });
  
  activeLockers.forEach(log => {
    lockerStates[log.lockerNumber] = 'in-use';
    lockerEntryTimes[log.lockerNumber] = new Date(log.entryTime);
    
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
      foreignerPrice
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
      setNewLockerInfo(null);
      setSelectedLocker(lockerNumber);
      setDialogOpen(true);
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
      foreignerPrice
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
      // Same business day checkout - DO NOT combine payments, keep them separate
      // Base price payment stays in locker_logs
      // Additional fee payment goes to additional_fee_events table for independent tracking
      localDb.updateEntry(selectedEntry.id, { 
        status: 'checked_out',
        exitTime: now,
        paymentMethod: paymentMethod,
        paymentCash: paymentCash,
        paymentCard: paymentCard,
        paymentTransfer: paymentTransfer,
        finalPrice: selectedEntry.finalPrice,
        additionalFees: additionalFeeInfo.additionalFee,
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
    
    loadData();
    setDialogOpen(false);
    setSelectedLocker(null);
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
  }));

  return (
    <div className="h-full w-full flex bg-background">
      {/* Left Panel - Collapsible */}
      {!isPanelCollapsed && (
        <div className="w-[40%] border-r flex flex-col">
          {/* Today Status */}
          <div className="flex-[3] border-b overflow-hidden">
            <TodayStatusTable
              entries={todayEntries}
              onRowClick={(entry) => {
                setSelectedLocker(entry.lockerNumber);
                setDialogOpen(true);
              }}
            />
          </div>

          {/* Sales Summary */}
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
            />
          </div>
        </div>
      )}

      {/* Right Panel - Locker Grid */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between">
          {/* Hamburger Menu Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleTogglePanel}
            data-testid="button-toggle-panel"
            className="mr-2"
          >
            {isPanelCollapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">
              입실 관리 
              <span className="ml-3 text-base font-normal text-muted-foreground">
                빈 락커: {emptyLockerCount}개
              </span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} - {getTimeType(currentTime)} ({getBasePrice(getTimeType(currentTime), dayPrice, nightPrice).toLocaleString()}원)
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
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

        {/* Locker Grid */}
        <div 
          className={`flex-1 overflow-auto ${isPanelCollapsed && !overviewMode ? 'p-8' : 'p-6'}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
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
                      <div 
                        key={num}
                        ref={(el) => { lockerRefs.current[num] = el; }}
                        style={{
                          transform: `scale(${lockerScales[num] || 1})`,
                          zIndex: (lockerScales[num] || 1) > 1 ? 10 : 1,
                          transition: 'transform 200ms ease-out',
                        }}
                      >
                        <LockerButton
                          number={num}
                          status={lockerStates[num] || 'empty'}
                          additionalFeeCount={additionalFeeCounts[num] || 0}
                          timeType={lockerTimeTypes[num] || 'day'}
                          entryTime={lockerEntryTimes[num]}
                          businessDayStartHour={businessDayStartHour}
                          onClick={() => handleLockerClick(num)}
                          isExpanded={isPanelCollapsed && !overviewMode}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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

      {/* Pattern Lock Dialog for Panel Expansion */}
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
