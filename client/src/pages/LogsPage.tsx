import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ArrowLeft, FileSpreadsheet, FileText, Filter, ChevronDown, ChevronUp, Zap, MessageSquare, RotateCcw, Hash } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LogsToolWorkspace } from "@/components/LogsToolWorkspace";
import { LockerNumberLookupDialog } from "@/components/LockerNumberLookupDialog";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as localDb from "@/lib/localDb";
import { formatPaymentMethod } from "@/lib/utils";
import { getBusinessDay, getBusinessDayRange } from "@shared/businessDay";
import { FilterChip } from "@/components/FilterChip";
import { BusinessDayPicker } from "@/components/BusinessDayPicker";

/** YYYY-MM-DD */
function formatDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 상세기록 기본 조회: 최근 7일 (전체 누적 로드로 인한 태블릿 지연 방지) */
function getDefaultLogsDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return { start: formatDateInput(start), end: formatDateInput(end) };
}

interface LogEntry {
  id: string;
  lockerNumber: number;
  entryTime: string;
  exitTime?: string | null;
  timeType: '주간' | '야간' | '추가요금';
  basePrice: number;
  optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' | 'free';
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
  refundAmount?: number; // 환불 금액
  refundNote?: string; // 환불 사유
  refundTime?: string; // 환불 처리 시각
  isStaff?: boolean; // 직원 입실 여부
}

// 분리결제(현금/카드/이체 중 2개 이상 혼합) 여부 — 어떤 지불방식 필터를 선택해도 함께 표시한다
function isSplitPayment(log: { paymentCash?: number; paymentCard?: number; paymentTransfer?: number }): boolean {
  const count = [log.paymentCash, log.paymentCard, log.paymentTransfer]
    .filter(v => (v ?? 0) > 0).length;
  return count >= 2;
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
  quantity?: number;
  returnCompleted?: number;
}

export default function LogsPage() {
  const { toast } = useToast();
  // Get settings for business day calculation
  const settings = localDb.getSettings();
  const businessDayStartHour = settings.businessDayStartHour;
  
  const defaultRange = getDefaultLogsDateRange();
  const [startDate, setStartDate] = useState<string>(defaultRange.start);
  const [endDate, setEndDate] = useState<string>(defaultRange.end);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [additionalFeeEvents, setAdditionalFeeEvents] = useState<AdditionalFeeEvent[]>([]);
  const [rentalTransactions, setRentalTransactions] = useState<RentalTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showLockerNumberDialog, setShowLockerNumberDialog] = useState(false);
  const [cancelledFilter, setCancelledFilter] = useState<string>("all");
  const [timeTypeFilter, setTimeTypeFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [additionalFeeFilter, setAdditionalFeeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<'exitTime' | 'entryTime'>("entryTime");
  const [lockerNumberFilter, setLockerNumberFilter] = useState<number[]>([]);
  const lockerGroups = useMemo(() => {
    try {
      return localDb.getLockerGroups() as Array<{ id: string; name: string; startNumber: number; endNumber: number; sortOrder: number }>;
    } catch {
      return [];
    }
  }, []);
  const lockerNumbers = useMemo(() => {
    const nums: number[] = [];
    for (const group of lockerGroups) {
      for (let n = group.startNumber; n <= group.endNumber; n++) {
        if (!nums.includes(n)) nums.push(n);
      }
    }
    return nums.length > 0 ? nums : Array.from({ length: 80 }, (_, i) => i + 1);
  }, [lockerGroups]);
  
  // 영업일 자동 조회
  const [showBusinessDayFilter, setShowBusinessDayFilter] = useState(false);
  const [activeBusinessDays, setActiveBusinessDays] = useState<string[]>([]);
  
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
  const [revenueItemOptions, setRevenueItemOptions] = useState<Array<{
    id: string;
    name: string;
    billingType?: 'rental' | 'simple';
    depositAmount?: number;
  }>>([]);
  
  // 추가매출 영업일 자동 조회
  const [showRentalBusinessDayFilter, setShowRentalBusinessDayFilter] = useState(false);
  const [activeRentalBusinessDays, setActiveRentalBusinessDays] = useState<string[]>([]);
  // 소급 환불 다이얼로그 state
  const [retroRefundDialogOpen, setRetroRefundDialogOpen] = useState(false);
  const [retroRefundLogId, setRetroRefundLogId] = useState<string | null>(null);
  const [retroRefundAmount, setRetroRefundAmount] = useState<string>("");
  const [retroRefundNote, setRetroRefundNote] = useState<string>("");
  const [retroRefundMethod, setRetroRefundMethod] = useState<'cash' | 'card' | 'transfer'>('cash');

  // Load data on mount and when filters change
  useEffect(() => {
    loadLogs();
  }, [startDate, endDate, activeBusinessDays]);
  
  const loadRevenueItemOptions = () => {
    try {
      const items = localDb.getAdditionalRevenueItems();
      setRevenueItemOptions(
        items.map((item: {
          id: string;
          name: string;
          billingType?: 'rental' | 'simple';
          depositAmount?: number;
        }) => ({
          id: item.id,
          name: item.name,
          billingType: item.billingType,
          depositAmount: item.depositAmount,
        }))
      );
    } catch {
      setRevenueItemOptions([]);
    }
  };

  // Auto-refresh when component mounts (navigating to this page)
  useEffect(() => {
    loadRevenueItemOptions();
  }, []);
  
  // Auto-refresh when page becomes visible (browser tab focus)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadLogs();
        loadRevenueItemOptions();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // 시스템설정에서 삭제한 항목이 필터에 남아 있으면 전체로 초기화
  useEffect(() => {
    if (rentalItemFilter === "all") return;
    const stillExists = revenueItemOptions.some((item) => item.name === rentalItemFilter);
    if (!stillExists) {
      setRentalItemFilter("all");
    }
  }, [revenueItemOptions, rentalItemFilter]);

  const handleRetroRefund = () => {
    if (!retroRefundLogId) return;
    const amount = parseInt(retroRefundAmount) || 0;
    if (amount <= 0) {
      toast({ title: "오류", description: "환불 금액을 입력해주세요.", variant: "destructive" });
      return;
    }
    localDb.updateEntry(retroRefundLogId, {
      refundAmount: amount,
      refundNote: retroRefundNote || undefined,
      refundTime: new Date().toISOString(),
      refundMethod: retroRefundMethod,
    });
    setRetroRefundDialogOpen(false);
    setRetroRefundLogId(null);
    setRetroRefundAmount("");
    setRetroRefundNote("");
    setRetroRefundMethod('cash');
    loadLogs();
    toast({ title: "환불 처리 완료", description: `${amount.toLocaleString()}원이 환불 처리되었습니다.` });
  };

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
      
      // Attach additional fees for each log entry (일괄 조회로 N+1 방지)
      // Combine same-business-day fees (stored in locker_logs.additional_fees column)
      // with different-business-day fees (stored in additional_fee_events table)
      const feeEventsForLogs = localDb.getAdditionalFeeEventsForLockerLogs(result.map((l) => l.id));
      const feesByLogId = new Map<string, typeof feeEventsForLogs>();
      for (const event of feeEventsForLogs) {
        const list = feesByLogId.get(event.lockerLogId) || [];
        list.push(event);
        feesByLogId.set(event.lockerLogId, list);
      }
      const logsWithFees = result.map(log => {
        const additionalFeeEvents = feesByLogId.get(log.id) || [];
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

  const clearAllFilters = () => {
    setCancelledFilter("all");
    setTimeTypeFilter("all");
    setPaymentMethodFilter("all");
    setAdditionalFeeFilter("all");
  };

  const hasChipFilters = cancelledFilter !== "all" || timeTypeFilter !== "all" || paymentMethodFilter !== "all" || additionalFeeFilter !== "all";
  const hasActiveFilters = hasChipFilters || lockerNumberFilter.length > 0;

  // Apply filters to logs
  let displayedLogs = [...logs];

  if (cancelledFilter === "cancelled") {
    displayedLogs = displayedLogs.filter(log => log.cancelled);
  } else if (cancelledFilter === "active") {
    displayedLogs = displayedLogs.filter(log => !log.cancelled);
  } else if (cancelledFilter === "free") {
    displayedLogs = displayedLogs.filter(log => log.optionType === 'free' && !log.isStaff);
  } else if (cancelledFilter === "staff") {
    displayedLogs = displayedLogs.filter(log => log.isStaff === true);
  } else if (cancelledFilter === "refunded") {
    displayedLogs = displayedLogs.filter(log => (log as any).refundAmount && (log as any).refundAmount > 0);
  }

  if (timeTypeFilter === "day") {
    displayedLogs = displayedLogs.filter(log => log.timeType === '주간');
  } else if (timeTypeFilter === "night") {
    displayedLogs = displayedLogs.filter(log => log.timeType === '야간');
  }

  if (paymentMethodFilter === "card") {
    displayedLogs = displayedLogs.filter(log => log.paymentMethod === 'card' || isSplitPayment(log));
  } else if (paymentMethodFilter === "cash") {
    displayedLogs = displayedLogs.filter(log => log.paymentMethod === 'cash' || !log.paymentMethod || isSplitPayment(log));
  } else if (paymentMethodFilter === "transfer") {
    displayedLogs = displayedLogs.filter(log => log.paymentMethod === 'transfer' || isSplitPayment(log));
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

  if (lockerNumberFilter.length > 0) {
    displayedLogs = displayedLogs.filter(log => lockerNumberFilter.includes(log.lockerNumber));
  }

  // Sort entries based on sortBy option
  displayedLogs = [...displayedLogs].sort((a, b) => {
    if (sortBy === 'entryTime') {
      // 입실시간 기준 정렬
      const timeA = a.entryTime || '';
      const timeB = b.entryTime || '';
      return new Date(timeB).getTime() - new Date(timeA).getTime(); // 최신순
    } else {
      // 퇴실시간 기준: 퇴실시간 우선, 없으면 입실시간
      const timeA = a.exitTime || a.entryTime || '';
      const timeB = b.exitTime || b.entryTime || '';
      return new Date(timeB).getTime() - new Date(timeA).getTime(); // 최신순
    }
  });

  // Helper functions for display and export
  const getOptionText = (log: LogEntry) => {
    if (log.optionType === 'none') return '없음';
    if (log.optionType === 'foreigner') return '외국인';
    if (log.optionType === 'discount') return '할인';
    if (log.optionType === 'custom') return '할인직접입력';
    if (log.optionType === 'direct_price') return '요금직접입력';
    if (log.optionType === 'free') return log.isStaff ? '직원' : '무료입장';
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
    const refund = log.refundAmount || 0;
    
    // 추가요금 전용 행: finalPrice 그대로 (이미 추가요금만)
    if (isAdditionalFeeOnly) {
      return log.finalPrice;
    }
    
    // 퇴실하지 않았으면 finalPrice 그대로 (환불 미반영 — 아직 퇴실 전)
    if (!log.exitTime) {
      return log.finalPrice;
    }
    
    // 추가요금 기록이 없으면 finalPrice - 환불금액
    if (!(log as any).hasAdditionalFeeRecord) {
      return log.finalPrice - refund;
    }
    
    // 퇴실 시 영업일 계산
    const exitBusinessDay = getBusinessDay(new Date(log.exitTime), businessDayStartHour);
    
    // 입실 시 영업일: businessDay 필드 직접 사용 (데이터베이스에서 매핑됨)
    const entryBusinessDay = log.businessDay 
      || getBusinessDay(new Date(log.entryTime), businessDayStartHour);
    
    // 다른 영업일 퇴실: 추가요금만 표시 - 환불금액
    if (exitBusinessDay !== entryBusinessDay) {
      return (log.additionalFees || 0) - refund;
    }
    
    // 같은 영업일 퇴실: finalPrice - 환불금액
    return log.finalPrice - refund;
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
      <div className="border-b shrink-0 flex flex-col min-h-0">
        <div className="p-6 pb-4 shrink-0">
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
                    ? `영업일 ${activeBusinessDays.length <= 3 ? activeBusinessDays.join(', ') : `${activeBusinessDays[0]} 외 ${activeBusinessDays.length - 1}일`} · ${logs.length}건`
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
            <Button 
              variant={showFilters || hasChipFilters ? "default" : "outline"}
              className="h-12 px-5 rounded-xl text-base font-semibold"
              onClick={() => setShowFilters((open) => !open)}
              data-testid="button-toggle-filters"
            >
              <Filter className="h-5 w-5 mr-2" />
              필터
            </Button>

            <Button 
              variant={showBusinessDayFilter || activeBusinessDays.length > 0 ? "default" : "outline"}
              className="h-12 px-5 rounded-xl text-base font-semibold"
              onClick={() => setShowBusinessDayFilter((open) => !open)}
              data-testid="button-show-business-day-filter"
            >
              <Zap className="h-5 w-5 mr-2" />
              영업일 조회
            </Button>
            </div>
          </div>
        </div>

        {/* 총합계 + 락카번호 조회 + 내보내기 */}
        <div className="px-6 pb-4 pt-0 border-t mx-6">
          <div className="flex items-center justify-between gap-3 pt-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              {logs.length > 0 && (
                <div className="flex items-center gap-2" data-testid="text-overall-total">
                  <span className="text-sm text-muted-foreground">총합계 (취소건 제외):</span>
                  <span className="text-base font-bold">{overallTotalCount}건</span>
                  <span className="text-sm text-muted-foreground">|</span>
                  <span className="text-lg font-bold text-primary">₩{overallTotalAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant={lockerNumberFilter.length > 0 ? "default" : "outline"}
                  size="sm"
                  className="h-8 rounded-lg"
                  onClick={() => setShowLockerNumberDialog(true)}
                  data-testid="button-locker-number-lookup"
                >
                  <Hash className="h-3.5 w-3.5 mr-1" />
                  {lockerNumberFilter.length === 0
                    ? "락카번호 조회"
                    : lockerNumberFilter.length === 1
                      ? `${lockerNumberFilter[0]}번`
                      : lockerNumberFilter.length <= 3
                        ? `${lockerNumberFilter.slice().sort((a, b) => a - b).join(", ")}번`
                        : `${[...lockerNumberFilter].sort((a, b) => a - b).slice(0, 2).join(", ")}번 외 ${lockerNumberFilter.length - 2}개`}
                </Button>
                {lockerNumberFilter.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg"
                    onClick={() => setLockerNumberFilter([])}
                    data-testid="button-clear-locker-number-filter"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    초기화
                  </Button>
                )}
              </div>
            </div>
            {logs.length > 0 && (
              <div className="flex items-center gap-0.5 ml-auto">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                      onClick={exportToExcel}
                      data-testid="button-export-excel"
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      <span className="sr-only">엑셀로 내보내기</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>엑셀로 내보내기</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                      onClick={exportToPDF}
                      data-testid="button-export-pdf"
                    >
                      <FileText className="h-4 w-4" />
                      <span className="sr-only">PDF로 내보내기</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>PDF로 내보내기</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Log Table + 추가매출 (동일 스크롤 영역) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="min-h-0">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50 z-10">
              <TableRow>
                <TableHead className="w-16 data-table-head whitespace-nowrap">락커번호</TableHead>
                <TableHead className="w-24 data-table-head whitespace-nowrap">입실날짜</TableHead>
                <TableHead className="w-20 data-table-head whitespace-nowrap">입실시간</TableHead>
                <TableHead className="w-24 data-table-head whitespace-nowrap">퇴실날짜</TableHead>
                <TableHead className="w-20 data-table-head whitespace-nowrap">퇴실시간</TableHead>
                <TableHead className="w-16 data-table-head whitespace-nowrap">주야</TableHead>
                <TableHead className="w-20 data-table-head whitespace-nowrap text-right">기본</TableHead>
                <TableHead className="w-24 data-table-head whitespace-nowrap">옵션</TableHead>
                <TableHead className="w-20 data-table-head whitespace-nowrap text-right">옵션금액</TableHead>
                <TableHead className="w-20 data-table-head whitespace-nowrap text-right">추가요금</TableHead>
                <TableHead className="w-24 data-table-head whitespace-nowrap text-right">최종요금</TableHead>
                <TableHead className="w-20 data-table-head whitespace-nowrap">지불방식</TableHead>
                <TableHead className="w-16 data-table-head whitespace-nowrap">취소</TableHead>
                <TableHead className="min-w-28 data-table-head whitespace-nowrap">비고</TableHead>
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
                        <span className={`text-xs px-1.5 py-0.5 status-badge whitespace-nowrap ${
                          log.timeType === '추가요금'
                            ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                            : log.timeType === '주간'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-accent text-accent-foreground'
                        }`}>
                          {log.timeType === '추가요금' ? '추가' : log.timeType}
                        </span>
                        {(log as any).hasAdditionalFeeRecord && log.timeType !== '추가요금' && (
                          <span className="text-xs px-1.5 py-0.5 status-badge whitespace-nowrap bg-red-500/10 text-red-600 dark:text-red-400">
                            추가
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-right">{log.basePrice.toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{getOptionText(log)}</TableCell>
                    <TableCell className="text-sm text-right">
                      {log.optionAmount ? log.optionAmount.toLocaleString() : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-right">
                      {(log as any).hasAdditionalFeeRecord ? (
                        log.additionalFees && log.additionalFees > 0 ? (
                          <span className="text-destructive font-medium">
                            {log.additionalFees.toLocaleString()}
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
                    <TableCell className={`font-semibold text-base text-right ${isAdditionalFeeOnly ? 'text-red-600 dark:text-red-400' : ''}`}>
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <span>{getDisplayPrice(log).toLocaleString()}</span>
                          {log.deferredPayment && (
                            <span className="text-xs px-1.5 py-0.5 status-badge bg-orange-500/10 text-orange-600 dark:text-orange-400 whitespace-nowrap">
                              후불
                            </span>
                          )}
                        </div>
                        {(log.refundAmount || 0) > 0 && (
                          <span className="text-xs px-1.5 py-0.5 status-badge bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 whitespace-nowrap" data-testid={`badge-refund-${log.id}`}>
                            환불 -{(log.refundAmount as number).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatPaymentMethod(log.paymentMethod, log.paymentCash, log.paymentCard, log.paymentTransfer)}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-1.5 py-0.5 status-badge status-badge-nodot ${
                        log.cancelled ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                      }`}>
                        {log.cancelled ? 'O' : '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        {log.customerMemo && log.customerMemo.trim() ? (
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
                        ) : (
                          !log.cancelled && log.exitTime && !((log.refundAmount || 0) > 0) ? null : <span>-</span>
                        )}
                        {/* 소급 환불 버튼 (퇴실 완료, 취소 아님, 환불 없음) */}
                        {!log.cancelled && log.exitTime && !((log.refundAmount || 0) > 0) && (
                          <button
                            className="p-1 rounded hover-elevate text-muted-foreground"
                            title="환불 처리"
                            data-testid={`button-retro-refund-${log.id}`}
                            onClick={() => {
                              setRetroRefundLogId(log.id);
                              setRetroRefundAmount("");
                              setRetroRefundNote("");
                              setRetroRefundMethod((log.paymentMethod as 'cash' | 'card' | 'transfer') || 'cash');
                              setRetroRefundDialogOpen(true);
                            }}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(log.refundAmount || 0) > 0 && log.refundNote && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="p-1 rounded hover-elevate text-red-500" title="환불 사유" data-testid={`button-refund-note-${log.id}`}>
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent side="left" align="center" sideOffset={8} className="w-max max-w-[60vw] p-3 text-sm z-[100]">
                              <p className="font-semibold text-red-600 mb-1">환불 사유</p>
                              <p className="whitespace-pre-wrap">{log.refundNote}</p>
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

        const isSimpleSaleTxn = (txn: RentalTransaction) => {
          const meta = revenueItemOptions.find((i) => i.id === txn.itemId)
            || revenueItemOptions.find((i) => i.name === txn.itemName);
          if (meta?.billingType === 'simple') return true;
          if (meta?.billingType === 'rental') return false;
          return (txn.depositAmount || 0) === 0;
        };
        
        // Locker number filter
        if (rentalLockerNumberFilter) {
          const lockerNum = parseInt(rentalLockerNumberFilter);
          if (!isNaN(lockerNum)) {
            filteredRentals = filteredRentals.filter(txn => txn.lockerNumber === lockerNum);
          }
        }

        const simpleSales = filteredRentals.filter((txn) => isSimpleSaleTxn(txn));
        let rentalOnly = filteredRentals.filter((txn) => !isSimpleSaleTxn(txn));

        // 보증금 필터는 대여 건에만 적용
        if (rentalDepositFilter === "received") {
          rentalOnly = rentalOnly.filter(txn => txn.depositStatus === 'received');
        } else if (rentalDepositFilter === "refunded") {
          rentalOnly = rentalOnly.filter(txn => txn.depositStatus === 'refunded');
        } else if (rentalDepositFilter === "forfeited") {
          rentalOnly = rentalOnly.filter(txn => txn.depositStatus === 'forfeited');
        } else if (rentalDepositFilter === "none") {
          rentalOnly = rentalOnly.filter(txn => txn.depositStatus === 'none');
        }
        
        // Calculate cash totals
        const cashSimple = simpleSales.filter(txn => txn.paymentMethod === 'cash');
        const cashSimpleTotal = cashSimple.reduce((sum, txn) => sum + (txn.rentalFee || 0), 0);
        const cashSimpleQty = cashSimple.reduce((sum, txn) => sum + Math.max(1, txn.quantity || 1), 0);

        const cashRentals = rentalOnly.filter(txn => txn.paymentMethod === 'cash');
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
                <h2 className="text-lg font-semibold">추가매출</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  단순판매 {simpleSales.length}건 · 대여 {rentalOnly.length}건
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right space-y-1">
                  <div>
                    <p className="text-xs text-muted-foreground">현금 판매</p>
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {cashSimpleTotal.toLocaleString()}원
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">({cashSimpleQty}개)</span>
                    </p>
                  </div>
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
            
            <CollapsibleContent className="border rounded-lg p-6 bg-card mt-2 space-y-8">
              {/* Rental Filters */}
            <div className="mb-0 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Button 
                  variant={showRentalFilters ? "default" : "outline"}
                  className="h-11 px-4 rounded-xl font-semibold"
                  onClick={() => setShowRentalFilters(!showRentalFilters)}
                  data-testid="button-toggle-rental-filters"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  필터
                </Button>
                
                <Button 
                  variant={showRentalBusinessDayFilter || activeRentalBusinessDays.length > 0 ? "default" : "outline"}
                  className="h-11 px-4 rounded-xl font-semibold"
                  onClick={() => setShowRentalBusinessDayFilter((open) => !open)}
                  data-testid="button-show-rental-business-day-filter"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  영업일 조회
                </Button>
              </div>

              {showRentalBusinessDayFilter && (
                <BusinessDayPicker
                  selectedYmds={activeRentalBusinessDays}
                  onApply={(ymds) => {
                    setActiveRentalBusinessDays(ymds);
                    setRentalStartDate("");
                    setRentalEndDate("");
                  }}
                  onClear={() => setActiveRentalBusinessDays([])}
                  onClose={() => setShowRentalBusinessDayFilter(false)}
                />
              )}
                
                {showRentalFilters && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">항목</p>
                      <div className="flex flex-wrap gap-2">
                        <FilterChip selected={rentalItemFilter === "all"} onClick={() => setRentalItemFilter("all")}>전체</FilterChip>
                        {revenueItemOptions.map((item) => (
                          <FilterChip
                            key={item.id}
                            selected={rentalItemFilter === item.name}
                            onClick={() => setRentalItemFilter(item.name)}
                          >
                            {item.name}
                          </FilterChip>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">결제</p>
                      <div className="flex flex-wrap gap-2">
                        <FilterChip selected={rentalPaymentFilter === "all"} onClick={() => setRentalPaymentFilter("all")}>전체</FilterChip>
                        <FilterChip selected={rentalPaymentFilter === "cash"} onClick={() => setRentalPaymentFilter("cash")}>현금</FilterChip>
                        <FilterChip selected={rentalPaymentFilter === "card"} onClick={() => setRentalPaymentFilter("card")}>카드</FilterChip>
                        <FilterChip selected={rentalPaymentFilter === "transfer"} onClick={() => setRentalPaymentFilter("transfer")}>이체</FilterChip>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">보증금</p>
                      <div className="flex flex-wrap gap-2">
                        <FilterChip selected={rentalDepositFilter === "all"} onClick={() => setRentalDepositFilter("all")}>전체</FilterChip>
                        <FilterChip selected={rentalDepositFilter === "received"} onClick={() => setRentalDepositFilter("received")}>받음</FilterChip>
                        <FilterChip selected={rentalDepositFilter === "refunded"} onClick={() => setRentalDepositFilter("refunded")}>환급</FilterChip>
                        <FilterChip selected={rentalDepositFilter === "forfeited"} onClick={() => setRentalDepositFilter("forfeited")}>몰수</FilterChip>
                        <FilterChip selected={rentalDepositFilter === "none"} onClick={() => setRentalDepositFilter("none")}>없음</FilterChip>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">락카번호</p>
                      <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
                        <FilterChip
                          selected={rentalLockerNumberFilter === ""}
                          onClick={() => setRentalLockerNumberFilter("")}
                        >
                          전체
                        </FilterChip>
                        {lockerNumbers.map((num) => (
                          <FilterChip
                            key={num}
                            selected={rentalLockerNumberFilter === String(num)}
                            onClick={() => setRentalLockerNumberFilter(rentalLockerNumberFilter === String(num) ? "" : String(num))}
                            className="min-w-[2.75rem] px-3"
                          >
                            {num}
                          </FilterChip>
                        ))}
                      </div>
                    </div>
                    
                    {hasRentalFilters && (
                      <Button 
                        variant="ghost" 
                        className="h-11 px-5 rounded-xl"
                        onClick={() => {
                          setRentalItemFilter("all");
                          setRentalPaymentFilter("all");
                          setRentalDepositFilter("all");
                          setRentalLockerNumberFilter("");
                          setRentalStartDate("");
                          setRentalEndDate("");
                          setRentalUseTimeFilter(false);
                          setActiveRentalBusinessDays([]);
                        }}
                        data-testid="button-clear-rental-filters"
                      >
                        필터 초기화
                      </Button>
                    )}
                  </div>
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

            {/* 단순판매 테이블 */}
            <div className="space-y-3">
              <div className="border-b pb-2">
                <h3 className="text-base font-semibold">단순판매</h3>
                <p className="text-xs text-muted-foreground">음료 등 판매 기록 · {simpleSales.length}건</p>
              </div>
              <ScrollArea className="h-[min(280px,40vh)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24 data-table-head whitespace-nowrap">항목</TableHead>
                      <TableHead className="w-24 data-table-head whitespace-nowrap">판매날짜</TableHead>
                      <TableHead className="w-20 data-table-head whitespace-nowrap">판매시간</TableHead>
                      <TableHead className="w-16 data-table-head whitespace-nowrap">락커</TableHead>
                      <TableHead className="w-20 data-table-head whitespace-nowrap">판매개수</TableHead>
                      <TableHead className="w-24 data-table-head whitespace-nowrap">판매금액</TableHead>
                      <TableHead className="w-20 data-table-head whitespace-nowrap">지급방식</TableHead>
                      <TableHead className="w-20 data-table-head whitespace-nowrap">합계</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {simpleSales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          단순판매 기록이 없습니다
                        </TableCell>
                      </TableRow>
                    ) : (
                      simpleSales.map((txn) => {
                        const qty = Math.max(1, txn.quantity || 1);
                        const lineTotal = txn.rentalFee || 0;
                        const unitPrice = Math.round(lineTotal / qty);
                        return (
                          <TableRow key={txn.id} data-testid={`row-simple-sale-${txn.id}`}>
                            <TableCell className="text-sm font-medium">{txn.itemName}</TableCell>
                            <TableCell className="text-sm">
                              {new Date(txn.rentalTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                            </TableCell>
                            <TableCell className="text-sm">
                              {new Date(txn.rentalTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </TableCell>
                            <TableCell className="font-semibold text-base">{txn.lockerNumber}</TableCell>
                            <TableCell className="text-sm tabular-nums">{qty}개</TableCell>
                            <TableCell className="text-sm tabular-nums">{unitPrice.toLocaleString()}원</TableCell>
                            <TableCell className="text-sm">
                              {formatPaymentMethod(txn.paymentMethod, txn.paymentCash, txn.paymentCard, txn.paymentTransfer)}
                            </TableCell>
                            <TableCell className="font-bold text-base text-emerald-600 dark:text-emerald-400 tabular-nums">
                              {(unitPrice * qty).toLocaleString()}원
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            {/* 대여 테이블 */}
            <div className="space-y-3">
              <div className="border-b pb-2">
                <h3 className="text-base font-semibold">대여</h3>
                <p className="text-xs text-muted-foreground">담요/롱타올 등 대여 기록 · {rentalOnly.length}건</p>
              </div>
              <ScrollArea className="h-[min(360px,50vh)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24 data-table-head whitespace-nowrap">항목</TableHead>
                      <TableHead className="w-24 data-table-head whitespace-nowrap">대여날짜</TableHead>
                      <TableHead className="w-20 data-table-head whitespace-nowrap">대여시간</TableHead>
                      <TableHead className="w-24 data-table-head whitespace-nowrap">반납날짜</TableHead>
                      <TableHead className="w-20 data-table-head whitespace-nowrap">반납시간</TableHead>
                      <TableHead className="w-16 data-table-head whitespace-nowrap">락커</TableHead>
                      <TableHead className="w-20 data-table-head whitespace-nowrap">대여금액</TableHead>
                      <TableHead className="w-20 data-table-head whitespace-nowrap">보증금액</TableHead>
                      <TableHead className="w-20 data-table-head whitespace-nowrap">지급방식</TableHead>
                      <TableHead className="w-24 data-table-head whitespace-nowrap">보증금처리</TableHead>
                      <TableHead className="w-20 data-table-head whitespace-nowrap">보증금매출</TableHead>
                      <TableHead className="w-20 data-table-head whitespace-nowrap">합계</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rentalOnly.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                          대여 거래가 없습니다
                        </TableCell>
                      </TableRow>
                    ) : (
                      rentalOnly.map((txn) => {
                        const depositRevenue = (txn.depositStatus === 'received' || txn.depositStatus === 'forfeited') 
                          ? txn.depositAmount 
                          : 0;
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
                              <span className={`px-2 py-0.5 status-badge text-xs ${
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
            </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })()}
      </div>

      {/* 소급 환불 다이얼로그 */}
      <AlertDialog open={retroRefundDialogOpen} onOpenChange={setRetroRefundDialogOpen}>
        <AlertDialogContent data-testid="dialog-retro-refund">
          <AlertDialogHeader>
            <AlertDialogTitle>환불 처리</AlertDialogTitle>
            <AlertDialogDescription>
              이미 퇴실한 기록에 환불을 소급 처리합니다. 처리 후 마감 페이지에서 매출 차감이 반영됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <Label className="w-20 shrink-0 text-sm">환불 금액</Label>
              <div className="relative flex-1">
                <Input
                  type="text"
                  min="0"
                  step="100"
                  placeholder="0"
                  value={retroRefundAmount}
                  onChange={(e) => setRetroRefundAmount(e.target.value)}
                  className="pr-7 text-right"
                  data-testid="input-retro-refund-amount"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">원</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="w-20 shrink-0 text-sm">환불 수단</Label>
              <div className="flex gap-1.5">
                {(['cash', 'card', 'transfer'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setRetroRefundMethod(m)}
                    className={`px-2.5 py-1 text-xs rounded-md border font-medium transition-colors ${retroRefundMethod === m ? 'bg-red-600 border-red-600 text-white' : 'border-border text-muted-foreground hover-elevate'}`}
                    data-testid={`button-retro-refund-method-${m}`}
                  >
                    {m === 'cash' ? '현금' : m === 'card' ? '카드' : '이체'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="w-20 shrink-0 text-sm">환불 사유</Label>
              <Input
                type="text"
                placeholder="환불 사유 (선택)"
                value={retroRefundNote}
                onChange={(e) => setRetroRefundNote(e.target.value)}
                className="flex-1"
                data-testid="input-retro-refund-note"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setRetroRefundLogId(null); setRetroRefundAmount(""); setRetroRefundNote(""); setRetroRefundMethod('cash'); }}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRetroRefund} data-testid="button-confirm-retro-refund">
              환불 처리
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LogsToolWorkspace
        panels={[
          ...(showBusinessDayFilter ? [{
            id: "businessDay",
            title: "영업일 조회",
            content: (
              <BusinessDayPicker
                embedded
                selectedYmds={activeBusinessDays}
                onApply={(ymds) => {
                  setActiveBusinessDays(ymds);
                  setStartDate("");
                  setEndDate("");
                }}
                onClear={() => setActiveBusinessDays([])}
                onClose={() => setShowBusinessDayFilter(false)}
              />
            ),
          }] : []),
          ...(showFilters ? [{
            id: "filter",
            title: "필터",
            content: (
              <div className="space-y-4 w-full">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">구분</p>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip selected={cancelledFilter === "all"} onClick={() => setCancelledFilter("all")}>전체</FilterChip>
                    <FilterChip selected={cancelledFilter === "active"} onClick={() => setCancelledFilter("active")} testId="chip-cancelled-active">정상</FilterChip>
                    <FilterChip selected={cancelledFilter === "cancelled"} onClick={() => setCancelledFilter("cancelled")} testId="chip-cancelled-cancelled">취소</FilterChip>
                    <FilterChip selected={cancelledFilter === "free"} onClick={() => setCancelledFilter("free")} testId="chip-cancelled-free">무료입장</FilterChip>
                    <FilterChip selected={cancelledFilter === "staff"} onClick={() => setCancelledFilter("staff")} testId="chip-cancelled-staff">직원</FilterChip>
                    <FilterChip selected={cancelledFilter === "refunded"} onClick={() => setCancelledFilter("refunded")} testId="chip-cancelled-refunded">환불</FilterChip>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">주야</p>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip selected={timeTypeFilter === "all"} onClick={() => setTimeTypeFilter("all")}>전체</FilterChip>
                    <FilterChip selected={timeTypeFilter === "day"} onClick={() => setTimeTypeFilter("day")} testId="chip-timetype-day">주간</FilterChip>
                    <FilterChip selected={timeTypeFilter === "night"} onClick={() => setTimeTypeFilter("night")} testId="chip-timetype-night">야간</FilterChip>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">결제</p>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip selected={paymentMethodFilter === "all"} onClick={() => setPaymentMethodFilter("all")}>전체</FilterChip>
                    <FilterChip selected={paymentMethodFilter === "card"} onClick={() => setPaymentMethodFilter("card")} testId="chip-payment-card">카드</FilterChip>
                    <FilterChip selected={paymentMethodFilter === "cash"} onClick={() => setPaymentMethodFilter("cash")} testId="chip-payment-cash">현금</FilterChip>
                    <FilterChip selected={paymentMethodFilter === "transfer"} onClick={() => setPaymentMethodFilter("transfer")} testId="chip-payment-transfer">이체</FilterChip>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">추가요금</p>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip selected={additionalFeeFilter === "all"} onClick={() => setAdditionalFeeFilter("all")}>전체</FilterChip>
                    <FilterChip selected={additionalFeeFilter === "with_fee"} onClick={() => setAdditionalFeeFilter("with_fee")} testId="chip-fee-with">있음</FilterChip>
                    <FilterChip selected={additionalFeeFilter === "without_fee"} onClick={() => setAdditionalFeeFilter("without_fee")} testId="chip-fee-without">없음</FilterChip>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">정렬</p>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip selected={sortBy === "entryTime"} onClick={() => setSortBy("entryTime")} testId="chip-sort-entry">입실시간순</FilterChip>
                    <FilterChip selected={sortBy === "exitTime"} onClick={() => setSortBy("exitTime")} testId="chip-sort-exit">퇴실시간순</FilterChip>
                  </div>
                </div>
                {hasChipFilters && (
                  <div className="text-xs text-muted-foreground">
                    결과 {displayedLogs.length}건 · {filteredTotalAmount.toLocaleString()}원
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-2 pt-4 border-t">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 px-4 rounded-xl"
                    onClick={() => setShowFilters(false)}
                    data-testid="button-close-filters"
                  >
                    닫기
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 px-4 rounded-xl"
                    onClick={clearAllFilters}
                    data-testid="button-clear-all-filters"
                  >
                    초기화
                  </Button>
                </div>
              </div>
            ),
          }] : []),
        ]}
        onClosePanel={(id) => {
          if (id === "businessDay") setShowBusinessDayFilter(false);
          if (id === "filter") setShowFilters(false);
        }}
        onCloseAll={() => {
          setShowBusinessDayFilter(false);
          setShowFilters(false);
        }}
      />

      <LockerNumberLookupDialog
        open={showLockerNumberDialog}
        onOpenChange={setShowLockerNumberDialog}
        lockerGroups={lockerGroups}
        lockerNumbers={lockerNumbers}
        selected={lockerNumberFilter}
        onApply={(nums) => {
          setLockerNumberFilter(nums);
          setShowLockerNumberDialog(false);
        }}
      />

    </div>
  );
}
