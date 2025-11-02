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
import { X, Filter } from "lucide-react";

interface LockerEntry {
  lockerNumber: number;
  entryTime: string;
  timeType: '주간' | '야간';
  basePrice: number;
  option: string;
  finalPrice: number;
  status: 'in_use' | 'checked_out' | 'cancelled';
  cancelled: boolean;
  notes?: string;
  paymentMethod?: 'card' | 'cash';
}

interface TodayStatusTableProps {
  entries: LockerEntry[];
  onRowClick?: (entry: LockerEntry) => void;
}

export default function TodayStatusTable({ entries, onRowClick }: TodayStatusTableProps) {
  const [lockerNumberInput, setLockerNumberInput] = useState("");
  const [filteredLockerNumber, setFilteredLockerNumber] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [cancelledFilter, setCancelledFilter] = useState<string>("all");
  const [timeTypeFilter, setTimeTypeFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");

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
  }

  // Count usage for filtered locker
  const usageCount = filteredLockerNumber !== null
    ? entries.filter(e => e.lockerNumber === filteredLockerNumber && !e.cancelled).length
    : 0;

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex flex-col gap-3 mb-4">
        {/* 첫 번째 줄: 제목만 */}
        <div>
          <h2 className="text-lg font-semibold">오늘 현황</h2>
        </div>
        
        {/* 두 번째 줄: 총 방문수와 필터링 결과 */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            총 방문: {entries.length}명 (사용중: {entries.filter(e => e.status === 'in_use' && !e.cancelled).length}개)
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
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto pr-2" style={{ scrollbarGutter: 'stable' }}>
        <Table>
          <TableHeader className="sticky top-0 bg-muted/50">
            <TableRow>
              <TableHead className="w-16 text-xs font-bold">번호</TableHead>
              <TableHead className="w-20 text-xs font-bold">입실시간</TableHead>
              <TableHead className="w-16 text-xs font-bold">구분</TableHead>
              <TableHead className="w-20 text-xs font-bold">옵션</TableHead>
              <TableHead className="w-16 text-xs font-bold">지불</TableHead>
              <TableHead className="w-24 text-xs font-bold">최종요금</TableHead>
              <TableHead className="w-20 text-xs font-bold">상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-xs">
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
                
                return (
                  <TableRow
                    key={index}
                    className="hover-elevate cursor-pointer"
                    onClick={() => onRowClick?.(entry)}
                    data-testid={`row-entry-${entry.lockerNumber}`}
                  >
                    <TableCell className="font-semibold text-sm">{entry.lockerNumber}</TableCell>
                    <TableCell className="text-xs">{entry.entryTime}</TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${
                        entry.timeType === '주간' ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground'
                      }`}>
                        {entry.timeType}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{entry.option}</TableCell>
                    <TableCell className="text-xs">{entry.paymentMethod === 'card' ? '카드' : '현금'}</TableCell>
                    <TableCell className="font-semibold text-sm">{entry.finalPrice.toLocaleString()}원</TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${statusColor}`}>
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
    </div>
  );
}
