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
import { ArrowLeft, Calendar, FileSpreadsheet, FileText, Filter } from "lucide-react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as localDb from "@/lib/localDb";

interface LogEntry {
  id: string;
  lockerNumber: number;
  entryTime: string;
  exitTime?: string | null;
  timeType: '주간' | '야간';
  basePrice: number;
  optionType: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price';
  optionAmount?: number;
  finalPrice: number;
  paymentMethod?: 'card' | 'cash' | 'transfer';
  cancelled: boolean;
  notes?: string;
}

export default function LogsPage() {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [cancelledFilter, setCancelledFilter] = useState<string>("all");
  const [timeTypeFilter, setTimeTypeFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");

  useEffect(() => {
    loadLogs();
  }, [startDate, endDate]);

  const loadLogs = () => {
    setIsLoading(true);
    try {
      let result: LogEntry[];
      
      if (startDate && endDate) {
        result = localDb.getEntriesByDateRange(startDate, endDate);
      } else if (startDate) {
        result = localDb.getEntriesByDateRange(startDate, startDate);
      } else {
        // Get all entries by using a wide date range
        const today = new Date().toISOString().split('T')[0];
        const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        result = localDb.getEntriesByDateRange(oneYearAgo, today);
      }
      
      setLogs(result);
    } catch (error) {
      console.error('Error loading logs:', error);
      setLogs([]);
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
  };

  const hasActiveFilters = cancelledFilter !== "all" || timeTypeFilter !== "all" || paymentMethodFilter !== "all";

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
      '날짜': new Date(log.entryTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      '락커번호': log.lockerNumber,
      '입실시간': new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
      '퇴실시간': log.exitTime 
        ? new Date(log.exitTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '-',
      '주/야간': log.timeType,
      '기본요금': log.basePrice,
      '옵션': getOptionText(log),
      '옵션금액': log.optionAmount || '-',
      '최종요금': log.finalPrice,
      '지불방식': log.paymentMethod === 'card' ? '카드' : log.paymentMethod === 'cash' ? '현금' : log.paymentMethod === 'transfer' ? '이체' : '-',
      '입실취소': log.cancelled ? 'O' : '-',
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
      new Date(log.entryTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      log.lockerNumber.toString(),
      new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
      log.exitTime 
        ? new Date(log.exitTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '-',
      log.timeType,
      log.basePrice.toLocaleString(),
      getOptionText(log),
      log.optionAmount ? log.optionAmount.toLocaleString() : '-',
      log.finalPrice.toLocaleString(),
      log.paymentMethod === 'card' ? '카드' : log.paymentMethod === 'cash' ? '현금' : log.paymentMethod === 'transfer' ? '이체' : '-',
      log.cancelled ? 'O' : '-',
    ]);

    autoTable(doc, {
      head: [['날짜', '락커', '입실', '퇴실', '주/야간', '기본요금', '옵션', '옵션금액', '최종요금', '지불', '취소']],
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
                <div className="flex items-center gap-2">
                  <Label htmlFor="start-date" className="text-sm whitespace-nowrap">
                    시작일
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-40"
                    data-testid="input-start-date"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="end-date" className="text-sm whitespace-nowrap">
                    종료일
                  </Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-40"
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
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {cancelledFilter !== "all" && (
                  <span data-testid="text-cancelled-filter-count">
                    {cancelledFilter === "cancelled" ? "취소건" : "정상건"}: 총 {displayedLogs.length}건
                  </span>
                )}
                {timeTypeFilter !== "all" && (
                  <span data-testid="text-timetype-filter-count">
                    {timeTypeFilter === "day" ? "주간" : "야간"}: 총 {displayedLogs.length}건
                  </span>
                )}
                {paymentMethodFilter !== "all" && (
                  <span data-testid="text-payment-filter-count">
                    {paymentMethodFilter === "card" ? "카드" : paymentMethodFilter === "transfer" ? "이체" : "현금"}: 총 {displayedLogs.length}건
                  </span>
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
                <TableHead className="w-24 text-xs font-bold whitespace-nowrap">날짜</TableHead>
                <TableHead className="w-16 text-xs font-bold whitespace-nowrap">락커</TableHead>
                <TableHead className="w-20 text-xs font-bold whitespace-nowrap">입실</TableHead>
                <TableHead className="w-20 text-xs font-bold whitespace-nowrap">퇴실</TableHead>
                <TableHead className="w-16 text-xs font-bold whitespace-nowrap">주야</TableHead>
                <TableHead className="w-20 text-xs font-bold whitespace-nowrap">기본</TableHead>
                <TableHead className="w-24 text-xs font-bold whitespace-nowrap">옵션</TableHead>
                <TableHead className="w-20 text-xs font-bold whitespace-nowrap">옵션금액</TableHead>
                <TableHead className="w-24 text-xs font-bold whitespace-nowrap">최종</TableHead>
                <TableHead className="w-20 text-xs font-bold whitespace-nowrap">지불</TableHead>
                <TableHead className="w-16 text-xs font-bold whitespace-nowrap">취소</TableHead>
                <TableHead className="min-w-28 text-xs font-bold whitespace-nowrap">비고</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-12 text-xs">
                    로딩중...
                  </TableCell>
                </TableRow>
              ) : displayedLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-12 text-xs">
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
                displayedLogs.map((log) => (
                  <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                    <TableCell className="text-xs">
                      {new Date(log.entryTime).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                    </TableCell>
                    <TableCell className="font-semibold text-sm">{log.lockerNumber}</TableCell>
                    <TableCell className="text-xs">
                      {new Date(log.entryTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.exitTime 
                        ? new Date(log.exitTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${
                        log.timeType === '주간' ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground'
                      }`}>
                        {log.timeType}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{log.basePrice.toLocaleString()}원</TableCell>
                    <TableCell className="text-xs">{getOptionText(log)}</TableCell>
                    <TableCell className="text-xs">
                      {log.optionAmount ? `${log.optionAmount.toLocaleString()}원` : '-'}
                    </TableCell>
                    <TableCell className="font-semibold text-sm">
                      {log.finalPrice.toLocaleString()}원
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.paymentMethod === 'card' ? '카드' : log.paymentMethod === 'cash' ? '현금' : log.paymentMethod === 'transfer' ? '이체' : '-'}
                    </TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        log.cancelled ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                      }`}>
                        {log.cancelled ? 'O' : '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.notes || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  );
}
