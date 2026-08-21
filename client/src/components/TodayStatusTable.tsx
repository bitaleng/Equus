import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LockerNumberLookupDialog } from "@/components/LockerNumberLookupDialog";
import * as localDb from "@/lib/localDb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { X, Filter, FileText, Menu, Maximize2, Undo2, MessageSquare, Hash, RotateCcw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatPaymentMethod } from "@/lib/utils";
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

interface LockerEntry {
  lockerNumber: number;
  entryTime: string | null;
  entryTimeRaw?: string | null; // 입실시간 원본 ISO 문자열 (정렬용)
  exitTime?: string | null; // 퇴실시간 (정렬용)
  timeType: '주간' | '야간' | '추가요금';
  basePrice: number;
  option: string;
  optionType?: 'none' | 'discount' | 'custom' | 'foreigner' | 'direct_price' | 'free'; // 옵션 타입 (필터용)
  finalPrice: number;
  status: 'in_use' | 'checked_out' | 'cancelled';
  cancelled: boolean;
  notes?: string;
  paymentMethod?: 'card' | 'cash' | 'transfer';
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
  additionalFeeOnly?: boolean; // 추가요금만 있는 항목 (방문자 수에서 제외)
  hasSameDayFee?: boolean; // 같은 영업일 내 추가요금 발생 여부
  parentLocker?: number | null; // 부모 락카 번호 (자식 락카인 경우, 방문자 수에서 제외)
  deferredPayment?: boolean; // 후불결제 여부
  id?: string; // 퇴실 취소용 로그 ID
  refundAmount?: number; // 환불 금액
  isStaff?: boolean; // 직원 입실 여부 (방문자 수에서 제외)
  customerMemo?: string; // 손님 메모
}

function getEntryMemoText(entry: LockerEntry): string {
  return entry.customerMemo?.trim() || "";
}

interface TodayStatusTableProps {
  entries: LockerEntry[];
  yesterdayEntries?: LockerEntry[];
  yesterdayBusinessDay?: string;
  isExpanded?: boolean;
  onRowClick?: (entry: LockerEntry) => void;
  isLockerPanelCollapsed?: boolean;
  onToggleLockerPanel?: () => void;
  onReverseCheckout?: (entry: LockerEntry) => void; // 퇴실 취소 콜백
  hideToggleButton?: boolean; // 탭 모드에서 토글 버튼 숨김
}

export default function TodayStatusTable({
  entries,
  yesterdayEntries,
  yesterdayBusinessDay,
  isExpanded = false,
  onRowClick,
  isLockerPanelCollapsed = false,
  onToggleLockerPanel,
  onReverseCheckout,
  hideToggleButton = false,
}: TodayStatusTableProps) {
  const [dayView, setDayView] = useState<'today' | 'yesterday'>('today');
  const showYesterdayTab = yesterdayEntries !== undefined;
  const activeEntries = dayView === 'yesterday' && yesterdayEntries ? yesterdayEntries : entries;
  const [showLockerNumberDialog, setShowLockerNumberDialog] = useState(false);
  const [lockerNumberFilter, setLockerNumberFilter] = useState<number[]>([]);
  const [reverseCheckoutDialogOpen, setReverseCheckoutDialogOpen] = useState(false);
  const [selectedEntryForReverse, setSelectedEntryForReverse] = useState<LockerEntry | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [cancelledFilter, setCancelledFilter] = useState<string>("all");
  const [timeTypeFilter, setTimeTypeFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<'exitTime' | 'entryTime'>("entryTime");
  
  // Memo state
  const [memoDialogOpen, setMemoDialogOpen] = useState(false);
  const [memo, setMemo] = useState(() => {
    return localStorage.getItem('daily_memo') || '';
  });

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

  const lockerFilterLabel = lockerNumberFilter.length === 0
    ? "락카번호 조회"
    : lockerNumberFilter.length === 1
      ? `${lockerNumberFilter[0]}번`
      : lockerNumberFilter.length <= 3
        ? `${lockerNumberFilter.slice().sort((a, b) => a - b).join(", ")}번`
        : `${[...lockerNumberFilter].sort((a, b) => a - b).slice(0, 2).join(", ")}번 외 ${lockerNumberFilter.length - 2}개`;

  const clearFilter = () => {
    setLockerNumberFilter([]);
    setCancelledFilter("all");
    setTimeTypeFilter("all");
    setPaymentMethodFilter("all");
  };

  const hasActiveFilters = cancelledFilter !== "all" || timeTypeFilter !== "all" || paymentMethodFilter !== "all";
  
  // Save memo to localStorage
  const handleSaveMemo = () => {
    localStorage.setItem('daily_memo', memo);
    setMemoDialogOpen(false);
  };

  const lockerFilterSet = new Set(lockerNumberFilter);
  let displayedEntries = lockerNumberFilter.length > 0
    ? activeEntries.filter(e => lockerFilterSet.has(e.lockerNumber))
    : activeEntries;

  // Apply additional filters
  if (cancelledFilter === "cancelled") {
    displayedEntries = displayedEntries.filter(e => e.cancelled);
  } else if (cancelledFilter === "active") {
    displayedEntries = displayedEntries.filter(e => !e.cancelled);
  } else if (cancelledFilter === "free") {
    displayedEntries = displayedEntries.filter(e => e.optionType === 'free');
  }

  if (timeTypeFilter === "day") {
    displayedEntries = displayedEntries.filter(e => e.timeType === '주간');
  } else if (timeTypeFilter === "night") {
    displayedEntries = displayedEntries.filter(e => e.timeType === '야간');
  }

  if (paymentMethodFilter === "card") {
    displayedEntries = displayedEntries.filter(e => e.paymentMethod === 'card');
  } else if (paymentMethodFilter === "cash") {
    displayedEntries = displayedEntries.filter(e => e.paymentMethod === 'cash' || !e.paymentMethod);
  } else if (paymentMethodFilter === "transfer") {
    displayedEntries = displayedEntries.filter(e => e.paymentMethod === 'transfer');
  }

  // Sort entries based on sortBy option
  displayedEntries = [...displayedEntries].sort((a, b) => {
    if (sortBy === 'entryTime') {
      // 입실시간 기준 정렬 (원본 ISO 문자열 사용)
      const timeA = a.entryTimeRaw || a.exitTime || '';
      const timeB = b.entryTimeRaw || b.exitTime || '';
      return new Date(timeB).getTime() - new Date(timeA).getTime(); // 최신순
    } else {
      // 퇴실시간 기준: 퇴실시간 우선, 없으면 입실시간
      const timeA = a.exitTime || a.entryTimeRaw || '';
      const timeB = b.exitTime || b.entryTimeRaw || '';
      return new Date(timeB).getTime() - new Date(timeA).getTime(); // 최신순
    }
  });

  // 퇴실시간순 정렬 시 퇴실 완료된 항목만 표시
  if (sortBy === 'exitTime') {
    displayedEntries = displayedEntries.filter(e => e.status === 'checked_out');
  }

  // Count usage for filtered locker (exclude additional fee only entries and child lockers)
  const usageCount = lockerNumberFilter.length > 0
    ? activeEntries.filter(e => lockerFilterSet.has(e.lockerNumber) && !e.cancelled && !e.additionalFeeOnly && !e.parentLocker).length
    : 0;
  
  // Calculate total visitors (exclude additional fee only entries, cancelled entries, child lockers, and staff)
  const totalVisitors = activeEntries.filter(e => !e.additionalFeeOnly && !e.cancelled && !e.parentLocker && !e.isStaff).length;

  const formatBusinessDayLabel = (ymd?: string) => {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    return `${m}/${d}`;
  };

  return (
    <div className={`h-full flex flex-col today-status-container ${isExpanded ? 'expanded-mode' : ''}`}>
      {/* 헤더: 제목 + 방문수 (좌측) | 메모버튼 + 토글버튼 (우측) */}
      <div className="px-4 py-3.5 border-b border-border/70 flex items-center justify-between gap-3 bg-muted/40">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          {showYesterdayTab ? (
            <div
              className="flex items-center rounded-xl border border-border/70 bg-background/80 p-0.5 shadow-2xs"
              role="tablist"
              aria-label="입실 현황 기간"
            >
              <button
                type="button"
                role="tab"
                aria-selected={dayView === 'today'}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap",
                  dayView === 'today'
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setDayView('today')}
                data-testid="tab-today-status"
              >
                오늘 현황
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dayView === 'yesterday'}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap",
                  dayView === 'yesterday'
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setDayView('yesterday')}
                data-testid="tab-yesterday-status"
              >
                어제 현황
                {yesterdayBusinessDay && (
                  <span className="ml-1.5 text-xs font-medium opacity-80">
                    ({formatBusinessDayLabel(yesterdayBusinessDay)})
                  </span>
                )}
              </button>
            </div>
          ) : (
            <h2 className="text-lg font-semibold tracking-tight">오늘 현황</h2>
          )}
          <div className="entry-stat-chip">
            <span className="text-muted-foreground dark:text-black">총 방문</span>
            <span className="stat-value">{totalVisitors}</span>
            <span className="text-muted-foreground dark:text-black">명</span>
          </div>
          {lockerNumberFilter.length === 1 && (
            <span className="text-sm font-semibold text-primary">
              락커 {lockerNumberFilter[0]}번 사용: {usageCount}회
            </span>
          )}
          {lockerNumberFilter.length > 1 && (
            <span className="text-sm font-semibold text-primary">
              선택 락커 {lockerNumberFilter.length}개 사용: {usageCount}회
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dayView === 'today' && (
            <Button
              size="sm"
              variant={memo ? "default" : "outline"}
              onClick={() => setMemoDialogOpen(true)}
              data-testid="button-daily-memo"
              className={memo ? "" : "bg-card/80 shadow-2xs"}
            >
              <FileText className="h-4 w-4 mr-1" />
              메모
            </Button>
          )}
          {onToggleLockerPanel && !hideToggleButton && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onToggleLockerPanel}
              data-testid="button-toggle-locker-panel"
              title={isLockerPanelCollapsed ? "입실관리 표시" : "입실관리 숨기기"}
              className="rounded-xl"
            >
              {isLockerPanelCollapsed ? <Menu className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </Button>
          )}
        </div>
      </div>
      
      <div className="p-6 pt-4 today-status-wrapper flex flex-col gap-3 mb-4">
        
        {/* 세 번째 줄: 입력란과 버튼들 */}
        <div className="flex items-center gap-2 flex-wrap">
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
              {lockerFilterLabel}
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
          <Button 
            variant={showFilters || hasActiveFilters ? "default" : "outline"}
            size="sm" 
            onClick={() => setShowFilters(!showFilters)}
            data-testid="button-toggle-filters"
          >
            <Filter className="h-4 w-4 mr-1" />
            필터
          </Button>
          {(lockerNumberFilter.length > 0 || hasActiveFilters) && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={clearFilter}
              data-testid="button-clear-all-filters"
            >
              <X className="h-4 w-4 mr-1" />
              전체초기화
            </Button>
          )}
        </div>
        
        {/* 필터 옵션 */}
        {showFilters && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={cancelledFilter} onValueChange={setCancelledFilter}>
                <SelectTrigger className="w-32 h-9" data-testid="select-cancelled-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="active">정상건</SelectItem>
                  <SelectItem value="cancelled">취소건</SelectItem>
                  <SelectItem value="free">무료입장</SelectItem>
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
              
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'exitTime' | 'entryTime')}>
                <SelectTrigger className="w-32 h-9" data-testid="select-sort-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exitTime">퇴실시간순</SelectItem>
                  <SelectItem value="entryTime">입실시간순</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* 필터 결과 통계 */}
            {hasActiveFilters && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {cancelledFilter !== "all" && (
                  <span data-testid="text-cancelled-filter-count">
                    {cancelledFilter === "cancelled" ? "취소건" : cancelledFilter === "free" ? "무료입장" : "정상건"}: 총 {displayedEntries.length}건
                  </span>
                )}
                {timeTypeFilter !== "all" && (
                  <span data-testid="text-timetype-filter-count">
                    {timeTypeFilter === "day" ? "주간" : "야간"}: 총 {displayedEntries.length}건
                  </span>
                )}
                {paymentMethodFilter !== "all" && (
                  <span data-testid="text-payment-filter-count">
                    {paymentMethodFilter === "card" ? "카드" : paymentMethodFilter === "transfer" ? "이체" : "현금"}: 총 {displayedEntries.length}건
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto pr-2" style={{ scrollbarGutter: 'stable' }}>
        <Table>
          <TableHeader className="sticky top-0 bg-muted/50">
            <TableRow>
              <TableHead 
                className="font-bold" 
                style={isExpanded ? { 
                  fontSize: 'var(--fluid-header, 1rem)', 
                  minWidth: 'var(--fluid-col-number, 4rem)' 
                } : undefined}
              >
                번호
              </TableHead>
              <TableHead 
                className="font-bold" 
                style={isExpanded ? { 
                  fontSize: 'var(--fluid-header, 1rem)', 
                  minWidth: 'var(--fluid-col-time, 5rem)' 
                } : undefined}
              >
                입실시간
              </TableHead>
              <TableHead 
                className="font-bold whitespace-nowrap"
                style={isExpanded ? { 
                  fontSize: 'var(--fluid-header, 1rem)', 
                  minWidth: 'var(--fluid-col-time, 5rem)' 
                } : undefined}
              >
                퇴실시간
              </TableHead>
              <TableHead 
                className="font-bold" 
                style={isExpanded ? { 
                  fontSize: 'var(--fluid-header, 1rem)', 
                  minWidth: 'var(--fluid-col-type, 4rem)' 
                } : undefined}
              >
                구분
              </TableHead>
              <TableHead 
                className="font-bold" 
                style={isExpanded ? { 
                  fontSize: 'var(--fluid-header, 1rem)', 
                  minWidth: 'var(--fluid-col-option, 5rem)' 
                } : undefined}
              >
                옵션
              </TableHead>
              <TableHead 
                className="font-bold" 
                style={isExpanded ? { 
                  fontSize: 'var(--fluid-header, 1rem)', 
                  minWidth: 'var(--fluid-col-payment, 4rem)' 
                } : undefined}
              >
                지불
              </TableHead>
              <TableHead 
                className="font-bold text-right" 
                style={isExpanded ? { 
                  fontSize: 'var(--fluid-header, 1rem)', 
                  minWidth: 'var(--fluid-col-price, 5rem)' 
                } : undefined}
              >
                최종요금
              </TableHead>
              <TableHead 
                className="font-bold" 
                style={isExpanded ? { 
                  fontSize: 'var(--fluid-header, 1rem)', 
                  minWidth: 'var(--fluid-col-status, 5rem)' 
                } : undefined}
              >
                상태
              </TableHead>
              <TableHead
                className="font-bold whitespace-nowrap"
                style={isExpanded ? { 
                  fontSize: 'var(--fluid-header, 1rem)', 
                  minWidth: '6rem'
                } : undefined}
              >
                메모
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8 text-sm">
                  {lockerNumberFilter.length === 1
                    ? `락커 ${lockerNumberFilter[0]}번 사용 기록이 없습니다`
                    : lockerNumberFilter.length > 1
                    ? "선택한 락커 사용 기록이 없습니다"
                    : dayView === 'yesterday'
                    ? '어제 영업일 입실 기록이 없습니다'
                    : '오늘 방문한 손님이 없습니다'
                  }
                </TableCell>
              </TableRow>
            ) : (
              displayedEntries.map((entry, index) => {
                // 상태 텍스트: 취소 > 후불결제 미수 > 입실중 > 퇴실
                let statusText = entry.cancelled ? '취소' : entry.status === 'in_use' ? '입실중' : '퇴실';
                if (entry.deferredPayment && !entry.cancelled) {
                  statusText = '미수';
                }
                const statusColor = entry.cancelled 
                  ? 'bg-destructive/10 text-destructive' 
                  : entry.deferredPayment
                  ? 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300'
                  : entry.status === 'in_use' 
                  ? 'bg-primary/10 text-primary' 
                  : 'bg-muted text-muted-foreground';
                
                const isAdditionalFeeOnly = entry.timeType === '추가요금';
                
                return (
                  <TableRow
                    key={index}
                    className="hover-elevate cursor-pointer"
                    onClick={() => onRowClick?.(entry)}
                    data-testid={`row-entry-${entry.lockerNumber}`}
                  >
                    <TableCell 
                      className="font-semibold"
                      style={isExpanded ? { 
                        fontSize: 'var(--fluid-large, 1.125rem)', 
                        padding: 'var(--fluid-padding, 0.75rem)' 
                      } : undefined}
                    >
                      {entry.lockerNumber}
                    </TableCell>
                    <TableCell 
                      style={isExpanded ? { 
                        fontSize: 'var(--fluid-base, 1rem)', 
                        padding: 'var(--fluid-padding, 0.75rem)' 
                      } : undefined}
                    >
                      {entry.entryTime || '-'}
                    </TableCell>
                    <TableCell 
                      className="text-muted-foreground whitespace-nowrap"
                      style={isExpanded ? { 
                        fontSize: 'var(--fluid-base, 1rem)', 
                        padding: 'var(--fluid-padding, 0.75rem)' 
                      } : undefined}
                    >
                      {entry.exitTime ? new Date(entry.exitTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}
                    </TableCell>
                    <TableCell 
                      style={isExpanded ? { 
                        padding: 'var(--fluid-padding, 0.75rem)' 
                      } : undefined}
                    >
                      <div className="flex items-center" style={isExpanded ? { gap: 'var(--fluid-gap, 0.5rem)' } : { gap: '0.375rem' }}>
                        <span 
                          className={`rounded whitespace-nowrap ${
                            entry.timeType === '주간' ? 'bg-primary/10 text-primary' : 
                            entry.timeType === '추가요금' ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' :
                            'bg-accent text-accent-foreground'
                          }`}
                          style={isExpanded ? { 
                            fontSize: 'var(--fluid-badge, 0.875rem)', 
                            padding: 'calc(var(--fluid-padding, 0.75rem) * 0.5) calc(var(--fluid-padding, 0.75rem) * 0.75)' 
                          } : { fontSize: '0.75rem', padding: '0.125rem 0.375rem' }}
                        >
                          {entry.timeType}
                        </span>
                        {entry.hasSameDayFee && entry.timeType !== '추가요금' && (
                          <span 
                            className="rounded whitespace-nowrap bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300"
                            style={isExpanded ? { 
                              fontSize: 'var(--fluid-badge, 0.875rem)', 
                              padding: 'calc(var(--fluid-padding, 0.75rem) * 0.5) calc(var(--fluid-padding, 0.75rem) * 0.75)' 
                            } : { fontSize: '0.75rem', padding: '0.125rem 0.375rem' }}
                          >
                            추가
                          </span>
                        )}
                        {entry.deferredPayment && (
                          <span 
                            className="rounded whitespace-nowrap bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300"
                            style={isExpanded ? { 
                              fontSize: 'var(--fluid-badge, 0.875rem)', 
                              padding: 'calc(var(--fluid-padding, 0.75rem) * 0.5) calc(var(--fluid-padding, 0.75rem) * 0.75)' 
                            } : { fontSize: '0.75rem', padding: '0.125rem 0.375rem' }}
                          >
                            후불
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell 
                      style={isExpanded ? { 
                        fontSize: 'var(--fluid-base, 1rem)', 
                        padding: 'var(--fluid-padding, 0.75rem)' 
                      } : undefined}
                    >
                      {entry.option}
                    </TableCell>
                    <TableCell 
                      style={isExpanded ? { 
                        fontSize: 'var(--fluid-base, 1rem)', 
                        padding: 'var(--fluid-padding, 0.75rem)' 
                      } : undefined}
                    >
                      {formatPaymentMethod(entry.paymentMethod, entry.paymentCash, entry.paymentCard, entry.paymentTransfer)}
                    </TableCell>
                    <TableCell 
                      className={`font-semibold text-right ${isAdditionalFeeOnly ? 'text-red-600 dark:text-red-400' : ''}`}
                      style={isExpanded ? { 
                        fontSize: 'var(--fluid-large, 1.125rem)', 
                        padding: 'var(--fluid-padding, 0.75rem)' 
                      } : undefined}
                    >
                      {/* 후불결제인 경우 0으로 표시, 결제완료 후 실제 금액 표시 */}
                      {entry.deferredPayment ? '0' : (
                        <span className="inline-flex items-center gap-1">
                          <span>{(entry.finalPrice - (entry.refundAmount || 0)).toLocaleString()}</span>
                          {(entry.refundAmount || 0) > 0 && (
                            <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 px-1 py-0.5 rounded font-medium leading-none">
                              환불
                            </span>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell 
                      style={isExpanded ? { 
                        padding: 'var(--fluid-padding, 0.75rem)' 
                      } : undefined}
                    >
                      <div className="flex items-center gap-1">
                        <span 
                          className={`rounded whitespace-nowrap ${statusColor}`}
                          style={isExpanded ? { 
                            fontSize: 'var(--fluid-badge, 0.875rem)', 
                            padding: 'calc(var(--fluid-padding, 0.75rem) * 0.5) calc(var(--fluid-padding, 0.75rem) * 0.75)' 
                          } : { fontSize: '0.75rem', padding: '0.125rem 0.375rem' }}
                        >
                          {statusText}
                        </span>
                        {/* 퇴실 취소 버튼 - 퇴실 상태일 때만 표시 */}
                        {entry.status === 'checked_out' && !entry.cancelled && onReverseCheckout && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEntryForReverse(entry);
                              setReverseCheckoutDialogOpen(true);
                            }}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="퇴실 취소"
                            data-testid={`button-reverse-checkout-${entry.lockerNumber}`}
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className="text-xs text-muted-foreground"
                      style={isExpanded ? { 
                        fontSize: 'var(--fluid-base, 1rem)', 
                        padding: 'var(--fluid-padding, 0.75rem)'
                      } : undefined}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(() => {
                        const memoText = getEntryMemoText(entry);
                        if (!memoText) {
                          return <span>-</span>;
                        }
                        return (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="flex items-center gap-1 max-w-[7rem] text-left hover:text-foreground transition-colors"
                                style={isExpanded ? { maxWidth: '11rem' } : undefined}
                                title="클릭하여 전체 보기"
                                data-testid={`memo-preview-${entry.lockerNumber}`}
                              >
                                <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-yellow-600" />
                                <span className="truncate">{memoText}</span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              side="left"
                              align="center"
                              sideOffset={8}
                              className="w-max max-w-[80vw] p-3 text-sm bg-yellow-100 dark:bg-yellow-200 border-yellow-300 dark:border-yellow-400 shadow-lg z-[100]"
                              data-testid={`popover-memo-status-${entry.id ?? entry.lockerNumber}`}
                            >
                              <div className="flex items-start gap-2">
                                <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0 text-yellow-700" />
                                <p className="whitespace-pre-wrap text-gray-900 max-h-[50vh] overflow-y-auto">{memoText}</p>
                              </div>
                            </PopoverContent>
                          </Popover>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* 퇴실 취소 확인 Dialog */}
      <AlertDialog open={reverseCheckoutDialogOpen} onOpenChange={setReverseCheckoutDialogOpen}>
        <AlertDialogContent data-testid="dialog-reverse-checkout">
          <AlertDialogHeader>
            <AlertDialogTitle>퇴실 취소 확인</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-3">
                  {selectedEntryForReverse?.lockerNumber}번 락카의 퇴실을 취소하시겠습니까?
                </p>
                <p className="mb-2 font-medium">퇴실 취소 시:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>락카가 다시 <span className="font-semibold">"입실중"</span> 상태로 변경됩니다</li>
                  <li>퇴실 시 기록된 추가요금이 삭제됩니다</li>
                  <li>매출 집계에서 해당 금액이 제외됩니다</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reverse">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedEntryForReverse && onReverseCheckout) {
                  onReverseCheckout(selectedEntryForReverse);
                }
                setSelectedEntryForReverse(null);
                setReverseCheckoutDialogOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-reverse"
            >
              퇴실 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Memo Dialog */}
      <Dialog open={memoDialogOpen} onOpenChange={setMemoDialogOpen}>
        <DialogContent data-testid="dialog-daily-memo">
          <DialogHeader>
            <DialogTitle>일일 메모</DialogTitle>
            <DialogDescription>
              오늘 영업과 관련된 특이사항을 메모하세요. 정산 시 함께 저장됩니다.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="특이사항을 입력하세요..."
            className="min-h-[120px]"
            data-testid="textarea-memo"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMemoDialogOpen(false)}
              data-testid="button-cancel-memo"
            >
              취소
            </Button>
            <Button onClick={handleSaveMemo} data-testid="button-save-memo">
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
