import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Calendar, FileSpreadsheet, FileText, Filter, ChevronDown, ChevronUp, Zap, MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as localDb from "@/lib/localDb";
import { formatPaymentMethod } from "@/lib/utils";
import { getBusinessDay, getBusinessDayRange } from "@shared/businessDay";

/**
 * 영업일 입력 파싱 함수
 * 예: "25-27" → [25, 26, 27]
 * 예: "25, 27" → [25, 27]
 * 예: "25-27, 29" → [25, 26, 27, 29]
 * 예: "25" → [25]
 */
function parseBusinessDaysInput(input: string): number[] {
  if (!input.trim()) return [];
  
  const days = new Set<number>();
  const parts = input.split(',').map(p => p.trim());
  
  for (const part of parts) {
    if (part.includes('-')) {
      // 범위: "25-27"
      const [startStr, endStr] = part.split('-').map(s => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      
      if (!isNaN(start) && !isNaN(end) && start <= end && start >= 1 && end <= 31) {
        for (let d = start; d <= end; d++) {
          days.add(d);
        }
      }
    } else {
      // 단일 일자: "25"
      const day = parseInt(part, 10);
      if (!isNaN(day) && day >= 1 && day <= 31) {
        days.add(day);
      }
    }
  }
  
  return Array.from(days).sort((a, b) => a - b);
}

/**
 * 영업일 배열을 시작/종료 시간 범위 배열로 변환
 * @param days 일자 배열 (예: [25, 26, 27])
 * @param yearMonth 연월 문자열 (예: "2025-11")
 * @param businessDayStartHour 영업일 시작 시각 (기본값: 10)
 * @returns 시작/종료 시간 범위 배열
 */
function getBusinessDayRangesForDays(
  days: number[],
  yearMonth: string,
  businessDayStartHour: number = 10
): { start: Date; end: Date; businessDay: string }[] {
  if (days.length === 0 || !yearMonth) return [];
  
  const [year, month] = yearMonth.split('-').map(Number);
  if (isNaN(year) || isNaN(month)) return [];
  
  return days.map(day => {
    // 해당 영업일의 시작 시간 생성 (KST 기준)
    const businessDayDate = new Date(year, month - 1, day, businessDayStartHour + 1, 0, 0);
    return getBusinessDayRange(businessDayDate, businessDayStartHour);
  });
}

interface LogEntry {
  id: string;
  lockerNumber: number;
  entryTime: string;
  exitTime?: string | null;
  timeType: '주간' | '야간' | '추가요금';
  basePrice: number;
  optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price';
  optionAmount?: number;
  finalPrice: number;
  paymentMethod?: 'card' | 'cash' | 'transfer';
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
  cancelled: boolean;
  notes?: string;
  additionalFees?: number; // Total additional fees from checkout
  deferredPayment?: boolean; // 후불결제 여부
  customerMemo?: string; // 손님 메모
  businessDay?: string; // 영업일 (YYYY-MM-DD format)
}

interface AdditionalFeeEvent {
  id: string;
  lockerLogId: string;
  lockerNumber: number;
  checkoutTime: string;
  feeAmount: number;
  businessDay: string;
  entryBusinessDay?: string; // 입실 영업일 (JOIN으로 가져옴)
  paymentMethod: 'card' | 'cash' | 'transfer';
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
  createdAt: string;
}

interface RentalTransaction {
  id: string;
  lockerLogId: string;
  lockerNumber: number;
  itemId: string;
  itemName: string;
  rentalFee: number;
  depositAmount: number;
  depositStatus: 'received' | 'refunded' | 'forfeited' | 'none';
  rentalTime: string;
  returnTime: string;
  businessDay: string;
  paymentMethod: 'card' | 'cash' | 'transfer';
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
  revenue: number;
}

export default function LogsPage() {
  // Get settings for business day calculation
  const settings = localDb.getSettings();
  const businessDayStartHour = settings.businessDayStartHour;
  
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [useTimeFilter, setUseTimeFilter] = useState(false);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [additionalFeeEvents, setAdditionalFeeEvents] = useState<AdditionalFeeEvent[]>([]);
  const [rentalTransactions, setRentalTransactions] = useState<RentalTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [cancelledFilter, setCancelledFilter] = useState<string>("all");
  const [timeTypeFilter, setTimeTypeFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [additionalFeeFilter, setAdditionalFeeFilter] = useState<string>("all");
  
  // 영업일 자동 조회
  const [showBusinessDayFilter, setShowBusinessDayFilter] = useState(false);
  const [businessDayYearMonth, setBusinessDayYearMonth] = useState<string>(() => {
    // 기본값: 현재 연월
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [businessDayInput, setBusinessDayInput] = useState<string>("");
  const [activeBusinessDays, setActiveBusinessDays] = useState<string[]>([]); // 현재 조회 중인 영업일들
  
  // Rental transaction filters
  const [showRentalFilters, setShowRentalFilters] = useState(false);
  const [rentalItemFilter, setRentalItemFilter] = useState<string>("all");
  const [rentalPaymentFilter, setRentalPaymentFilter] = useState<string>("all");
  const [rentalDepositFilter, setRentalDepositFilter] = useState<string>("all");
  const [rentalLockerNumberFilter, setRentalLockerNumberFilter] = useState<string>("");
  const [rentalStartDate, setRentalStartDate] = useState<string>("");
  const [rentalEndDate, setRentalEndDate] = useState<string>("");
  const [rentalUseTimeFilter, setRentalUseTimeFilter] = useState(false);
  const [isRentalSectionOpen, setIsRentalSectionOpen] = useState(false);
  
  // 추가매출 영업일 자동 조회
  const [showRentalBusinessDayFilter, setShowRentalBusinessDayFilter] = useState(false);
  const [rentalBusinessDayYearMonth, setRentalBusinessDayYearMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rentalBusinessDayInput, setRentalBusinessDayInput] = useState<string>("");
  const [activeRentalBusinessDays, setActiveRentalBusinessDays] = useState<string[]>([]);

  // Load data on mount and when filters change
  useEffect(() => {
    loadLogs();
  }, [startDate, endDate, useTimeFilter, activeBusinessDays]);
  
  // Auto-refresh when component mounts (navigating to this page)
  useEffect(() => {
    // Refresh data every time this page is shown
    loadLogs();
  }, []);
  
  // Auto-refresh when page becomes visible (browser tab focus)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadLogs();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const loadLogs = () => {
    setIsLoading(true);
    try {
      let result: LogEntry[];
      let feeEvents: AdditionalFeeEvent[];
      let rentalTxns: RentalTransaction[];
      
      // 영업일 자동 조회가 활성화된 경우
      if (activeBusinessDays.length > 0) {
        const allResults: LogEntry[] = [];
        const allFeeEvents: AdditionalFeeEvent[] = [];
        const allRentalTxns: RentalTransaction[] = [];
        
        // 각 영업일에 대해 데이터 조회
        for (const businessDay of activeBusinessDays) {
          const businessDayDate = new Date(businessDay + 'T12:00:00'); // KST 정오로 설정
          const range = getBusinessDayRange(businessDayDate, businessDayStartHour);
          
          const startISO = range.start.toISOString();
          const endISO = range.end.toISOString();
          
          const dayResult = localDb.getEntriesByDateTimeRange(startISO, endISO);
          const dayFeeEvents = localDb.getAdditionalFeeEventsByDateTimeRange(startISO, endISO);
          const dayRentalTxns = localDb.getRentalTransactionsByDateTimeRange(startISO, endISO);
          
          allResults.push(...dayResult);
          allFeeEvents.push(...dayFeeEvents);
          allRentalTxns.push(...dayRentalTxns);
        }
        
        // 중복 제거 (ID 기준)
        const uniqueResults = Array.from(new Map(allResults.map(r => [r.id, r])).values());
        const uniqueFeeEvents = Array.from(new Map(allFeeEvents.map(e => [e.id, e])).values());
        const uniqueRentalTxns = Array.from(new Map(allRentalTxns.map(t => [t.id, t])).values());
        
        result = uniqueResults;
        feeEvents = uniqueFeeEvents;
        rentalTxns = uniqueRentalTxns;
      } else if (useTimeFilter && startDate && endDate) {
        // Time-based filtering: Convert datetime-local to ISO strings for UTC comparison
        console.log('[LogsPage] DateTime filter inputs:', { startDate, endDate, useTimeFilter });
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        console.log('[LogsPage] Parsed dates:', { 
          start: start.toString(), 
          end: end.toString(),
          startValid: !isNaN(start.getTime()),
          endValid: !isNaN(end.getTime())
        });
        
        // Validate dates before converting to ISO
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          console.error('[LogsPage] Invalid datetime format:', { startDate, endDate });
          result = [];
          feeEvents = [];
          rentalTxns = [];
        } else {
          const startISO = start.toISOString();
          const endISO = end.toISOString();
          console.log('[LogsPage] ISO strings:', { startISO, endISO });
          result = localDb.getEntriesByDateTimeRange(startISO, endISO);
          feeEvents = localDb.getAdditionalFeeEventsByDateTimeRange(startISO, endISO);
          rentalTxns = localDb.getRentalTransactionsByDateTimeRange(startISO, endISO);
        }
      } else if (useTimeFilter && startDate) {
        // Single datetime point - convert to ISO and set end of day
        const start = new Date(startDate);
        
        // Validate date before converting to ISO
        if (isNaN(start.getTime())) {
          console.error('Invalid datetime format:', { startDate });
          result = [];
          feeEvents = [];
          rentalTxns = [];
        } else {
          const startISO = start.toISOString();
          const endOfDay = new Date(start);
          endOfDay.setHours(23, 59, 59, 999);
          const endISO = endOfDay.toISOString();
          result = localDb.getEntriesByDateTimeRange(startISO, endISO);
          feeEvents = localDb.getAdditionalFeeEventsByDateTimeRange(startISO, endISO);
          rentalTxns = localDb.getRentalTransactionsByDateTimeRange(startISO, endISO);
        }
      } else if (startDate && endDate) {
        // Date-based filtering (YYYY-MM-DD format)
        result = localDb.getEntriesByDateRange(startDate, endDate);
        feeEvents = localDb.getAdditionalFeeEventsByDateRange(startDate, endDate);
        rentalTxns = localDb.getRentalTransactionsByDateRange(startDate, endDate);
      } else if (startDate) {
        result = localDb.getEntriesByDateRange(startDate, startDate);
        feeEvents = localDb.getAdditionalFeeEventsByDateRange(startDate, startDate);
        rentalTxns = localDb.getRentalTransactionsByDateRange(startDate, startDate);
      } else {
        // Default: show all entries (no date filter)
        result = localDb.getAllEntries();
        feeEvents = localDb.getAllAdditionalFeeEvents();
        rentalTxns = localDb.getAllRentalTransactions();
      }
      
      // Attach additional fees for each log entry
      // Combine same-business-day fees (stored in locker_logs.additional_fees column)
      // with different-business-day fees (stored in additional_fee_events table)
      const logsWithFees = result.map(log => {
        const additionalFeeEvents = localDb.getAdditionalFeeEventsByLockerLog(log.id);
        const totalAdditionalFees = additionalFeeEvents.reduce((sum, event) => sum + event.feeAmount, 0);
        // Map businessDay field from database (business_day column)
        const businessDay = (log as any).businessDay || 
          (log.entryTime ? getBusinessDay(new Date(log.entryTime), businessDayStartHour) : '');
        return {
          ...log,
          businessDay,
          additionalFees: ((log as any).additionalFees || 0) + totalAdditionalFees,
          hasAdditionalFeeRecord: additionalFeeEvents.length > 0 || ((log as any).additionalFees || 0) > 0
        };
      });
      
      // Filter out additional fee events where entry was already included in result
      const entryLockerIds = new Set(result.map(e => e.id));
      const additionalFeeOnlyEvents = feeEvents.filter(event => 
        !entryLockerIds.has(event.lockerLogId)
      );
      
      // Create pseudo entries for additional fee checkouts (no entry time, only exit time)
      const additionalFeeEntries = additionalFeeOnlyEvents.map(event => {
        return {
          id: `additionalfee_${event.id}`,
          lockerNumber: event.lockerNumber,
          entryTime: '', // No entry time - will be displayed empty
          exitTime: event.checkoutTime,
          timeType: '추가요금' as any, // Special marker for additional fee
          basePrice: 0,
          optionType: 'none' as const,
          optionAmount: 0,
          finalPrice: event.feeAmount,
          status: 'checked_out' as const,
          cancelled: false,
          paymentMethod: event.paymentMethod as any,
          paymentCash: 0,
          paymentCard: 0,
          paymentTransfer: 0,
          businessDay: event.businessDay,
          additionalFees: 0,
          additionalFeeOnly: true, // Flag to indicate this is an additional fee only entry
        } as LogEntry;
      });
      
      // Combine regular entries with additional fee entries and sort by time
      // 입실 기록은 entry_time, 추가요금 기록은 checkout_time(=exit_time) 기준으로 정렬
      const allLogs = [...logsWithFees, ...additionalFeeEntries].sort((a, b) => {
        const timeA = a.exitTime || a.entryTime || '';
        const timeB = b.exitTime || b.entryTime || '';
        return new Date(timeB).getTime() - new Date(timeA).getTime(); // 최신순
      });
      
      setLogs(allLogs);
      setAdditionalFeeEvents(feeEvents);
      setRentalTransactions(rentalTxns);
    } catch (error) {
      console.error('Error loading logs:', error);
      setLogs([]);
      setAdditionalFeeEvents([]);
      setRentalTransactions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearDateFilter = () => {
    setStartDate("");
    setEndDate("");
  };

  const clearAllFilters = () => {
    setCancelledFilter("all");
    setTimeTypeFilter("all");
    setPaymentMethodFilter("all");
    setAdditionalFeeFilter("all");
  };

  const hasActiveFilters = cancelledFilter !== "all" || timeTypeFilter !== "all" || paymentMethodFilter !== "all" || additionalFeeFilter !== "all";

  // Apply filters to logs
  let displayedLogs = [...logs];

  if (cancelledFilter === "cancelled") {
    displayedLogs = displayedLogs.filter(log => log.cancelled);
  } else if (cancelledFilter === "active") {
    displayedLogs = displayedLogs.filter(log => !log.cancelled);
  }

  if (timeTypeFilter === "day") {
    displayedLogs = displayedLogs.filter(log => log.timeType === '주간');
  } else if (timeTypeFilter === "night") {
    displayedLogs = displayedLogs.filter(log => log.timeType === '야간');
  }

  if (paymentMethodFilter === "card") {
    displayedLogs = displayedLogs.filter(log => log.paymentMethod === 'card');
  } else if (paymentMethodFilter === "cash") {
    displayedLogs = displayedLogs.filter(log => log.paymentMethod === 'cash' || !log.paymentMethod);
  } else if (paymentMethodFilter === "transfer") {
    displayedLogs = displayedLogs.filter(log => log.paymentMethod === 'transfer');
  }

  if (additionalFeeFilter === "with_fee") {
    displayedLogs = displayedLogs.filter(log => 
      (log as any).additionalFeeOnly === true || (log.additionalFees && log.additionalFees > 0)
    );
  } else if (additionalFeeFilter === "without_fee") {
    displayedLogs = displayedLogs.filter(log => 
      (log as any).additionalFeeOnly !== true && (!log.additionalFees || log.additionalFees === 0)
    );
  }

  // Helper functions for display and export
  const getOptionText = (log: LogEntry) => {
    if (log.optionType === 'none') return '없음';
    if (log.optionType === 'foreigner') return '외국인';
    if (log.optionType === 'discount') return '할인';
    if (log.optionType === 'custom') return '할인직접입력';
    if (log.optionType === 'direct_price') return '요금직접입력';
    return '-';
  };
  
  // Get display price for a log entry
  // For cross-business-day checkouts, shows only additional fees
  // For same-day checkouts, shows full final price (base + additional)
  // For deferred payment entries, shows 0 until payment is completed
  const getDisplayPrice = (log: LogEntry): number => {
    // 후불결제인 경우 0원 표시 (결제 완료 전까지)
    if (log.deferredPayment) {
      return 0;
    }
    
    const isAdditionalFeeOnly = (log as any).additionalFeeOnly === true;
    
    // 추가요금 전용 행: finalPrice 그대로 (이미 추가요금만)
    if (isAdditionalFeeOnly) {
      return log.finalPrice;
    }
    
    // 퇴실하지 않았으면 finalPrice 그대로
    if (!log.exitTime) {
      return log.finalPrice;
    }
    
    // 추가요금 기록이 없으면 finalPrice 그대로
    if (!(log as any).hasAdditionalFeeRecord) {
      return log.finalPrice;
    }
    
    // 퇴실 시 영업일 계산
    const exitBusinessDay = getBusinessDay(new Date(log.exitTime), businessDayStartHour);
    
    // 입실 시 영업일: businessDay 필드 직접 사용 (데이터베이스에서 매핑됨)
    const entryBusinessDay = log.businessDay 
      || getBusinessDay(new Date(log.entryTime), businessDayStartHour);
    
    // 다른 영업일 퇴실: 추가요금만 표시 (할인으로 0원일 수도 있음)
    if (exitBusinessDay !== entryBusinessDay) {
      return log.additionalFees || 0;
    }
    
    // 같은 영업일 퇴실: finalPrice 그대로 (base + additional)
    return log.finalPrice;
  };

  // Calculate total amount for filtered results using display price
  // This ensures table totals match individual row displays
  const filteredTotalAmount = displayedLogs.reduce((sum, log) => sum + getDisplayPrice(log), 0);
  
  // Calculate overall totals (excluding cancelled entries) using display price
  const activeLogs = logs.filter(log => !log.cancelled);
  const overallTotalCount = activeLogs.length;
  const overallTotalAmount = activeLogs.reduce((sum, log) => sum + getDisplayPrice(log), 0);

  const exportToExcel = () => {
    const exportData = logs.map((log) => ({
      '락커번호': log.lockerNumber,
      '입실날짜': new Date(log.entryTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      '입실시간': new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
      '퇴실날짜': log.exitTime 
        ? new Date(log.exitTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
        : '-',
      '퇴실시간': log.exitTime 
        ? new Date(log.exitTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '-',
      '주야': log.timeType,
      '기본': log.basePrice,
      '옵션': getOptionText(log),
      '옵션금액': log.optionAmount || '-',
      '추가요금': (log as any).hasAdditionalFeeRecord 
        ? (log.additionalFees && log.additionalFees > 0 ? `${log.additionalFees}원` : '전액할인')
        : '-',
      '최종요금': getDisplayPrice(log),
      '지불방식': formatPaymentMethod(log.paymentMethod, log.paymentCash, log.paymentCard, log.paymentTransfer),
      '취소': log.cancelled ? 'O' : '-',
      '비고': log.customerMemo || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '매출기록');
    
    const fileName = startDate && endDate 
      ? `매출기록_${startDate}_${endDate}.xlsx`
      : `매출기록_전체.xlsx`;
    
    XLSX.writeFile(wb, fileName);
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    
    // Add Korean font support (using default font for now)
    doc.setFont("helvetica");
    
    const title = startDate && endDate 
      ? `매출기록 (${startDate} ~ ${endDate})`
      : '매출기록 (전체)';
    
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    
    const tableData = logs.map((log) => [
      log.lockerNumber.toString(),
      new Date(log.entryTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
      log.exitTime 
        ? new Date(log.exitTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
        : '-',
      log.exitTime 
        ? new Date(log.exitTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '-',
      log.timeType,
      log.basePrice.toLocaleString(),
      getOptionText(log),
      log.optionAmount ? log.optionAmount.toLocaleString() : '-',
      (log as any).hasAdditionalFeeRecord 
        ? (log.additionalFees && log.additionalFees > 0 ? log.additionalFees.toLocaleString() + '원' : '전액할인')
        : '-',
      getDisplayPrice(log).toLocaleString(),
      formatPaymentMethod(log.paymentMethod, log.paymentCash, log.paymentCard, log.paymentTransfer),
      log.cancelled ? 'O' : '-',
      log.customerMemo || '-',
    ]);

    autoTable(doc, {
      head: [['락커번호', '입실날짜', '입실시간', '퇴실날짜', '퇴실시간', '주야', '기본', '옵션', '옵션금액', '추가요금', '최종요금', '지불방식', '취소', '비고']],
      body: tableData,
      startY: 25,
      styles: { fontSize: 8, font: 'helvetica' },
      headStyles: { fillColor: [66, 66, 66] },
    });
    
    const fileName = startDate && endDate 
      ? `매출기록_${startDate}_${endDate}.pdf`
      : `매출기록_전체.pdf`;
    
    doc.save(fileName);
  };

  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold">입출 기록 로그</h1>
              <p className="text-xs text-muted-foreground mt-1">
                {activeBusinessDays.length > 0
                  ? `영업일 ${activeBusinessDays.map(d => d.split('-')[2]).join(', ')}일 - ${logs.length}건`
                  : startDate && endDate
                  ? `${startDate} ~ ${endDate} 매출 - ${logs.length}건`
                  : startDate
                  ? `${startDate} 매출 - ${logs.length}건`
                  : `전체 누적 데이터 (${logs.length}건)`
                }
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {logs.length > 0 && (
              <>
                <Button 
                  variant="outline" 
                  onClick={exportToExcel}
                  data-testid="button-export-excel"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  엑셀 내보내기
                </Button>
                <Button 
                  variant="outline" 
                  onClick={exportToPDF}
                  data-testid="button-export-pdf"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  PDF 내보내기
                </Button>
              </>
            )}
            
            <Button 
              variant={showFilters || hasActiveFilters ? "default" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <Filter className="h-4 w-4 mr-2" />
              필터
            </Button>

            {/* 영업일 자동 조회 버튼 */}
            {!showBusinessDayFilter ? (
              <Button 
                variant={activeBusinessDays.length > 0 ? "default" : "outline"}
                onClick={() => {
                  setShowBusinessDayFilter(true);
                  setShowDateFilter(false);
                }}
                data-testid="button-show-business-day-filter"
              >
                <Zap className="h-4 w-4 mr-2" />
                영업일 조회
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="month"
                  value={businessDayYearMonth}
                  onChange={(e) => setBusinessDayYearMonth(e.target.value)}
                  className="w-36"
                  data-testid="input-business-day-month"
                />
                <Input
                  type="text"
                  value={businessDayInput}
                  onChange={(e) => setBusinessDayInput(e.target.value)}
                  placeholder="예: 25-27 또는 25, 27"
                  className="w-40"
                  data-testid="input-business-day"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    const days = parseBusinessDaysInput(businessDayInput);
                    if (days.length > 0 && businessDayYearMonth) {
                      const businessDays = days.map(d => 
                        `${businessDayYearMonth}-${String(d).padStart(2, '0')}`
                      );
                      setActiveBusinessDays(businessDays);
                      setStartDate("");
                      setEndDate("");
                    }
                  }}
                  data-testid="button-apply-business-day"
                >
                  조회
                </Button>
                {activeBusinessDays.length > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setActiveBusinessDays([]);
                      setBusinessDayInput("");
                    }}
                    data-testid="button-clear-business-day"
                  >
                    초기화
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setShowBusinessDayFilter(false);
                  }}
                  data-testid="button-hide-business-day-filter"
                >
                  닫기
                </Button>
              </div>
            )}

            {!showDateFilter ? (
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowDateFilter(true);
                  setShowBusinessDayFilter(false);
                }}
                data-testid="button-show-date-filter"
              >
                <Calendar className="h-4 w-4 mr-2" />
                기간 조회
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <Button
                  variant={useTimeFilter ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setUseTimeFilter(!useTimeFilter);
                    setStartDate("");
                    setEndDate("");
                  }}
                  data-testid="button-toggle-time-filter"
                >
                  {useTimeFilter ? "날짜+시간" : "날짜만"}
                </Button>
                <div className="flex items-center gap-2">
                  <Label htmlFor="start-date" className="text-sm whitespace-nowrap">
                    {useTimeFilter ? "시작" : "시작일"}
                  </Label>
                  <Input
                    id="start-date"
                    type={useTimeFilter ? "datetime-local" : "date"}
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setActiveBusinessDays([]); // 기간 조회 시 영업일 조회 해제
                    }}
                    className={useTimeFilter ? "w-52" : "w-40"}
                    data-testid="input-start-date"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="end-date" className="text-sm whitespace-nowrap">
                    {useTimeFilter ? "종료" : "종료일"}
                  </Label>
                  <Input
                    id="end-date"
                    type={useTimeFilter ? "datetime-local" : "date"}
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setActiveBusinessDays([]); // 기간 조회 시 영업일 조회 해제
                    }}
                    className={useTimeFilter ? "w-52" : "w-40"}
                    data-testid="input-end-date"
                  />
                </div>
                {(startDate || endDate) && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={clearDateFilter}
                    data-testid="button-clear-date"
                  >
                    전체보기
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setShowDateFilter(false);
                    clearDateFilter();
                  }}
                  data-testid="button-hide-date-filter"
                >
                  닫기
                </Button>
              </div>
            )}
          </div>
        </div>
        
        {/* 총합계 표시 (필터 없을 때 또는 항상 표시) */}
        {!hasActiveFilters && logs.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2" data-testid="text-overall-total">
                <span className="text-sm text-muted-foreground">총합계 (취소건 제외):</span>
                <span className="text-base font-bold">{overallTotalCount}건</span>
                <span className="text-sm text-muted-foreground">|</span>
                <span className="text-lg font-bold text-primary">₩{overallTotalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
        
        {/* 필터 옵션 */}
        {showFilters && (
          <div className="px-6 pb-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={cancelledFilter} onValueChange={setCancelledFilter}>
                <SelectTrigger className="w-32 h-9" data-testid="select-cancelled-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="active">정상건</SelectItem>
                  <SelectItem value="cancelled">취소건</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={timeTypeFilter} onValueChange={setTimeTypeFilter}>
                <SelectTrigger className="w-32 h-9" data-testid="select-timetype-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="day">주간</SelectItem>
                  <SelectItem value="night">야간</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                <SelectTrigger className="w-32 h-9" data-testid="select-payment-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="card">카드</SelectItem>
                  <SelectItem value="cash">현금</SelectItem>
                  <SelectItem value="transfer">이체</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={additionalFeeFilter} onValueChange={setAdditionalFeeFilter}>
                <SelectTrigger className="w-32 h-9" data-testid="select-additional-fee-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="with_fee">추가요금 있음</SelectItem>
                  <SelectItem value="without_fee">추가요금 없음</SelectItem>
                </SelectContent>
              </Select>
              
              {hasActiveFilters && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={clearAllFilters}
                  data-testid="button-clear-all-filters"
                >
                  필터 초기화
                </Button>
              )}
            </div>
            
            {/* 필터 결과 통계 */}
            {hasActiveFilters && (
              <div className="flex items-center gap-4 text-xs">
                {cancelledFilter !== "all" && (
                  <div className="flex items-center gap-2" data-testid="text-cancelled-filter-count">
                    <span className="text-muted-foreground">
                      {cancelledFilter === "cancelled" ? "취소건" : "정상건"}:
                    </span>
                    <span className="font-semibold">{displayedLogs.length}건</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="font-bold text-primary">{filteredTotalAmount.toLocaleString()}원</span>
                  </div>
                )}
                {timeTypeFilter !== "all" && (
                  <div className="flex items-center gap-2" data-testid="text-timetype-filter-count">
                    <span className="text-muted-foreground">
                      {timeTypeFilter === "day" ? "주간" : "야간"}:
                    </span>
                    <span className="font-semibold">{displayedLogs.length}건</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="font-bold text-primary">{filteredTotalAmount.toLocaleString()}원</span>
                  </div>
                )}
                {paymentMethodFilter !== "all" && (
                  <div className="flex items-center gap-2" data-testid="text-payment-filter-count">
                    <span className="text-muted-foreground">
                      {paymentMethodFilter === "card" ? "카드" : paymentMethodFilter === "transfer" ? "이체" : "현금"}:
                    </span>
                    <span className="font-semibold">{displayedLogs.length}건</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="font-bold text-primary">{filteredTotalAmount.toLocaleString()}원</span>
                  </div>
                )}
                {additionalFeeFilter !== "all" && (
                  <div className="flex items-center gap-2" data-testid="text-additional-fee-filter-count">
                    <span className="text-muted-foreground">
                      {additionalFeeFilter === "with_fee" ? "추가요금 있음" : "추가요금 없음"}:
                    </span>
                    <span className="font-semibold">{displayedLogs.length}건</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="font-bold text-primary">{filteredTotalAmount.toLocaleString()}원</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Log Table */}
      <div className="flex-1 overflow-hidden p-6">
        <ScrollArea className="h-full">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50">
              <TableRow>
                <TableHead className="w-16 text-sm font-bold whitespace-nowrap">락커번호</TableHead>
                <TableHead className="w-24 text-sm font-bold whitespace-nowrap">입실날짜</TableHead>
                <TableHead className="w-20 text-sm font-bold whitespace-nowrap">입실시간</TableHead>
                <TableHead className="w-24 text-sm font-bold whitespace-nowrap">퇴실날짜</TableHead>
                <TableHead className="w-20 text-sm font-bold whitespace-nowrap">퇴실시간</TableHead>
                <TableHead className="w-16 text-sm font-bold whitespace-nowrap">주야</TableHead>
                <TableHead className="w-20 text-sm font-bold whitespace-nowrap">기본</TableHead>
                <TableHead className="w-24 text-sm font-bold whitespace-nowrap">옵션</TableHead>
                <TableHead className="w-20 text-sm font-bold whitespace-nowrap">옵션금액</TableHead>
                <TableHead className="w-20 text-sm font-bold whitespace-nowrap">추가요금</TableHead>
                <TableHead className="w-24 text-sm font-bold whitespace-nowrap">최종요금</TableHead>
                <TableHead className="w-20 text-sm font-bold whitespace-nowrap">지불방식</TableHead>
                <TableHead className="w-16 text-sm font-bold whitespace-nowrap">취소</TableHead>
                <TableHead className="min-w-28 text-sm font-bold whitespace-nowrap">비고</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground py-12 text-sm">
                    로딩중...
                  </TableCell>
                </TableRow>
              ) : displayedLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground py-12 text-sm">
                    {startDate && endDate
                      ? `${startDate} ~ ${endDate} 기간에 기록된 데이터가 없습니다`
                      : startDate
                      ? `${startDate}에 기록된 데이터가 없습니다`
                      : hasActiveFilters
                      ? '필터 조건에 맞는 데이터가 없습니다'
                      : '아직 기록된 데이터가 없습니다'
                    }
                  </TableCell>
                </TableRow>
              ) : (
                displayedLogs.map((log) => {
                  const isAdditionalFeeOnly = (log as any).additionalFeeOnly === true;
                  return (
                  <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                    <TableCell className="font-semibold text-base">{log.lockerNumber}</TableCell>
                    <TableCell className="text-sm">
                      {isAdditionalFeeOnly 
                        ? '' 
                        : new Date(log.entryTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
                      }
                    </TableCell>
                    <TableCell className="text-sm">
                      {isAdditionalFeeOnly 
                        ? '' 
                        : new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
                      }
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.exitTime 
                        ? new Date(log.exitTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
                        : '-'
                      }
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.exitTime 
                        ? new Date(log.exitTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 items-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                          log.timeType === '추가요금' 
                            ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                            : log.timeType === '주간' 
                            ? 'bg-primary/10 text-primary' 
                            : 'bg-accent text-accent-foreground'
                        }`}>
                          {log.timeType}
                        </span>
                        {(log as any).hasAdditionalFeeRecord && log.timeType !== '추가요금' && (
                          <span className="text-xs px-1.5 py-0.5 rounded whitespace-nowrap bg-red-500/10 text-red-600 dark:text-red-400">
                            추가
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{log.basePrice.toLocaleString()}원</TableCell>
                    <TableCell className="text-sm">{getOptionText(log)}</TableCell>
                    <TableCell className="text-sm">
                      {log.optionAmount ? `${log.optionAmount.toLocaleString()}원` : '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(log as any).hasAdditionalFeeRecord ? (
                        log.additionalFees && log.additionalFees > 0 ? (
                          <span className="text-destructive font-medium">
                            {log.additionalFees.toLocaleString()}원
                          </span>
                        ) : (
                          <span className="text-orange-600 dark:text-orange-400 font-medium whitespace-nowrap">
                            전액할인
                          </span>
                        )
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className={`font-semibold text-base ${isAdditionalFeeOnly ? 'text-red-600 dark:text-red-400' : ''}`}>
                      <div className="flex items-center gap-1.5">
                        <span>{getDisplayPrice(log).toLocaleString()}원</span>
                        {log.deferredPayment && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 whitespace-nowrap">
                            후불
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatPaymentMethod(log.paymentMethod, log.paymentCash, log.paymentCard, log.paymentTransfer)}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        log.cancelled ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                      }`}>
                        {log.cancelled ? 'O' : '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span>{log.customerMemo || '-'}</span>
                        {log.customerMemo && log.customerMemo.trim() && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button 
                                className="p-1 rounded hover:bg-yellow-100 dark:hover:bg-yellow-200 transition-colors"
                                data-testid={`memo-icon-${log.id}`}
                              >
                                <MessageSquare className="w-4 h-4 text-yellow-600" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent 
                              side="left" 
                              align="center"
                              sideOffset={8}
                              className="w-max max-w-[80vw] p-3 text-sm bg-yellow-100 dark:bg-yellow-200 border-yellow-300 dark:border-yellow-400 shadow-lg z-[100]"
                              data-testid={`popover-memo-log-${log.id}`}
                            >
                              <div className="flex items-start gap-2">
                                <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0 text-yellow-700" />
                                <p className="whitespace-pre-wrap text-gray-900">{log.customerMemo}</p>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Rental Transactions Section - 추가매출 */}
      {(() => {
        // Apply rental filters
        let filteredRentals = [...rentalTransactions];
        
        // 영업일 자동 조회 필터 for rental section
        if (activeRentalBusinessDays.length > 0) {
          filteredRentals = filteredRentals.filter(txn => {
            const rentalDate = new Date(txn.rentalTime);
            
            // 각 영업일에 대해 시간 범위 확인
            for (const businessDay of activeRentalBusinessDays) {
              const businessDayDate = new Date(businessDay + 'T12:00:00');
              const range = getBusinessDayRange(businessDayDate, businessDayStartHour);
              
              if (rentalDate >= range.start && rentalDate <= range.end) {
                return true;
              }
            }
            return false;
          });
        } else if (rentalStartDate || rentalEndDate) {
          // Date/Time filter for rental section
          filteredRentals = filteredRentals.filter(txn => {
            const rentalDate = new Date(txn.rentalTime);
            
            if (rentalUseTimeFilter) {
              // Time-based filtering
              const start = rentalStartDate ? new Date(rentalStartDate) : null;
              const end = rentalEndDate ? new Date(rentalEndDate) : null;
              
              if (start && end) {
                return rentalDate >= start && rentalDate <= end;
              } else if (start) {
                return rentalDate >= start;
              } else if (end) {
                return rentalDate <= end;
              }
            } else {
              // Date-only filtering
              const rentalDateOnly = rentalDate.toISOString().split('T')[0];
              
              if (rentalStartDate && rentalEndDate) {
                return rentalDateOnly >= rentalStartDate && rentalDateOnly <= rentalEndDate;
              } else if (rentalStartDate) {
                return rentalDateOnly >= rentalStartDate;
              } else if (rentalEndDate) {
                return rentalDateOnly <= rentalEndDate;
              }
            }
            
            return true;
          });
        }
        
        if (rentalItemFilter !== "all") {
          filteredRentals = filteredRentals.filter(txn => txn.itemName === rentalItemFilter);
        }
        
        if (rentalPaymentFilter !== "all") {
          filteredRentals = filteredRentals.filter(txn => txn.paymentMethod === rentalPaymentFilter);
        }
        
        if (rentalDepositFilter === "received") {
          filteredRentals = filteredRentals.filter(txn => txn.depositStatus === 'received');
        } else if (rentalDepositFilter === "refunded") {
          filteredRentals = filteredRentals.filter(txn => txn.depositStatus === 'refunded');
        } else if (rentalDepositFilter === "forfeited") {
          filteredRentals = filteredRentals.filter(txn => txn.depositStatus === 'forfeited');
        } else if (rentalDepositFilter === "none") {
          filteredRentals = filteredRentals.filter(txn => txn.depositStatus === 'none');
        }
        
        // Locker number filter
        if (rentalLockerNumberFilter) {
          const lockerNum = parseInt(rentalLockerNumberFilter);
          if (!isNaN(lockerNum)) {
            filteredRentals = filteredRentals.filter(txn => txn.lockerNumber === lockerNum);
          }
        }
        
        // Calculate cash totals
        const cashRentals = filteredRentals.filter(txn => txn.paymentMethod === 'cash');
        const cashRentalFeeTotal = cashRentals.reduce((sum, txn) => sum + txn.rentalFee, 0);
        const cashDepositTotal = cashRentals.reduce((sum, txn) => {
          // Only count deposit as revenue if status is 'received' or 'forfeited'
          if (txn.depositStatus === 'received' || txn.depositStatus === 'forfeited') {
            return sum + txn.depositAmount;
          }
          return sum;
        }, 0);
        
        const hasRentalFilters = rentalItemFilter !== "all" || rentalPaymentFilter !== "all" || rentalDepositFilter !== "all" || rentalLockerNumberFilter !== "" || rentalStartDate !== "" || rentalEndDate !== "" || activeRentalBusinessDays.length > 0;
        
        return (
          <Collapsible open={isRentalSectionOpen} onOpenChange={setIsRentalSectionOpen} className="mt-6">
            <CollapsibleTrigger 
              className="w-full flex items-center justify-between p-4 rounded-md hover-elevate border border-border bg-card cursor-pointer"
              data-testid="button-toggle-rental-section"
            >
              <div>
                <h2 className="text-lg font-semibold">추가매출 (대여 물품)</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  담요/롱타올 대여 거래 - {filteredRentals.length}건
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right space-y-1">
                  <div>
                    <p className="text-xs text-muted-foreground">현금 대여금</p>
                    <p className="text-sm font-bold text-green-600 dark:text-green-400">
                      {cashRentalFeeTotal.toLocaleString()}원
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">현금 보증금</p>
                    <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                      {cashDepositTotal.toLocaleString()}원
                    </p>
                  </div>
                </div>
                {isRentalSectionOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="border rounded-lg p-6 bg-card mt-2">
              {/* Rental Filters */}
            <div className="mb-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Button 
                  variant={showRentalFilters ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowRentalFilters(!showRentalFilters)}
                  data-testid="button-toggle-rental-filters"
                >
                  <Filter className="h-3 w-3 mr-2" />
                  필터
                </Button>
                
                {/* 추가매출 영업일 자동 조회 */}
                {!showRentalBusinessDayFilter ? (
                  <Button 
                    variant={activeRentalBusinessDays.length > 0 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowRentalBusinessDayFilter(true)}
                    data-testid="button-show-rental-business-day-filter"
                  >
                    <Zap className="h-3 w-3 mr-2" />
                    영업일 조회
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="month"
                      value={rentalBusinessDayYearMonth}
                      onChange={(e) => setRentalBusinessDayYearMonth(e.target.value)}
                      className="w-32 h-8"
                      data-testid="input-rental-business-day-month"
                    />
                    <Input
                      type="text"
                      value={rentalBusinessDayInput}
                      onChange={(e) => setRentalBusinessDayInput(e.target.value)}
                      placeholder="예: 25-27"
                      className="w-28 h-8"
                      data-testid="input-rental-business-day"
                    />
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        const days = parseBusinessDaysInput(rentalBusinessDayInput);
                        if (days.length > 0 && rentalBusinessDayYearMonth) {
                          const businessDays = days.map(d => 
                            `${rentalBusinessDayYearMonth}-${String(d).padStart(2, '0')}`
                          );
                          setActiveRentalBusinessDays(businessDays);
                          setRentalStartDate("");
                          setRentalEndDate("");
                        }
                      }}
                      data-testid="button-apply-rental-business-day"
                    >
                      조회
                    </Button>
                    {activeRentalBusinessDays.length > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8"
                        onClick={() => {
                          setActiveRentalBusinessDays([]);
                          setRentalBusinessDayInput("");
                        }}
                        data-testid="button-clear-rental-business-day"
                      >
                        초기화
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="h-8"
                      onClick={() => setShowRentalBusinessDayFilter(false)}
                      data-testid="button-hide-rental-business-day-filter"
                    >
                      닫기
                    </Button>
                  </div>
                )}
                
                {showRentalFilters && (
                  <>
                    <Select value={rentalItemFilter} onValueChange={setRentalItemFilter}>
                      <SelectTrigger className="w-36 h-8" data-testid="select-rental-item-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체 항목</SelectItem>
                        <SelectItem value="담요">담요</SelectItem>
                        <SelectItem value="롱타올">롱타올</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Select value={rentalPaymentFilter} onValueChange={setRentalPaymentFilter}>
                      <SelectTrigger className="w-28 h-8" data-testid="select-rental-payment-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체</SelectItem>
                        <SelectItem value="cash">현금</SelectItem>
                        <SelectItem value="card">카드</SelectItem>
                        <SelectItem value="transfer">이체</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Select value={rentalDepositFilter} onValueChange={setRentalDepositFilter}>
                      <SelectTrigger className="w-36 h-8" data-testid="select-rental-deposit-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체</SelectItem>
                        <SelectItem value="received">보증금 받음</SelectItem>
                        <SelectItem value="refunded">보증금 환급</SelectItem>
                        <SelectItem value="forfeited">보증금 몰수</SelectItem>
                        <SelectItem value="none">보증금 없음</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <div className="flex items-center gap-2">
                      <Label htmlFor="rental-locker-number" className="text-sm whitespace-nowrap">락커번호</Label>
                      <Input
                        id="rental-locker-number"
                        type="number"
                        min="1"
                        max="999"
                        value={rentalLockerNumberFilter}
                        onChange={(e) => setRentalLockerNumberFilter(e.target.value)}
                        placeholder="번호 입력"
                        className="w-28 h-8"
                        data-testid="input-rental-locker-number"
                      />
                    </div>
                    
                    {hasRentalFilters && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setRentalItemFilter("all");
                          setRentalPaymentFilter("all");
                          setRentalDepositFilter("all");
                          setRentalLockerNumberFilter("");
                          setRentalStartDate("");
                          setRentalEndDate("");
                          setRentalUseTimeFilter(false);
                          setActiveRentalBusinessDays([]);
                          setRentalBusinessDayInput("");
                        }}
                        data-testid="button-clear-rental-filters"
                      >
                        필터 초기화
                      </Button>
                    )}
                  </>
                )}
              </div>
              
              {/* Date/Time filter for rental section */}
              {showRentalFilters && (
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    variant={rentalUseTimeFilter ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRentalUseTimeFilter(!rentalUseTimeFilter)}
                    data-testid="button-toggle-rental-time-filter"
                  >
                    {rentalUseTimeFilter ? "날짜+시간" : "날짜"}
                  </Button>
                  
                  <div className="flex items-center gap-2">
                    <Label htmlFor="rental-start-date" className="text-sm whitespace-nowrap">시작</Label>
                    <Input
                      id="rental-start-date"
                      type={rentalUseTimeFilter ? "datetime-local" : "date"}
                      value={rentalStartDate}
                      onChange={(e) => setRentalStartDate(e.target.value)}
                      className="w-auto h-8"
                      data-testid="input-rental-start-date"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Label htmlFor="rental-end-date" className="text-sm whitespace-nowrap">종료</Label>
                    <Input
                      id="rental-end-date"
                      type={rentalUseTimeFilter ? "datetime-local" : "date"}
                      value={rentalEndDate}
                      onChange={(e) => setRentalEndDate(e.target.value)}
                      className="w-auto h-8"
                      data-testid="input-rental-end-date"
                    />
                  </div>
                  
                  {(rentalStartDate || rentalEndDate) && (
                    <div className="text-xs text-muted-foreground">
                      📅 {rentalUseTimeFilter ? "날짜+시간" : "날짜"} 필터 적용 중
                    </div>
                  )}
                </div>
              )}
            </div>

            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24 text-sm font-bold whitespace-nowrap">항목</TableHead>
                    <TableHead className="w-24 text-sm font-bold whitespace-nowrap">대여날짜</TableHead>
                    <TableHead className="w-20 text-sm font-bold whitespace-nowrap">대여시간</TableHead>
                    <TableHead className="w-24 text-sm font-bold whitespace-nowrap">반납날짜</TableHead>
                    <TableHead className="w-20 text-sm font-bold whitespace-nowrap">반납시간</TableHead>
                    <TableHead className="w-16 text-sm font-bold whitespace-nowrap">락커</TableHead>
                    <TableHead className="w-20 text-sm font-bold whitespace-nowrap">대여금액</TableHead>
                    <TableHead className="w-20 text-sm font-bold whitespace-nowrap">보증금액</TableHead>
                    <TableHead className="w-20 text-sm font-bold whitespace-nowrap">지급방식</TableHead>
                    <TableHead className="w-24 text-sm font-bold whitespace-nowrap">보증금처리</TableHead>
                    <TableHead className="w-20 text-sm font-bold whitespace-nowrap">보증금매출</TableHead>
                    <TableHead className="w-20 text-sm font-bold whitespace-nowrap">합계</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRentals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                        대여 거래가 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRentals.map((txn) => {
                      // Calculate deposit revenue: only if 'received' or 'forfeited'
                      const depositRevenue = (txn.depositStatus === 'received' || txn.depositStatus === 'forfeited') 
                        ? txn.depositAmount 
                        : 0;
                      
                      // Calculate total: rental fee + deposit revenue
                      const total = txn.rentalFee + depositRevenue;
                      
                      return (
                        <TableRow key={txn.id} data-testid={`row-rental-${txn.id}`}>
                          <TableCell className="text-sm font-medium">{txn.itemName}</TableCell>
                          <TableCell className="text-sm">
                            {new Date(txn.rentalTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(txn.rentalTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </TableCell>
                          <TableCell className="text-sm">
                            {txn.returnTime 
                              ? new Date(txn.returnTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
                              : '-'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {txn.returnTime 
                              ? new Date(txn.returnTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
                              : '-'}
                          </TableCell>
                          <TableCell className="font-semibold text-base">{txn.lockerNumber}</TableCell>
                          <TableCell className="text-sm">{txn.rentalFee.toLocaleString()}원</TableCell>
                          <TableCell className="text-sm">{txn.depositAmount.toLocaleString()}원</TableCell>
                          <TableCell className="text-sm">
                            {formatPaymentMethod(txn.paymentMethod, txn.paymentCash, txn.paymentCard, txn.paymentTransfer)}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${
                              txn.depositStatus === 'received' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' :
                              txn.depositStatus === 'refunded' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' :
                              txn.depositStatus === 'forfeited' ? 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300' :
                              'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                            }`}>
                              {txn.depositStatus === 'received' ? '받음' : 
                               txn.depositStatus === 'refunded' ? '환급' : 
                               txn.depositStatus === 'forfeited' ? '몰수' : 
                               '없음'}
                            </span>
                          </TableCell>
                          <TableCell className="font-semibold text-base text-primary">
                            {depositRevenue.toLocaleString()}원
                          </TableCell>
                          <TableCell className="font-bold text-base text-green-600 dark:text-green-400">
                            {total.toLocaleString()}원
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        );
      })()}

    </div>
  );
}
