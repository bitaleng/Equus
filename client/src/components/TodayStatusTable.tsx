import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { X, Filter, FileText } from "lucide-react";
import { formatPaymentMethod } from "@/lib/utils";

interface LockerEntry {
  lockerNumber: number;
  entryTime: string | null;
  timeType: '주간' | '야간' | '추가요금';
  basePrice: number;
  option: string;
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
}

interface TodayStatusTableProps {
  entries: LockerEntry[];
  isExpanded?: boolean;
  onRowClick?: (entry: LockerEntry) => void;
}

export default function TodayStatusTable({ entries, isExpanded = false, onRowClick }: TodayStatusTableProps) {
  const [lockerNumberInput, setLockerNumberInput] = useState("");
  const [filteredLockerNumber, setFilteredLockerNumber] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [cancelledFilter, setCancelledFilter] = useState<string>("all");
  const [timeTypeFilter, setTimeTypeFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  
  // Memo state
  const [memoDialogOpen, setMemoDialogOpen] = useState(false);
  const [memo, setMemo] = useState(() => {
    return localStorage.getItem('daily_memo') || '';
  });

  const handleLockerUsageFilter = () => {
    const num = parseInt(lockerNumberInput);
    if (!isNaN(num) && num > 0) {
      setFilteredLockerNumber(num);
    }
  };

  const clearFilter = () => {
    setFilteredLockerNumber(null);
    setLockerNumberInput("");
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

  // Filter entries based on all filters
  let displayedEntries = filteredLockerNumber !== null
    ? entries.filter(e => e.lockerNumber === filteredLockerNumber)
    : entries;

  // Apply additional filters
  if (cancelledFilter === "cancelled") {
    displayedEntries = displayedEntries.filter(e => e.cancelled);
  } else if (cancelledFilter === "active") {
    displayedEntries = displayedEntries.filter(e => !e.cancelled);
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

  // Count usage for filtered locker (exclude additional fee only entries)
  const usageCount = filteredLockerNumber !== null
    ? entries.filter(e => e.lockerNumber === filteredLockerNumber && !e.cancelled && !e.additionalFeeOnly).length
    : 0;
  
  // Calculate total visitors (exclude additional fee only entries and cancelled entries)
  const totalVisitors = entries.filter(e => !e.additionalFeeOnly && !e.cancelled).length;

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex flex-col gap-3 mb-4">
        {/* 첫 번째 줄: 제목과 메모 버튼 */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">오늘 현황</h2>
          <Button
            size="sm"
            variant={memo ? "default" : "outline"}
            onClick={() => setMemoDialogOpen(true)}
            data-testid="button-daily-memo"
          >
            <FileText className="h-4 w-4 mr-1" />
            메모
          </Button>
        </div>
        
        {/* 두 번째 줄: 총 방문수와 필터링 결과 */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            총 방문: {totalVisitors}명
          </span>
          {filteredLockerNumber !== null && (
            <span className="text-sm font-semibold text-primary">
              락커 {filteredLockerNumber}번 사용: {usageCount}회
            </span>
          )}
        </div>
        
        {/* 세 번째 줄: 입력란과 버튼들 */}
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="number"
            placeholder="락커번호"
            value={lockerNumberInput}
            onChange={(e) => setLockerNumberInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLockerUsageFilter()}
            className="w-24 h-9"
            data-testid="input-locker-number-filter"
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLockerUsageFilter}
            data-testid="button-locker-usage"
          >
            락커번호조회
          </Button>
          <Button 
            variant={showFilters || hasActiveFilters ? "default" : "outline"}
            size="sm" 
            onClick={() => setShowFilters(!showFilters)}
            data-testid="button-toggle-filters"
          >
            <Filter className="h-4 w-4 mr-1" />
            필터
          </Button>
          {(filteredLockerNumber !== null || hasActiveFilters) && (
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
            </div>
            
            {/* 필터 결과 통계 */}
            {hasActiveFilters && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {cancelledFilter !== "all" && (
                  <span data-testid="text-cancelled-filter-count">
                    {cancelledFilter === "cancelled" ? "취소건" : "정상건"}: 총 {displayedEntries.length}건
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
              <TableHead className={`${isExpanded ? 'w-20 text-base' : 'w-16 text-sm'} font-bold`}>번호</TableHead>
              <TableHead className={`${isExpanded ? 'w-28 text-base' : 'w-20 text-sm'} font-bold`}>입실시간</TableHead>
              <TableHead className={`${isExpanded ? 'w-20 text-base' : 'w-16 text-sm'} font-bold`}>구분</TableHead>
              <TableHead className={`${isExpanded ? 'w-28 text-base' : 'w-20 text-sm'} font-bold`}>옵션</TableHead>
              <TableHead className={`${isExpanded ? 'w-20 text-base' : 'w-16 text-sm'} font-bold`}>지불</TableHead>
              <TableHead className={`${isExpanded ? 'w-32 text-base' : 'w-24 text-sm'} font-bold`}>최종요금</TableHead>
              <TableHead className={`${isExpanded ? 'w-24 text-base' : 'w-20 text-sm'} font-bold`}>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-sm">
                  {filteredLockerNumber !== null 
                    ? `락커 ${filteredLockerNumber}번 사용 기록이 없습니다`
                    : '오늘 방문한 손님이 없습니다'
                  }
                </TableCell>
              </TableRow>
            ) : (
              displayedEntries.map((entry, index) => {
                const statusText = entry.cancelled ? '취소' : entry.status === 'in_use' ? '입실중' : '퇴실';
                const statusColor = entry.cancelled 
                  ? 'bg-destructive/10 text-destructive' 
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
                    <TableCell className={`font-semibold ${isExpanded ? 'text-lg py-4' : 'text-base'}`}>{entry.lockerNumber}</TableCell>
                    <TableCell className={`${isExpanded ? 'text-base py-4' : 'text-sm'}`}>{entry.entryTime || '-'}</TableCell>
                    <TableCell className={`${isExpanded ? 'py-4' : ''}`}>
                      <div className="flex items-center gap-1.5">
                        <span className={`${isExpanded ? 'text-sm px-2 py-1' : 'text-xs px-1.5 py-0.5'} rounded whitespace-nowrap ${
                          entry.timeType === '주간' ? 'bg-primary/10 text-primary' : 
                          entry.timeType === '추가요금' ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' :
                          'bg-accent text-accent-foreground'
                        }`}>
                          {entry.timeType}
                        </span>
                        {entry.hasSameDayFee && entry.timeType !== '추가요금' && (
                          <span className={`${isExpanded ? 'text-sm px-2 py-1' : 'text-xs px-1.5 py-0.5'} rounded whitespace-nowrap bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300`}>
                            추가
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={`${isExpanded ? 'text-base py-4' : 'text-sm'}`}>{entry.option}</TableCell>
                    <TableCell className={`${isExpanded ? 'text-base py-4' : 'text-sm'}`}>
                      {formatPaymentMethod(entry.paymentMethod, entry.paymentCash, entry.paymentCard, entry.paymentTransfer)}
                    </TableCell>
                    <TableCell className={`font-semibold ${isExpanded ? 'text-lg py-4' : 'text-base'} ${
                      isAdditionalFeeOnly ? 'text-red-600 dark:text-red-400' : ''
                    }`}>
                      {entry.finalPrice.toLocaleString()}원
                    </TableCell>
                    <TableCell className={`${isExpanded ? 'py-4' : ''}`}>
                      <span className={`${isExpanded ? 'text-sm px-2 py-1' : 'text-xs px-1.5 py-0.5'} rounded whitespace-nowrap ${statusColor}`}>
                        {statusText}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      
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
    </div>
  );
}
