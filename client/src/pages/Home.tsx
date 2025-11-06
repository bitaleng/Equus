import { useState, useEffect } from "react";
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
import { getBusinessDay, getTimeType, getBasePrice, calculateAdditionalFee } from "@shared/businessDay";
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
  const [todayAllEntries, setTodayAllEntries] = useState<LockerLog[]>([]);
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
      
      setTodayAllEntries(localDb.getTodayEntries(businessDay));
      setSummary(localDb.getDailySummary(businessDay));
      setLockerGroups(localDb.getLockerGroups());
      
      // Get additional fee sales for today
      const additionalFees = localDb.getTotalAdditionalFeesByBusinessDay(businessDay);
      setAdditionalFeeSales(additionalFees);
      
      // Get rental revenue for today
      const rentalRev = localDb.getTotalRentalRevenueByBusinessDay(businessDay);
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
  
  lockerGroups.forEach(group => {
    for (let i = group.startNumber; i <= group.endNumber; i++) {
      lockerStates[i] = 'empty';
      additionalFeeCounts[i] = 0;
      lockerTimeTypes[i] = 'day';
    }
  });
  
  activeLockers.forEach(log => {
    lockerStates[log.lockerNumber] = 'in-use';
    
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
      const businessDay = getBusinessDay(currentTime, businessDayStartHour);
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
          // Calculate total revenue for this item (rental fee + deposit if received/forfeited)
          let revenue = item.rentalFee;
          if (item.depositStatus === 'received' || item.depositStatus === 'forfeited') {
            revenue += item.depositAmount;
          }
          
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
            rentalTime: currentTime,
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
      const businessDay = getBusinessDay(currentTime, businessDayStartHour);
      const existingTransactions = localDb.getRentalTransactionsByLockerLog(selectedEntry.id);
      
      rentalItems.forEach(item => {
        // Check if rental transaction already exists for this item
        const existingItem = existingTransactions.find(t => t.itemId === item.itemId);
        
        // Revenue calculation: 
        // - received/forfeited: rental fee + deposit
        // - refunded (cross-day): rental fee + deposit (보증금을 대여일 수익으로 계산, 반납일에 지출 생성)
        // - refunded (same-day): rental fee only (보증금을 받았다가 돌려줌)
        // - none: rental fee only
        let revenue = item.rentalFee;
        let isCrossDayRefund = false;
        
        if (item.depositStatus === 'received' || item.depositStatus === 'forfeited') {
          revenue += item.depositAmount;
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
            
            // 보증금 환급 처리: 영업일 비교 후 지출 자동 생성
            if (item.depositStatus === 'refunded' && item.depositAmount > 0) {
              const rentalBusinessDay = existingItem.businessDay;
              const returnBusinessDay = getBusinessDay(updateData.returnTime, businessDayStartHour);
              
              // 다른 날 환급: 지출 자동 생성
              if (rentalBusinessDay !== returnBusinessDay) {
                const refundTime = new Date(updateData.returnTime);
                const timeStr = refundTime.toTimeString().slice(0, 5); // HH:MM
                
                // 보증금환급 카테고리 찾기
                const categories = localDb.getExpenseCategories();
                const refundCategory = categories.find(c => c.name === '보증금환급');
                
                if (refundCategory) {
                  // 지출 자동 생성
                  localDb.createExpense({
                    date: returnBusinessDay,
                    time: timeStr,
                    category: refundCategory.name,
                    amount: item.depositAmount,
                    quantity: 1,
                    paymentMethod: item.paymentMethod || 'cash',
                    paymentCash: item.paymentMethod === 'cash' ? item.depositAmount : undefined,
                    paymentCard: item.paymentMethod === 'card' ? item.depositAmount : undefined,
                    paymentTransfer: item.paymentMethod === 'transfer' ? item.depositAmount : undefined,
                    businessDay: returnBusinessDay,
                    notes: `${item.itemName} 보증금 환급 (락커 ${selectedEntry.lockerNumber})`,
                  });
                }
              }
            }
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
    // Set basePrice=0, optionAmount=0, finalPrice=additionalFee only
    // (basePrice and discount already included in entry day's revenue)
    // Formula: finalPrice = basePrice - optionAmount + additionalFee
    if (entryBusinessDay !== checkoutBusinessDay) {
      // Different business day - only record additional fee payment
      const addFeePayment = additionalFeePayment || {
        method: paymentMethod,
        cash: paymentMethod === 'cash' ? additionalFeeInfo.additionalFee : undefined,
        card: paymentMethod === 'card' ? additionalFeeInfo.additionalFee : undefined,
        transfer: paymentMethod === 'transfer' ? additionalFeeInfo.additionalFee : undefined,
      };
      
      localDb.updateEntry(selectedEntry.id, { 
        status: 'checked_out',
        exitTime: now,
        paymentMethod: addFeePayment.method,
        paymentCash: addFeePayment.cash,
        paymentCard: addFeePayment.card,
        paymentTransfer: addFeePayment.transfer,
        basePrice: 0,
        optionAmount: 0,
        finalPrice: additionalFeeInfo.additionalFee,
      });
    } else {
      // Same business day checkout - combine base and additional fee payments
      let finalPaymentCash = paymentCash;
      let finalPaymentCard = paymentCard;
      let finalPaymentTransfer = paymentTransfer;
      let finalPaymentMethod = paymentMethod;
      
      if (additionalFeeInfo.additionalFee > 0 && additionalFeePayment) {
        // Combine base price payment with additional fee payment
        const basePayment = {
          cash: paymentCash,
          card: paymentCard,
          transfer: paymentTransfer,
        };
        const addPayment = {
          cash: additionalFeePayment.cash,
          card: additionalFeePayment.card,
          transfer: additionalFeePayment.transfer,
        };
        
        const combined = combinePayments(basePayment, addPayment);
        finalPaymentCash = combined.cash;
        finalPaymentCard = combined.card;
        finalPaymentTransfer = combined.transfer;
        finalPaymentMethod = combined.cash ? 'cash' : (combined.card ? 'card' : 'transfer');
      }
      
      const finalPriceWithAdditionalFee = selectedEntry.finalPrice + additionalFeeInfo.additionalFee;
      localDb.updateEntry(selectedEntry.id, { 
        status: 'checked_out',
        exitTime: now,
        paymentMethod: finalPaymentMethod,
        paymentCash: finalPaymentCash,
        paymentCard: finalPaymentCard,
        paymentTransfer: finalPaymentTransfer,
        finalPrice: finalPriceWithAdditionalFee,
      });
    }
    
    // If there's additional fee, create a separate event record
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
        if (item.depositStatus === 'received' || item.depositStatus === 'forfeited') {
          itemRevenue += item.depositAmount;
        }
        
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
    entryTime: new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
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
            <h1 className="text-2xl font-semibold">입실 관리</h1>
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
        <div className={`flex-1 overflow-auto ${isPanelCollapsed && !overviewMode ? 'p-8' : 'p-6'}`}>
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
                        onClick={() => handleLockerClick(num)}
                        isExpanded={isPanelCollapsed && !overviewMode}
                      />
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
