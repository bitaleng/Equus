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
import { ArrowLeft, Calendar, FileSpreadsheet, FileText, Filter, ChevronDown, ChevronUp } from "lucide-react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as localDb from "@/lib/localDb";
import { formatPaymentMethod } from "@/lib/utils";
import { getBusinessDay, getBusinessDayRange } from "@shared/businessDay";

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
}

interface AdditionalFeeEvent {
  id: string;
  lockerLogId: string;
  lockerNumber: number;
  checkoutTime: string;
  feeAmount: number;
  businessDay: string;
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
  
  // Rental transaction filters
  const [showRentalFilters, setShowRentalFilters] = useState(false);
  const [rentalItemFilter, setRentalItemFilter] = useState<string>("all");
  const [rentalPaymentFilter, setRentalPaymentFilter] = useState<string>("all");
  const [rentalDepositFilter, setRentalDepositFilter] = useState<string>("all");
  const [isRentalSectionOpen, setIsRentalSectionOpen] = useState(false);

  // Load data on mount and when filters change
  useEffect(() => {
    loadLogs();
  }, [startDate, endDate, useTimeFilter]);
  
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
      
      if (useTimeFilter && startDate && endDate) {
        // Time-based filtering: Convert datetime-local to ISO strings for UTC comparison
        const startISO = new Date(startDate).toISOString();
        const endISO = new Date(endDate).toISOString();
        result = localDb.getEntriesByDateTimeRange(startISO, endISO);
        feeEvents = localDb.getAdditionalFeeEventsByDateTimeRange(startISO, endISO);
        rentalTxns = localDb.getRentalTransactionsByDateTimeRange(startISO, endISO);
      } else if (useTimeFilter && startDate) {
        // Single datetime point - convert to ISO and set end of day
        const start = new Date(startDate);
        const startISO = start.toISOString();
        const endOfDay = new Date(start);
        endOfDay.setHours(23, 59, 59, 999);
        const endISO = endOfDay.toISOString();
        result = localDb.getEntriesByDateTimeRange(startISO, endISO);
        feeEvents = localDb.getAdditionalFeeEventsByDateTimeRange(startISO, endISO);
        rentalTxns = localDb.getRentalTransactionsByDateTimeRange(startISO, endISO);
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
      const logsWithFees = result.map(log => {
        const additionalFeeEvents = localDb.getAdditionalFeeEventsByLockerLog(log.id);
        const totalAdditionalFees = additionalFeeEvents.reduce((sum, event) => sum + event.feeAmount, 0);
        return {
          ...log,
          additionalFees: totalAdditionalFees
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

  // Calculate total amount for filtered results (입실요금만, 추가요금은 별도 행에 이미 포함)
  // 중복 방지: additionalFeeOnly 항목은 이미 finalPrice에 추가요금이 포함되어 있으므로 
  // additionalFeeEvents에서 다시 합산하지 않음
  const filteredTotalAmount = displayedLogs.reduce((sum, log) => sum + (log.finalPrice || 0), 0);
  
  // Calculate overall totals (excluding cancelled entries)
  const activeLogs = logs.filter(log => !log.cancelled);
  const overallTotalCount = activeLogs.length;
  const overallTotalAmount = activeLogs.reduce((sum, log) => sum + (log.finalPrice || 0), 0);

  const getOptionText = (log: LogEntry) => {
    if (log.optionType === 'none') return '없음';
    if (log.optionType === 'foreigner') return '외국인';
    if (log.optionType === 'discount') return '할인';
    if (log.optionType === 'custom') return '할인직접입력';
    if (log.optionType === 'direct_price') return '요금직접입력';
    return '-';
  };

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
      '추가요금': log.additionalFees || '-',
      '최종요금': log.finalPrice,
      '지불방식': formatPaymentMethod(log.paymentMethod, log.paymentCash, log.paymentCard, log.paymentTransfer),
      '취소': log.cancelled ? 'O' : '-',
      '비고': log.notes || '-'
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
      log.additionalFees ? log.additionalFees.toLocaleString() : '-',
      log.finalPrice.toLocaleString(),
      formatPaymentMethod(log.paymentMethod, log.paymentCash, log.paymentCard, log.paymentTransfer),
      log.cancelled ? 'O' : '-',
      log.notes || '-',
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
                {startDate && endDate
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

            {!showDateFilter ? (
              <Button 
                variant="outline" 
                onClick={() => setShowDateFilter(true)}
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
                    onChange={(e) => setStartDate(e.target.value)}
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
                    onChange={(e) => setEndDate(e.target.value)}
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
                      <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                        log.timeType === '추가요금' 
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                          : log.timeType === '주간' 
                          ? 'bg-primary/10 text-primary' 
                          : 'bg-accent text-accent-foreground'
                      }`}>
                        {log.timeType}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{log.basePrice.toLocaleString()}원</TableCell>
                    <TableCell className="text-sm">{getOptionText(log)}</TableCell>
                    <TableCell className="text-sm">
                      {log.optionAmount ? `${log.optionAmount.toLocaleString()}원` : '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.additionalFees && log.additionalFees > 0 ? (
                        <span className="text-destructive font-medium">
                          {log.additionalFees.toLocaleString()}원
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className={`font-semibold text-base ${isAdditionalFeeOnly ? 'text-red-600 dark:text-red-400' : ''}`}>
                      {log.finalPrice.toLocaleString()}원
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
                      {log.notes || '-'}
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
        
        const hasRentalFilters = rentalItemFilter !== "all" || rentalPaymentFilter !== "all" || rentalDepositFilter !== "all";
        
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
            <div className="mb-4 flex items-center gap-3">
              <Button 
                variant={showRentalFilters ? "default" : "outline"}
                size="sm"
                onClick={() => setShowRentalFilters(!showRentalFilters)}
                data-testid="button-toggle-rental-filters"
              >
                <Filter className="h-3 w-3 mr-2" />
                필터
              </Button>
              
              {showRentalFilters && (
                <>
                  <Select value={rentalItemFilter} onValueChange={setRentalItemFilter}>
                    <SelectTrigger className="w-36 h-8" data-testid="select-rental-item-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 항목</SelectItem>
                      <SelectItem value="담요대여">담요대여</SelectItem>
                      <SelectItem value="롱타올대여">롱타올대여</SelectItem>
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
                  
                  {hasRentalFilters && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setRentalItemFilter("all");
                        setRentalPaymentFilter("all");
                        setRentalDepositFilter("all");
                      }}
                      data-testid="button-clear-rental-filters"
                    >
                      필터 초기화
                    </Button>
                  )}
                </>
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
